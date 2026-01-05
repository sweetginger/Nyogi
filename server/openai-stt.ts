import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TranscriptSegment {
  segmentId: string;
  text: string;
  tsStartMs: number;
  tsEndMs: number;
  speaker: "S1" | "S2";
  isPartial: boolean;
}

export class OpenAISTTProcessor {
  private audioBuffer: Buffer[] = [];
  private sessionStartTime: number;
  private segmentCounter: number = 0;
  private lastProcessTime: number = 0;
  private processInterval: number = 2000; // Process every 2 seconds
  private finalizeTimeout: NodeJS.Timeout | null = null;
  private currentSegment: TranscriptSegment | null = null;
  private onPartial: (segment: TranscriptSegment) => void;
  private onFinal: (segment: TranscriptSegment) => void;

  constructor(
    onPartial: (segment: TranscriptSegment) => void,
    onFinal: (segment: TranscriptSegment) => void
  ) {
    this.sessionStartTime = Date.now();
    this.onPartial = onPartial;
    this.onFinal = onFinal;
  }

  addAudioChunk(pcmData: Buffer): void {
    this.audioBuffer.push(pcmData);
    this.lastProcessTime = Date.now();

    // Process if enough time has passed
    if (this.shouldProcess()) {
      this.processAudio();
    }

    // Reset finalize timeout
    if (this.finalizeTimeout) {
      clearTimeout(this.finalizeTimeout);
    }

    // Finalize current segment if no audio for 1.5 seconds
    this.finalizeTimeout = setTimeout(() => {
      this.finalizeCurrentSegment();
    }, 1500);
  }

  private shouldProcess(): boolean {
    return Date.now() - this.lastProcessTime >= this.processInterval;
  }

  private pcmToWav(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
    const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);
    
    // WAV header
    wavBuffer.write("RIFF", 0);
    wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
    wavBuffer.write("WAVE", 8);
    wavBuffer.write("fmt ", 12);
    wavBuffer.writeUInt32LE(16, 16); // fmt chunk size
    wavBuffer.writeUInt16LE(1, 20); // audio format (PCM)
    wavBuffer.writeUInt16LE(channels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
    wavBuffer.writeUInt16LE(channels * 2, 32); // block align
    wavBuffer.writeUInt16LE(16, 34); // bits per sample
    wavBuffer.write("data", 36);
    wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
    
    // Copy PCM data
    pcmBuffer.copy(wavBuffer, 44);
    
    return wavBuffer;
  }

  private async processAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      return;
    }

    try {
      // Combine buffered audio
      const combinedBuffer = Buffer.concat(this.audioBuffer);
      this.audioBuffer = []; // Clear buffer

      // Convert PCM to WAV format (OpenAI Whisper requires WAV, MP3, etc.)
      const wavBuffer = this.pcmToWav(combinedBuffer, 16000, 1);

      // Create temporary file for OpenAI API (Node.js doesn't have File constructor)
      const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);
      fs.writeFileSync(tempFilePath, wavBuffer);

      try {
        // Use OpenAI Whisper API with file stream
        // Note: OpenAI Whisper doesn't support streaming directly, but we can call it frequently
        // Only include language parameter if it's a valid non-empty string (auto-detect if not provided)
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath) as any,
          model: "whisper-1",
          // Don't include language field to enable auto-detection
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        });

        if (transcription.segments && transcription.segments.length > 0) {
          const segment = transcription.segments[0];
          const segmentId = `seg-${this.segmentCounter++}`;
          const tsStartMs = Math.round(segment.start * 1000);
          const tsEndMs = Math.round(segment.end * 1000);

          // Update or create partial segment
          this.currentSegment = {
            segmentId,
            text: segment.text,
            tsStartMs,
            tsEndMs,
            speaker: "S1", // Default speaker
            isPartial: true,
          };

          this.onPartial(this.currentSegment);
        }
      } finally {
        // Clean up temporary file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (unlinkError) {
          console.error("Error deleting temp file:", unlinkError);
        }
      }
    } catch (error) {
      console.error("Error processing audio with OpenAI:", error);
    }
  }

  private finalizeCurrentSegment(): void {
    if (this.currentSegment && this.currentSegment.isPartial) {
      this.currentSegment.isPartial = false;
      this.onFinal(this.currentSegment);
      this.currentSegment = null;
    }
  }

  async flush(): Promise<void> {
    // Process remaining audio
    if (this.audioBuffer.length > 0) {
      await this.processAudio();
    }

    // Finalize current segment
    this.finalizeCurrentSegment();

    if (this.finalizeTimeout) {
      clearTimeout(this.finalizeTimeout);
    }
  }
}

