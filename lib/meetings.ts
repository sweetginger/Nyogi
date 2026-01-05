// 미팅 데이터 타입 정의
export type MeetingAccessType = "public" | "allowlist";

export interface Meeting {
  id: string;
  title: string;
  createdAt: string;
  accessType: MeetingAccessType;
  allowEmails?: string[]; // allowlist 타입일 때만 사용
}

// 예시 미팅 데이터 (실제로는 데이터베이스에서 가져옴)
export const mockMeetings: Meeting[] = [
  {
    id: "1",
    title: "Public Meeting #1",
    createdAt: "2024-01-01",
    accessType: "public",
  },
  {
    id: "2",
    title: "Allowlist Meeting #1",
    createdAt: "2024-01-02",
    accessType: "allowlist",
    allowEmails: ["user@example.com", "admin@example.com"],
  },
  {
    id: "3",
    title: "Public Meeting #2",
    createdAt: "2024-01-03",
    accessType: "public",
  },
];

export function getMeetingById(id: string): Meeting | undefined {
  return mockMeetings.find((meeting) => meeting.id === id);
}

export function canAccessMeeting(
  meeting: Meeting,
  userEmail: string | null
): boolean {
  if (meeting.accessType === "public") {
    return true;
  }

  if (meeting.accessType === "allowlist") {
    if (!userEmail) {
      return false; // 로그인 필요
    }
    return meeting.allowEmails?.includes(userEmail) ?? false;
  }

  return false;
}




