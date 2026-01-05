import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MeetingAccessEditor } from "@/components/meeting-access-editor";
import { AudioRecorder } from "@/components/audio-recorder";
import { MeetingSummary } from "@/components/meeting-summary";
import { MeetingTranscript } from "@/components/meeting-transcript";
import { SessionStatusCard } from "@/components/session-status-card";

interface MeetingDetailPageProps {
  params: {
    id: string;
  };
}

export default async function MeetingDetailPage({
  params,
}: MeetingDetailPageProps) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: {
      access: true,
      summaries: {
        orderBy: { createdAt: "desc" },
      },
      captions: {
        orderBy: { seq: "asc" },
      },
    },
  });

  if (!meeting) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Meeting Not Found</h1>
        <p className="text-muted-foreground">
          The meeting you are looking for does not exist.
        </p>
      </div>
    );
  }

  // Get the latest session status for this meeting
  const latestSession = await prisma.meetingSession.findFirst({
    where: { meetingId: params.id },
    orderBy: { createdAt: "desc" },
  });

  const sessionStatus: string = latestSession?.status || "IDLE";
  const hasCompletedSession = sessionStatus === "COMPLETED";
  const isProcessing = sessionStatus === "PROCESSING" || sessionStatus === "UPLOADING" || sessionStatus === "RECORDING";
  const hasFailed = sessionStatus === "FAILED";

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const userEmail = user?.emailAddresses[0]?.emailAddress ?? null;

  // 접근 권한 확인
  if (meeting.access?.mode === "allowlist") {
    if (!userEmail) {
      redirect(
        "/sign-in?redirect_url=" + encodeURIComponent(`/meetings/${params.id}`)
      );
    }
    if (!meeting.access.allowEmails.includes(userEmail)) {
      return (
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have permission to access this meeting. This meeting is
            restricted to specific users.
          </p>
        </div>
      );
    }
  }

  const isOwner = userId === meeting.createdBy;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">{meeting.title}</h1>
      <div className="mb-6 flex items-center gap-4">
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
            meeting.access?.mode === "public"
              ? "bg-green-100 text-green-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {meeting.access?.mode === "public" ? "Public" : "Allowlist"}
        </span>
        <span className="text-sm text-muted-foreground">
          {meeting.type}
        </span>
      </div>
      <div className="max-w-4xl space-y-6">
        {/* Session Status Card - Shows processing/error states */}
        {isProcessing && (
          <SessionStatusCard 
            status="PROCESSING" 
            message="미팅 결과를 처리하고 있습니다. 잠시만 기다려주세요..."
          />
        )}
        {hasFailed && (
          <SessionStatusCard 
            status="FAILED" 
            message="처리에 실패했습니다. 다시 시도해주세요."
            meetingId={meeting.id}
          />
        )}

        {/* Summary Card - Top Priority */}
        {hasCompletedSession && meeting.summaries && meeting.summaries.length > 0 && (
          <MeetingSummary summaries={meeting.summaries} />
        )}

        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Meeting Details</h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Type:</span> {meeting.type}
            </p>
            {meeting.meetUrl && (
              <p>
                <span className="font-medium">URL:</span>{" "}
                <a
                  href={meeting.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {meeting.meetUrl}
                </a>
              </p>
            )}
            <p>
              <span className="font-medium">Languages:</span>{" "}
              {meeting.languages.join(", ")}
            </p>
            <p>
              <span className="font-medium">Invite Mode:</span>{" "}
              {meeting.inviteMode}
            </p>
            {meeting.scheduledAt && (
              <p>
                <span className="font-medium">Scheduled At:</span>{" "}
                {new Date(meeting.scheduledAt).toLocaleString()}
              </p>
            )}
            <p>
              <span className="font-medium">Created:</span>{" "}
              {new Date(meeting.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {meeting.type === "in_person" && (
          <div className="border rounded-lg p-6">
            <AudioRecorder 
              languages={meeting.languages} 
              meetingId={meeting.id}
              sessionStatus={sessionStatus}
              hasCompletedSession={hasCompletedSession}
              isProcessing={isProcessing}
              hasFailed={hasFailed}
            />
          </div>
        )}

        {isOwner && (
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Access Control</h2>
            <MeetingAccessEditor
              meetingId={meeting.id}
              initialMode={meeting.access?.mode || "public"}
              initialAllowEmails={meeting.access?.allowEmails || []}
            />
          </div>
        )}

        {/* Transcript Accordion - Bottom Section */}
        {meeting.type === "in_person" && (
          <div className="border rounded-lg p-6">
            {hasCompletedSession && meeting.captions && meeting.captions.length > 0 ? (
              <MeetingTranscript captions={meeting.captions} />
            ) : isProcessing ? (
              <div>
                <h2 className="text-xl font-semibold mb-4">Transcript</h2>
                <div className="flex items-center gap-3 py-4">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    자막을 생성하고 있습니다. 잠시만 기다려주세요...
                  </p>
                </div>
              </div>
            ) : hasFailed ? (
              <div>
                <h2 className="text-xl font-semibold mb-4">Transcript</h2>
                <div className="flex items-center gap-3 py-4">
                  <p className="text-sm text-destructive">
                    자막 생성에 실패했습니다. 재시도해주세요.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-semibold mb-4">Transcript</h2>
                <p className="text-sm text-muted-foreground">
                  녹음이 완료되면 자막이 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
