import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "@prisma/client";
import { OpenAISTTProcessor } from "./openai-stt";

const prisma = new PrismaClient();

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
const wss = new WebSocketServer({ port: PORT });

interface WSMessage {
  type: string;
  payload?: any;
}

interface SessionStartPayload {
  meetingId: string;
  startedBy: string;
}

interface SessionEndPayload {
  sessionId: string;
}

interface AudioChunkPayload {
  seq: number;
  sampleRate: number;
  channels: number;
  dataB64: string;
}

wss.on("connection", (ws: WebSocket) => {
  console.log("New WebSocket connection established");
  
  // Track audio streaming state per connection
  let expectedSeq = 0;
  let totalBytesReceived = 0;
  let sttProcessor: OpenAISTTProcessor | null = null;
  let sessionId: string | null = null;

  ws.on("message", async (data: Buffer) => {
    try {
      const message: WSMessage = JSON.parse(data.toString());
      console.log("Received message:", message.type);

      switch (message.type) {
        case "session.start": {
          const { meetingId, startedBy } = message.payload as SessionStartPayload;

          if (!meetingId || !startedBy) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Missing meetingId or startedBy" },
              })
            );
            return;
          }

          // Verify meeting exists
          const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
          });

          if (!meeting) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Meeting not found" },
              })
            );
            return;
          }

          // Check if session already exists and is in progress
          const existingSession = await prisma.meetingSession.findFirst({
            where: { meetingId },
            orderBy: { createdAt: "desc" },
          });

          let session;
          if (existingSession && (existingSession.status === "RECORDING" || existingSession.status === "UPLOADING" || existingSession.status === "PROCESSING")) {
            // Session already in progress, return existing
            session = existingSession;
          } else if (existingSession && existingSession.status === "COMPLETED") {
            // Already completed, return error
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Meeting already processed" },
              })
            );
            return;
          } else {
            // Create new session with RECORDING status
            session = await prisma.meetingSession.create({
              data: {
                meetingId,
                startedBy,
                status: "RECORDING",
              },
            });
          }

          sessionId = session.id;
          const currentMeetingId = meetingId; // Capture for closure

          // Initialize STT processor
          sttProcessor = new OpenAISTTProcessor(
            // onPartial callback
            (segment) => {
              ws.send(
                JSON.stringify({
                  type: "caption.partial",
                  payload: segment,
                })
              );
            },
            // onFinal callback
            async (segment) => {
              ws.send(
                JSON.stringify({
                  type: "caption.final",
                  payload: segment,
                })
              );

              // Persist final segment to database
              if (sessionId && currentMeetingId) {
                try {
                  // Extract seq number from segmentId (format: "seg-0", "seg-1", etc.)
                  const seqMatch = segment.segmentId.match(/seg-(\d+)/);
                  const seq = seqMatch ? parseInt(seqMatch[1]) + 1 : 1; // +1 because seq starts from 1 in DB
                  
                  await prisma.captionFinal.create({
                    data: {
                      meetingId: currentMeetingId,
                      seq,
                      speaker: segment.speaker,
                      tsStartMs: segment.tsStartMs,
                      tsEndMs: segment.tsEndMs,
                      srcLang: "ko", // Will be detected by OpenAI, placeholder for now
                      srcText: segment.text,
                      tgtLang: "en", // Placeholder, will be translated later
                      tgtText: segment.text, // Placeholder
                    },
                  });
                } catch (error) {
                  console.error("Error persisting caption:", error);
                  // Continue even if persistence fails
                }
              }
            }
          );

          // Send ack with sessionId
          ws.send(
            JSON.stringify({
              type: "session.start.ack",
              payload: { sessionId: session.id },
            })
          );

          console.log(`Session started: ${session.id} for meeting ${meetingId}`);
          break;
        }

        case "session.end": {
          const { sessionId } = message.payload as SessionEndPayload;

          if (!sessionId) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Missing sessionId" },
              })
            );
            return;
          }

          // Update session
          const session = await prisma.meetingSession.update({
            where: { id: sessionId },
            data: {
              status: "ended",
              endedAt: new Date(),
            },
          });

          // Send ack
          ws.send(
            JSON.stringify({
              type: "session.end.ack",
              payload: { sessionId: session.id },
            })
          );

          console.log(`Session ended: ${sessionId}`);
          break;
        }

        case "audio.chunk": {
          const { seq, sampleRate, channels, dataB64 } = message.payload as AudioChunkPayload;

          // Validate payload
          if (
            typeof seq !== "number" ||
            typeof sampleRate !== "number" ||
            typeof channels !== "number" ||
            typeof dataB64 !== "string"
          ) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Invalid audio.chunk payload" },
              })
            );
            return;
          }

          // Validate sequence number
          if (seq !== expectedSeq) {
            console.warn(
              `Sequence mismatch: expected ${expectedSeq}, got ${seq}`
            );
            // Continue processing but log the mismatch
          }

          // Decode base64 and count bytes
          try {
            const binaryString = Buffer.from(dataB64, "base64");
            const bytesReceived = binaryString.length;
            totalBytesReceived += bytesReceived;
            expectedSeq = seq + 1;

            // Send audio chunk to STT processor
            if (sttProcessor) {
              sttProcessor.addAudioChunk(binaryString);
            }

            // Log chunk info (every 100 chunks to avoid spam)
            if (seq % 100 === 0) {
              console.log(
                `Audio chunk seq=${seq}, sampleRate=${sampleRate}, channels=${channels}, bytes=${bytesReceived}, totalBytes=${totalBytesReceived}`
              );
            }
          } catch (error) {
            console.error("Error processing audio chunk:", error);
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "Failed to decode audio chunk" },
              })
            );
            return;
          }

          break;
        }

        default:
          ws.send(
            JSON.stringify({
              type: "error",
              payload: { message: `Unknown message type: ${message.type}` },
            })
          );
      }
    } catch (error: any) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { message: error.message || "Internal server error" },
        })
      );
    }
  });

  ws.on("close", async () => {
    console.log(
      `WebSocket connection closed. Total audio bytes received: ${totalBytesReceived}, Last seq: ${expectedSeq - 1}`
    );
    
    // Flush remaining audio and finalize segments
    if (sttProcessor) {
      await sttProcessor.flush();
      sttProcessor = null;
    }
    
    expectedSeq = 0;
    totalBytesReceived = 0;
    sessionId = null;
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: "connection.established",
      payload: { message: "WebSocket connection established" },
    })
  );
});

console.log(`WebSocket server listening on port ${PORT}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down WebSocket server...");
  wss.close(() => {
    console.log("WebSocket server closed");
    prisma.$disconnect();
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.log("Shutting down WebSocket server...");
  wss.close(() => {
    console.log("WebSocket server closed");
    prisma.$disconnect();
    process.exit(0);
  });
});

