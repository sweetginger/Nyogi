import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function MeetingsPage() {
  const meetings = await prisma.meeting.findMany({
    include: {
      access: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Meetings</h1>
        <Link href="/meetings/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create meeting
          </Button>
        </Link>
      </div>
      <div className="space-y-4">
        {meetings.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            No meetings yet. Create your first meeting!
          </div>
        ) : (
          meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold mb-2">{meeting.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {meeting.type} • Created{" "}
                    {new Date(meeting.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    meeting.access?.mode === "public"
                      ? "bg-green-100 text-green-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {meeting.access?.mode === "public" 
                    ? "Public" 
                    : meeting.access?.mode === "allowlist"
                    ? "Allowlist"
                    : "Public"}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

