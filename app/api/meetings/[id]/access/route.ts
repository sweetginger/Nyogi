import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: params.id },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // 소유자만 접근 설정 변경 가능
    if (meeting.createdBy !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { mode, allowEmails } = body;

    // mode는 항상 명시적으로 저장 (사용자가 선택한 값)
    // allowEmails는 mode가 allowlist일 때만 의미가 있지만, 저장은 유지
    const access = await prisma.meetingAccess.upsert({
      where: { meetingId: params.id },
      update: {
        mode: mode, // 사용자가 선택한 mode로 명시적으로 저장
        // allowEmails는 전달된 값이 있으면 업데이트, 없으면 기존 값 유지
        ...(allowEmails !== undefined && { allowEmails }),
      },
      create: {
        meetingId: params.id,
        mode: mode || "public",
        allowEmails: allowEmails || [],
      },
    });

    return NextResponse.json(access);
  } catch (error) {
    console.error("Error updating meeting access:", error);
    return NextResponse.json(
      { error: "Failed to update meeting access" },
      { status: 500 }
    );
  }
}

