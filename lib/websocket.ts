export class MeetingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(url?: string) {
    this.url = url || process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.ws = null;
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("Error parsing message:", error);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: any) {
    // Override this method in subclasses or use callbacks
    console.log("Received message:", message);
  }

  send(type: string, payload?: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.ws.send(
      JSON.stringify({
        type,
        payload,
      })
    );
  }

  startSession(meetingId: string, startedBy: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const messageHandler = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "session.start.ack") {
            this.ws?.removeEventListener("message", messageHandler);
            resolve(message.payload.sessionId);
          } else if (message.type === "error") {
            this.ws?.removeEventListener("message", messageHandler);
            reject(new Error(message.payload.message));
          }
        } catch (error) {
          this.ws?.removeEventListener("message", messageHandler);
          reject(error);
        }
      };

      this.ws.addEventListener("message", messageHandler);
      this.send("session.start", { meetingId, startedBy });

      // Timeout after 10 seconds
      setTimeout(() => {
        this.ws?.removeEventListener("message", messageHandler);
        reject(new Error("Session start timeout"));
      }, 10000);
    });
  }

  endSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const messageHandler = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "session.end.ack") {
            this.ws?.removeEventListener("message", messageHandler);
            resolve();
          } else if (message.type === "error") {
            this.ws?.removeEventListener("message", messageHandler);
            reject(new Error(message.payload.message));
          }
        } catch (error) {
          this.ws?.removeEventListener("message", messageHandler);
          reject(error);
        }
      };

      this.ws.addEventListener("message", messageHandler);
      this.send("session.end", { sessionId });

      // Timeout after 10 seconds
      setTimeout(() => {
        this.ws?.removeEventListener("message", messageHandler);
        reject(new Error("Session end timeout"));
      }, 10000);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

