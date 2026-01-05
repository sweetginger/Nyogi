"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface Caption {
  id: string;
  seq: number;
  speaker: string;
  tsStartMs: number;
  tsEndMs: number;
  srcLang: string;
  srcText: string;
  tgtLang: string;
  tgtText: string;
}

interface MeetingTranscriptProps {
  captions: Caption[];
}

export function MeetingTranscript({ captions }: MeetingTranscriptProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyAll = async () => {
    const transcriptText = captions
      .map((caption) => {
        const timeStr = `${formatTime(caption.tsStartMs)} - ${formatTime(caption.tsEndMs)}`;
        let line = `[${timeStr}] ${caption.speaker}: ${caption.srcText}`;
        if (caption.tgtText && caption.tgtText !== caption.srcText) {
          line += `\n  (${caption.tgtLang === "ko" ? "한국어" : "English"}) ${caption.tgtText}`;
        }
        return line;
      })
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  if (captions.length === 0) {
    return (
      <Accordion>
        <AccordionItem>
          <AccordionTrigger onClick={() => setIsOpen(!isOpen)} isOpen={isOpen}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Transcript</span>
              <span className="text-xs text-muted-foreground">(0 captions)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent isOpen={isOpen}>
            <p className="text-sm text-muted-foreground">No transcript available yet.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <Accordion>
      <AccordionItem>
        <AccordionTrigger onClick={() => setIsOpen(!isOpen)} isOpen={isOpen}>
          <div className="flex items-center justify-between w-full pr-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Transcript</span>
              <span className="text-xs text-muted-foreground">({captions.length} captions)</span>
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                한국어 전사
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyAll();
              }}
              className="h-7 gap-1.5 text-xs"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy all
                </>
              )}
            </Button>
          </div>
        </AccordionTrigger>
        <AccordionContent isOpen={isOpen}>
          <div className="space-y-3">
            <div className="mb-4 space-y-1">
              <p className="text-xs text-muted-foreground italic">
                This transcript was automatically generated
              </p>
              <p className="text-xs text-muted-foreground">
                * Phase 1 기준으로 한국어 전사가 표시됩니다. 각 문장은 시간순으로 정렬되어 있습니다.
              </p>
            </div>
            {captions.map((caption) => (
              <div
                key={caption.id}
                className="border-l-2 border-primary/30 pl-4 py-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                      {caption.speaker}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">
                        {formatTime(caption.tsStartMs)} - {formatTime(caption.tsEndMs)}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">
                        {caption.srcLang === "ko" ? "한국어" : "English"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed mb-1">{caption.srcText}</p>
                    {caption.tgtText && caption.tgtText !== caption.srcText && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        <span className="text-xs font-medium">
                          {caption.tgtLang === "ko" ? "한국어" : "English"}:
                        </span>{" "}
                        {caption.tgtText}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

