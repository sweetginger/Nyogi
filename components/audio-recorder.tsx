"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square } from "lucide-react";
import { AudioProcessor } from "@/lib/audio-processor";
import { Transcript } from "@/components/transcript";
import { useUser } from "@clerk/nextjs";

interface AudioRecorderProps {
  languages?: string[];
  meetingId?: string;
  sessionStatus?: string;
  hasCompletedSession?: boolean;
  isProcessing?: boolean;
  hasFailed?: boolean;
}

export function AudioRecorder({ 
  languages = ["ko", "en"], 
  meetingId, 
  sessionStatus = "IDLE",
  hasCompletedSession = false,
  isProcessing = false,
  hasFailed = false,
}: AudioRecorderProps) {
  const { user } = useUser();
  const [permissionStatus, setPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{
    segmentId: string;
    text: string;
    tsStartMs: number;
    tsEndMs: number;
    speaker: "S1" | "S2";
    isPartial: boolean;
  }>>([]);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chunkSeqRef = useRef<number>(0);
  const totalBytesRef = useRef<number>(0);

  const primaryLang = languages[0] || "ko";
  const isKorean = primaryLang === "ko";

  const texts = {
    ko: {
      start: "시작",
      stop: "중지",
      stopping: "처리 중...",
      requesting: "마이크 권한 요청 중...",
      permissionDenied: "마이크 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.",
      permissionGuidance: "이 미팅을 시작하려면 마이크 권한이 필요합니다. '시작' 버튼을 클릭하면 브라우저에서 마이크 권한을 요청합니다.",
      listening: "듣는 중...",
      idle: "대기 중",
      alreadyRecorded: "이미 녹음 완료",
      recordingNotAllowed: "이 미팅은 1회만 녹음할 수 있어요.",
      alreadyRecordedError: "이미 녹음된 미팅입니다.",
      processingError: "오디오 처리 중 오류가 발생했습니다",
      duplicateError: "중복된 요청이 감지되었습니다. 잠시 후 다시 시도해주세요.",
      processing: "처리 중입니다...",
      uploading: "업로드 중입니다...",
      alreadyProcessed: "이미 처리 완료",
      retry: "재시도",
      failed: "처리 실패",
    },
    en: {
      start: "Start",
      stop: "Stop",
      stopping: "Processing...",
      requesting: "Requesting microphone permission...",
      permissionDenied: "Microphone permission denied. Please allow microphone access in your browser settings.",
      permissionGuidance: "Microphone permission is required to start the meeting. Click 'Start' to request microphone access from your browser.",
      listening: "Listening...",
      idle: "Idle",
      alreadyRecorded: "Already Recorded",
      recordingNotAllowed: "This meeting can only be recorded once.",
      alreadyRecordedError: "This meeting has already been recorded.",
      processingError: "An error occurred while processing audio",
      duplicateError: "Duplicate request detected. Please try again later.",
      processing: "Processing...",
      uploading: "Uploading...",
      alreadyProcessed: "Already Processed",
      retry: "Retry",
      failed: "Processing Failed",
    },
  };

  const t = texts[isKorean ? "ko" : "en"];

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stopProcessing();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopRecording();
    };
  }, []);

  const updateAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedLevel = Math.min(average / 128, 1); // Normalize to 0-1
    
    setAudioLevel(normalizedLevel);

    if (isListening) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  const startRecording = async () => {
    // Prevent recording if already completed or processing
    if (hasCompletedSession || isProcessing) {
      return;
    }

    try {
      setPermissionStatus("requesting");
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create AudioContext for audio level analysis
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);

      // Connect to WebSocket for audio streaming
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("WebSocket connected for audio streaming");
        chunkSeqRef.current = 0;
        totalBytesRef.current = 0;
        setTranscriptSegments([]); // Clear previous transcript

        // Send session.start to create RECORDING session
        if (meetingId && user?.id) {
          ws.send(
            JSON.stringify({
              type: "session.start",
              payload: {
                meetingId,
                startedBy: user.id,
              },
            })
          );
        }

        // Create audio processor for PCM conversion
        const audioProcessor = new AudioProcessor(audioContext, 16000);
        audioProcessorRef.current = audioProcessor;

        // Handle WebSocket messages for transcript updates
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === "caption.partial") {
              const segment = message.payload;
              setTranscriptSegments((prev) => {
                // Update or add partial segment
                const existingIndex = prev.findIndex(
                  (s) => s.segmentId === segment.segmentId && s.isPartial
                );
                
                if (existingIndex >= 0) {
                  // Update existing partial segment
                  const updated = [...prev];
                  updated[existingIndex] = segment;
                  return updated;
                } else {
                  // Add new partial segment
                  return [...prev, segment];
                }
              });
            } else if (message.type === "caption.final") {
              const segment = message.payload;
              setTranscriptSegments((prev) => {
                // Replace partial segment with final one
                const existingIndex = prev.findIndex(
                  (s) => s.segmentId === segment.segmentId
                );
                
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = segment;
                  return updated;
                } else {
                  return [...prev, segment];
                }
              });
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        // Start processing and streaming
        audioProcessor.startProcessing(stream, (pcmData: Int16Array) => {
          if (ws.readyState === WebSocket.OPEN) {
            // Convert Int16Array to base64 (efficient method)
            const uint8Array = new Uint8Array(pcmData.buffer);
            let binaryString = "";
            const chunkSize = 8192; // Process in chunks to avoid stack overflow
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.subarray(i, i + chunkSize);
              binaryString += String.fromCharCode(...chunk);
            }
            const base64 = btoa(binaryString);

            const chunkSeq = chunkSeqRef.current++;
            totalBytesRef.current += uint8Array.length;

            ws.send(
              JSON.stringify({
                type: "audio.chunk",
                payload: {
                  seq: chunkSeq,
                  sampleRate: audioProcessor.getSampleRate(),
                  channels: audioProcessor.getChannels(),
                  dataB64: base64,
                },
              })
            );
          }
        });
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        wsRef.current = null;
      };

      // Start MediaRecorder to capture audio chunks (for final upload)
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setPermissionStatus("granted");
      updateAudioLevel();
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      setPermissionStatus("denied");
      setError(t.permissionDenied);
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError(t.permissionDenied);
      } else {
        setError(err.message || "Failed to access microphone");
      }
    }
  };

  const stopRecording = async () => {
    try {
      setLoading(true);

      // Stop audio processor and WebSocket streaming
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stopProcessing();
        audioProcessorRef.current = null;
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log(`Stopping audio stream. Total chunks: ${chunkSeqRef.current}, Total bytes: ${totalBytesRef.current}`);
        wsRef.current.close();
        wsRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      let audioBlob: Blob | null = null;

      if (mediaRecorderRef.current && isListening) {
        // Wait for recording to stop and get the blob
        await new Promise<void>((resolve) => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = () => {
              const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
              audioBlob = blob;
              console.log("Audio recorded:", blob.size, "bytes");
              resolve();
            };
            mediaRecorderRef.current.stop();
          } else {
            resolve();
          }
        });
        mediaRecorderRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      analyserRef.current = null;
      setIsListening(false);
      setAudioLevel(0);
      chunkSeqRef.current = 0;
      totalBytesRef.current = 0;

      // Upload audio blob to server
      if (audioBlob !== null) {
        const blob: Blob = audioBlob;
        if (blob.size > 0) {
          const formData = new FormData();
          formData.append("audio", blob, `recording-${Date.now()}.webm`);

          // Use meetingId from props or extract from URL
          const currentMeetingId = meetingId || window.location.pathname.split("/meetings/")[1]?.split("/")[0];
          
          if (!currentMeetingId) {
            console.error("Meeting ID not found");
            setPermissionStatus("idle");
            return;
          }

          const response = await fetch(`/api/meetings/${currentMeetingId}/sessions`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            
            // Handle MEETING_ALREADY_RECORDED error (409)
            if (response.status === 409 && error.error === "MEETING_ALREADY_RECORDED") {
              alert(t.alreadyRecordedError);
              setPermissionStatus("idle");
              // Reload page to refresh status
              if (typeof window !== "undefined") {
                window.location.reload();
              }
              return;
            }

            // Handle PROCESSING_IN_PROGRESS error (409)
            if (response.status === 409 && error.error === "PROCESSING_IN_PROGRESS") {
              alert(t.processing);
              setPermissionStatus("idle");
              // Reload page to refresh status
              if (typeof window !== "undefined") {
                window.location.reload();
              }
              return;
            }
            
            // Handle server errors (500) with detailed message
            if (response.status === 500) {
              const errorMessage = error.details?.message || error.error || "Failed to process audio";
              const prismaErrorCode = error.details?.prismaErrorCode;
              
              let userMessage = t.processingError;
              if (prismaErrorCode === "P2002") {
                userMessage = t.duplicateError;
              } else if (error.details?.message) {
                userMessage = `${t.processingError}: ${error.details.message}`;
              }
              
              alert(userMessage);
              setPermissionStatus("idle");
              return;
            }
            
            // Handle other errors
            const errorMessage = error.error || error.message || "Failed to upload audio";
            alert(`${t.processingError}: ${errorMessage}`);
            setPermissionStatus("idle");
            return;
          }

          const result = await response.json();
          console.log("Session processed:", result);
          
          // Optionally refresh the page or show success message
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        } else {
          setPermissionStatus("idle");
        }
      } else {
        setPermissionStatus("idle");
      }

      audioChunksRef.current = [];
    } catch (error: any) {
      console.error("Error stopping recording:", error);
      alert(`Failed to process recording: ${error instanceof Error ? error.message : String(error)}`);
      setPermissionStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    // Retry by reloading the page to get fresh status
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Audio Recording</h3>
        
        {hasCompletedSession ? (
          <div className="space-y-4">
            <Button disabled className="w-full">
              <Mic className="mr-2 h-4 w-4" />
              {t.alreadyProcessed}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              {t.recordingNotAllowed}
            </p>
          </div>
        ) : isProcessing ? (
          <div className="space-y-4">
            <Button disabled className="w-full">
              <Mic className="mr-2 h-4 w-4" />
              {sessionStatus === "UPLOADING" ? t.uploading : t.processing}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              {sessionStatus === "UPLOADING" 
                ? "오디오를 업로드하고 있습니다. 잠시만 기다려주세요."
                : "오디오를 처리하고 있습니다. 잠시만 기다려주세요."}
            </p>
          </div>
        ) : hasFailed ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 mb-2">{t.failed}</p>
              <Button onClick={handleRetry} className="w-full border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                {t.retry}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {permissionStatus === "idle" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t.permissionGuidance}</p>
                <Button onClick={startRecording} className="w-full" disabled={loading}>
                  <Mic className="mr-2 h-4 w-4" />
                  {t.start}
                </Button>
              </div>
            )}

            {permissionStatus === "requesting" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t.requesting}</p>
              </div>
            )}

            {permissionStatus === "denied" && (
              <div className="space-y-4">
                <p className="text-sm text-red-600">{error}</p>
                <Button 
                  onClick={startRecording} 
                  className="w-full border border-input bg-background hover:bg-accent hover:text-accent-foreground" 
                  disabled={loading}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  {t.start}
                </Button>
              </div>
            )}

            {permissionStatus === "granted" && isListening && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="font-medium">{loading ? t.stopping : t.listening}</span>
                  </div>
                  <Button 
                    onClick={stopRecording} 
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                    disabled={loading}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    {loading ? t.stopping : t.stop}
                  </Button>
                </div>

                {/* Audio Level Meter */}
                <div className="space-y-2">
                  <div className="h-8 bg-muted rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-primary transition-all duration-75 ease-out"
                      style={{
                        width: `${audioLevel * 100}%`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      {Math.round(audioLevel * 100)}%
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Live Transcript */}
                {transcriptSegments.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2">Live Transcript</h4>
                    <Transcript segments={transcriptSegments} />
                  </div>
                )}
              </div>
            )}

            {permissionStatus === "granted" && !isListening && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {loading ? t.stopping : t.idle}
                </p>
                <Button onClick={startRecording} className="w-full" disabled={loading}>
                  <Mic className="mr-2 h-4 w-4" />
                  {loading ? t.stopping : t.start}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}




