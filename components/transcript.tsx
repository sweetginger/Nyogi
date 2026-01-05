"use client";

import { useState, useEffect, useRef } from "react";

interface TranscriptSegment {
  segmentId: string;
  text: string;
  tsStartMs: number;
  tsEndMs: number;
  speaker: "S1" | "S2";
  isPartial: boolean;
}

interface TranscriptProps {
  segments: TranscriptSegment[];
}

export function Transcript({ segments }: TranscriptProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new segments are added
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [segments]);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-2">
      <div
        ref={listRef}
        className="max-h-96 overflow-y-auto space-y-2 p-4 border rounded-lg bg-muted/50"
      >
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Transcript will appear here as you speak...
          </p>
        ) : (
          segments.map((segment) => (
            <div
              key={segment.segmentId}
              className={`p-3 rounded-lg ${
                segment.isPartial
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-background border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {segment.speaker}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(segment.tsStartMs)} - {formatTime(segment.tsEndMs)}
                    </span>
                    {segment.isPartial && (
                      <span className="text-xs text-primary font-medium animate-pulse">
                        (transcribing...)
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{segment.text}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

