import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TranscriptionResult {
  text: string;
  language?: string; // Detected language from OpenAI
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    language?: string; // Segment-level language if available
  }>;
}

/**
 * Transcribe audio file using OpenAI Whisper API with auto language detection
 * @param audioBuffer - Audio file buffer (webm, mp3, wav, etc.)
 * @param filename - Original filename
 * @returns Transcription result with text, language, and segments
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  // Create temporary file for OpenAI API
  const tempFilePath = path.join(
    os.tmpdir(),
    `transcribe-${Date.now()}-${Math.random().toString(36).substring(7)}.${filename.split('.').pop() || 'webm'}`
  );

  try {
    // Write audio buffer to temporary file
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Transcribe using OpenAI Whisper API with auto language detection
    // Do not include language parameter to enable auto-detection
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath) as any,
      model: "whisper-1",
      // No language parameter - auto-detect
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    return {
      text: transcription.text,
      language: transcription.language || undefined, // Overall detected language
      segments: transcription.segments?.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        // Note: OpenAI Whisper API doesn't provide segment-level language in verbose_json
        // We'll detect language per segment using text analysis
      })),
    };
  } finally {
    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (unlinkError) {
      console.error("Error deleting temp file:", unlinkError);
    }
  }
}

/**
 * Split text into sentences
 * Handles both Korean and English sentence endings
 * Preserves all sentences including English ones
 */
export function splitIntoSentences(text: string): string[] {
  // Match sentences ending with . ! ? followed by whitespace or end of string
  // This regex captures the sentence including the punctuation
  const sentenceRegex = /[^.!?]*[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentenceRegex);
  
  if (!matches || matches.length === 0) {
    // If no sentence endings found, return the whole text as a single sentence
    return text.trim() ? [text.trim()] : [];
  }

  // Clean up and filter sentences
  const sentences = matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If we have sentences, return them
  if (sentences.length > 0) {
    return sentences;
  }

  // Fallback: if no valid sentences found, return the original text
  return text.trim() ? [text.trim()] : [];
}

/**
 * Detect language of a text segment (simple heuristic)
 * Returns "ko" for Korean, "en" for English, or "unknown"
 */
export function detectLanguage(text: string): "ko" | "en" | "unknown" {
  // Simple heuristic: check for Korean characters (Hangul)
  const koreanRegex = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
  const hasKorean = koreanRegex.test(text);
  
  // If contains Korean characters, likely Korean
  if (hasKorean) {
    return "ko";
  }
  
  // Check if it's mostly English (Latin characters, common English words)
  const englishRegex = /^[a-zA-Z0-9\s.,!?'"-]+$/;
  if (englishRegex.test(text) && text.trim().length > 0) {
    return "en";
  }
  
  return "unknown";
}

/**
 * Translate text between Korean and English using OpenAI
 */
export async function translateText(
  text: string,
  sourceLang: "ko" | "en",
  targetLang: "ko" | "en"
): Promise<string> {
  if (sourceLang === targetLang) {
    return text; // No translation needed
  }

  const systemPrompt =
    sourceLang === "ko"
      ? "You are a professional translator. Translate the following Korean text to English. Provide only the translation, no explanations."
      : "You are a professional translator. Translate the following English text to Korean. Provide only the translation, no explanations.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  return completion.choices[0]?.message?.content?.trim() || text;
}

/**
 * Generate summary using OpenAI
 */
export async function generateSummary(
  transcriptText: string,
  language: "ko" | "en"
): Promise<string> {
  const systemPrompt =
    language === "ko"
      ? "다음 회의록을 간결하게 요약해주세요. 주요 내용과 결정사항을 포함하세요."
      : "Please summarize the following meeting transcript concisely. Include key points and decisions.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcriptText },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return completion.choices[0]?.message?.content || "";
}

