"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface MeetingSummaryProps {
  summaries: Array<{
    id: string;
    lang: string;
    content: string;
  }>;
}

export function MeetingSummary({ summaries }: MeetingSummaryProps) {
  const [copied, setCopied] = useState(false);

  if (summaries.length === 0) {
    return null;
  }

  // Find Korean summary first, then English
  const koSummary = summaries.find((s) => s.lang === "ko");
  const enSummary = summaries.find((s) => s.lang === "en");
  const primarySummary = koSummary || enSummary || summaries[0];

  const handleCopy = async () => {
    if (!primarySummary) return;

    // Combine all summaries if multiple exist
    let textToCopy = primarySummary.content;
    if (enSummary && koSummary && enSummary.id !== primarySummary?.id) {
      textToCopy = `${primarySummary.content}\n\n---\n\n${enSummary.content}`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Meeting Summary</h2>
          <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full">
            AI-generated summary
          </span>
          {primarySummary && (
            <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-full">
              {primarySummary.lang === "ko" ? "한국어" : "English"}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-8 gap-2"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      {primarySummary && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{primarySummary.content}</p>
      )}
      {enSummary && koSummary && enSummary.id !== primarySummary?.id && (
        <div className="mt-4 pt-4 border-t border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-medium">English Summary</h3>
            <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-full">English</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{enSummary.content}</p>
        </div>
      )}
    </div>
  );
}

