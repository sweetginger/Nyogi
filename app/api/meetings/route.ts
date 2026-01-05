import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const meetings = await prisma.meeting.findMany({
      include: {
        access: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(meetings);
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      type,
      meetUrl,
      languages,
      inviteMode,
      scheduledAt,
    } = body;

    // 기본 언어 설정
    const defaultLanguages = languages || ["ko", "en"];

    const meeting = await prisma.meeting.create({
      data: {
        title,
        type,
        meetUrl: meetUrl || null,
        languages: defaultLanguages,
        inviteMode,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdBy: userId,
        access: {
          create: {
            mode: "public", // 기본값은 public
            allowEmails: [],
          },
        },
      },
      include: {
        access: true,
      },
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    console.error("Error creating meeting:", error);
    return NextResponse.json(
      { error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}




