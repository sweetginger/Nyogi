"use client";

import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface SessionStatusCardProps {
  status: "PROCESSING" | "FAILED";
  message: string;
  meetingId?: string;
}

export function SessionStatusCard({ status, message, meetingId }: SessionStatusCardProps) {
  const router = useRouter();

  const handleRetry = () => {
    // Phase 1: 버튼만 표시, 실제 재시도는 비활성화
    // TODO: 재시도 로직 구현 (Phase 2)
    console.log("Retry clicked for meeting:", meetingId);
    // For now, just refresh the page
    router.refresh();
  };

  if (status === "PROCESSING") {
    return (
      <div className="border border-primary/20 rounded-lg p-6 bg-primary/5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              전사 및 요약 생성 중입니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="border border-destructive/20 rounded-lg p-6 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground mb-2">{message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              재시도
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

