// Audio processor to convert MediaStream to PCM s16le
export class AudioProcessor {
  private audioContext: AudioContext;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sampleRate: number;
  private channels: number = 1; // Mono
  private bufferSize: number = 4096;

  constructor(audioContext: AudioContext, sampleRate: number = 16000) {
    this.audioContext = audioContext;
    this.sampleRate = sampleRate;
  }

  startProcessing(
    stream: MediaStream,
    onChunk: (pcmData: Int16Array) => void
  ): void {
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Create script processor for audio processing
    this.scriptProcessor = this.audioContext.createScriptProcessor(
      this.bufferSize,
      this.channels,
      this.channels
    );

    this.scriptProcessor.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0); // Mono, so use channel 0

      // Resample if needed (browser sample rate might be 48kHz)
      let processedData: Float32Array;
      if (this.audioContext.sampleRate !== this.sampleRate) {
        processedData = this.resample(
          inputData,
          this.audioContext.sampleRate,
          this.sampleRate
        );
      } else {
        processedData = inputData;
      }

      // Convert Float32Array (-1.0 to 1.0) to Int16Array (PCM s16le)
      const pcmData = this.floatTo16BitPCM(processedData);
      onChunk(pcmData);
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  stopProcessing(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp value to [-1, 1] and convert to 16-bit integer
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  private resample(
    input: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): Float32Array {
    if (inputSampleRate === outputSampleRate) {
      return input;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const inputIndexFloor = Math.floor(inputIndex);
      const inputIndexCeil = Math.min(inputIndexFloor + 1, input.length - 1);
      const t = inputIndex - inputIndexFloor;

      // Linear interpolation
      output[i] =
        input[inputIndexFloor] * (1 - t) + input[inputIndexCeil] * t;
    }

    return output;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  getChannels(): number {
    return this.channels;
  }
}

