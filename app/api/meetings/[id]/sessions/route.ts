import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, SessionStatus } from "@prisma/client";
import { transcribeAudio, splitIntoSentences, generateSummary, detectLanguage, translateText } from "@/lib/openai-transcribe";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Verify meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: params.id },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Check existing session status for idempotency
    const existingSession = await prisma.meetingSession.findFirst({
      where: { meetingId: params.id },
      orderBy: { createdAt: "desc" },
    });

    let session;
    if (existingSession) {
      const status = existingSession.status as string;
      if (status === "COMPLETED") {
        // Return existing completed session info
        return NextResponse.json(
          {
            error: "MEETING_ALREADY_RECORDED",
            sessionId: existingSession.id,
            message: "Meeting already processed",
          },
          { status: 409 }
        );
      }

      if (status === "PROCESSING" || status === "UPLOADING" || status === "RECORDING") {
        // Return in-progress status
        return NextResponse.json(
          {
            error: "PROCESSING_IN_PROGRESS",
            sessionId: existingSession.id,
            status: existingSession.status,
            message: "Processing is already in progress",
          },
          { status: 409 }
        );
      }

      // If FAILED or RECORDING (stale), allow retry by updating the existing session
      if (status === "FAILED" || status === "RECORDING") {
        // Update existing session to UPLOADING for retry
        session = await prisma.meetingSession.update({
          where: { id: existingSession.id },
          data: {
            status: "UPLOADING" as any,
            startedAt: new Date(),
            endedAt: null,
          },
        });
        // Continue with processing using existing session
      } else {
        // IDLE or other states - create new session
        session = await prisma.meetingSession.create({
          data: {
            meetingId: params.id,
            startedBy: userId,
            status: "UPLOADING" as any,
          },
        });
      }
    } else {
      // No existing session, create new one
      session = await prisma.meetingSession.create({
        data: {
          meetingId: params.id,
          startedBy: userId,
          status: "UPLOADING" as any,
        },
      });
    }

    // Get audio file from FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Session creation/update is handled above in the existingSession check
    // session variable is already set

    // Update session status to PROCESSING
    await prisma.meetingSession.update({
      where: { id: session.id },
      data: { status: "PROCESSING" as any },
    });

    // Transcribe audio using OpenAI Whisper
    let transcriptionResult;
    let sentences: string[] = [];
    
    try {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      transcriptionResult = await transcribeAudio(audioBuffer, audioFile.name);

      // Log transcription result (one line, truncated if too long)
      const transcriptPreview =
        transcriptionResult.text.length > 200
          ? transcriptionResult.text.substring(0, 200) + "..."
          : transcriptionResult.text;
      console.log(`[Transcription] ${transcriptPreview}`);

      // Split transcription into sentences
      sentences = splitIntoSentences(transcriptionResult.text);
    } catch (transcriptionError: any) {
      console.error("Transcription error:", transcriptionError);

      // Update session to FAILED
      await prisma.meetingSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED" as any,
          endedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          error: "TRANSCRIPTION_FAILED",
          details: {
            message: transcriptionError.message || "Failed to transcribe audio",
            type: transcriptionError.constructor.name,
          },
        },
        { status: 500 }
      );
    }

    // Get target languages from meeting (for translation)
    const targetLanguages = meeting.languages.length >= 2 
      ? [meeting.languages[0], meeting.languages[1]] 
      : meeting.languages[0] === "ko" 
        ? ["ko", "en"] 
        : ["en", "ko"];

    // Create CaptionFinal records from sentences with language detection and translation
    const captionDataPromises = sentences.map(async (sentence, index) => {
      // Use segment timestamps if available, otherwise estimate
      let tsStartMs = 0;
      let tsEndMs = 0;

      if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
        // Find the segment that contains this sentence
        const segmentIndex = Math.min(
          index,
          transcriptionResult.segments.length - 1
        );
        const segment = transcriptionResult.segments[segmentIndex];
        tsStartMs = Math.round(segment.start * 1000);
        tsEndMs = Math.round(segment.end * 1000);
      } else {
        // Estimate timestamps based on sentence position
        const totalDuration = 60000; // Assume 1 minute default
        const durationPerSentence = totalDuration / sentences.length;
        tsStartMs = Math.round(index * durationPerSentence);
        tsEndMs = Math.round((index + 1) * durationPerSentence);
      }

      // Detect language for this sentence
      const detectedLang = detectLanguage(sentence);
      const srcLang = detectedLang !== "unknown" ? detectedLang : (transcriptionResult.language === "ko" ? "ko" : "en");
      
      // Determine target language (opposite of source)
      const tgtLang = srcLang === "ko" ? "en" : "ko";

      // Translate to target language
      let tgtText = sentence; // Fallback to original if translation fails
      try {
        if (srcLang !== tgtLang) {
          tgtText = await translateText(sentence, srcLang, tgtLang);
        }
      } catch (translationError) {
        console.error(`Translation error for sentence ${index + 1}:`, translationError);
        // Keep original text as fallback
      }

      return {
        meetingId: params.id,
        seq: index + 1,
        speaker: "S1" as const, // Default speaker
        tsStartMs,
        tsEndMs,
        srcLang,
        srcText: sentence,
        tgtLang,
        tgtText,
      };
    });

    // Wait for all translations to complete
    const captionData = await Promise.all(captionDataPromises);

    // Create CaptionFinal records within transaction to ensure idempotency
    await prisma.$transaction(async (tx) => {
      // Delete existing captions for this meeting to avoid duplicates
      await tx.captionFinal.deleteMany({
        where: { meetingId: params.id },
      });

      // Create new captions
      await tx.captionFinal.createMany({
        data: captionData,
      });
    });

    // Generate summaries for both languages (with idempotency)
    const summaryPromises = meeting.languages.map(async (lang) => {
      try {
        const summaryText = await generateSummary(
          transcriptionResult.text,
          lang as "ko" | "en"
        );

        const existingSummary = await prisma.summary.findFirst({
          where: {
            meetingId: params.id,
            lang,
          },
        });

        if (existingSummary) {
          await prisma.summary.update({
            where: { id: existingSummary.id },
            data: { content: summaryText },
          });
        } else {
          await prisma.summary.create({
            data: {
              meetingId: params.id,
              lang,
              content: summaryText,
            },
          });
        }
      } catch (summaryError) {
        console.error(`Error generating summary for ${lang}:`, summaryError);
        // Continue with other languages even if one fails
      }
    });

    await Promise.all(summaryPromises);

    // Update session to COMPLETED after successful processing
    await prisma.meetingSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED" as any,
        endedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        message: "Session processed successfully",
        transcriptsCount: sentences.length,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Log full error stack
    console.error("Error processing session:", error);
    console.error("Error stack:", error.stack);
    
    // Try to update session status to FAILED if session exists
    try {
      // Get the most recent non-COMPLETED session for this meeting
      const activeSession = await prisma.meetingSession.findFirst({
        where: {
          meetingId: params.id,
          status: {
            not: "COMPLETED" as any,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (activeSession) {
        await prisma.meetingSession.update({
          where: { id: activeSession.id },
          data: {
            status: "FAILED" as any,
            endedAt: new Date(),
          },
        });
      }
    } catch (updateError) {
      console.error("Failed to update session status to FAILED:", updateError);
    }
    
    // Extract Prisma error code if available
    let prismaErrorCode: string | undefined;
    let errorMessage = error.message || "Unknown error";
    let errorDetails: any = {};

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      prismaErrorCode = error.code;
      errorDetails = {
        code: error.code,
        meta: error.meta,
      };
      console.error("Prisma error code:", error.code);
      console.error("Prisma error meta:", error.meta);
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      prismaErrorCode = "VALIDATION_ERROR";
      errorDetails = {
        message: error.message,
      };
      console.error("Prisma validation error:", error.message);
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      prismaErrorCode = "INITIALIZATION_ERROR";
      errorDetails = {
        message: error.message,
      };
      console.error("Prisma initialization error:", error.message);
    } else if (error instanceof Prisma.PrismaClientRustPanicError) {
      prismaErrorCode = "RUST_PANIC_ERROR";
      errorDetails = {
        message: error.message,
      };
      console.error("Prisma rust panic error:", error.message);
    }

    return NextResponse.json(
      {
        error: "Failed to process session",
        details: {
          message: errorMessage,
          ...(prismaErrorCode && { prismaErrorCode }),
          ...errorDetails,
        },
      },
      { status: 500 }
    );
  }
}

