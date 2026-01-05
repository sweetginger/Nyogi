# Nyogi

Next.js App Router + TypeScript 웹 애플리케이션

## 기술 스택

- **Next.js 14** (App Router)
- **TypeScript**
- **TailwindCSS**
- **shadcn/ui**
- **Clerk** (Google OAuth 인증)
- **Prisma** (ORM)
- **PostgreSQL** (데이터베이스)
- **WebSocket** (실시간 통신)

## 시작하기

### 1. 환경 변수 설정

`.env.local.example`을 `.env.local`로 복사하고 필요한 값들을 입력하세요:

```bash
cp .env.local.example .env.local
```

필요한 환경 변수:
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk 퍼블리시 가능 키
- `CLERK_SECRET_KEY`: Clerk 시크릿 키
- `WS_PORT`: WebSocket 서버 포트 (기본값: 8080)
- `NEXT_PUBLIC_WS_URL`: WebSocket 서버 URL (기본값: ws://localhost:8080)

### 2. PostgreSQL 데이터베이스 설정

Docker를 사용하여 로컬 PostgreSQL을 실행:

```bash
docker-compose up -d
```

또는 기존 PostgreSQL 연결 문자열을 `.env.local`의 `DATABASE_URL`에 설정하세요.

### 3. Prisma 마이그레이션

데이터베이스 스키마를 생성:

```bash
npm run db:push
```

Prisma 클라이언트 생성:

```bash
npm run db:generate
```

### 4. Clerk 설정

1. [Clerk Dashboard](https://dashboard.clerk.com)에서 새 애플리케이션 생성
2. Google OAuth 제공자를 활성화
3. `.env.local`에 Clerk 키 입력:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

### 5. 의존성 설치

```bash
npm install
```

### 6. 개발 서버 실행

#### 옵션 1: Next.js와 WebSocket 서버를 함께 실행

```bash
npm run dev:all
```

#### 옵션 2: 별도로 실행

터미널 1 (Next.js):
```bash
npm run dev
```

터미널 2 (WebSocket 서버):
```bash
npm run ws:server
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 빌드

```bash
npm run build
```

### 프로덕션 실행

```bash
npm start
# 별도 터미널에서
npm run ws:server
```

## 프로젝트 구조

```
/app
  /api/meetings        # Meetings CRUD API
  /meetings
    /[id]              # Meeting 상세 페이지
    /new               # Meeting 생성 페이지
  /translation
  /settings
/components
  /ui                  # shadcn/ui 컴포넌트
  meeting-access-editor.tsx
  audio-recorder.tsx
  sidebar.tsx
/lib
  prisma.ts            # Prisma 클라이언트
  websocket.ts         # WebSocket 클라이언트 유틸리티
  utils.ts
/prisma
  schema.prisma        # 데이터베이스 스키마
/server
  ws-server.ts         # WebSocket 서버
```

## 기능

### 인증 및 접근 제어
- **인증**: Google OAuth를 통한 자동 회원가입/로그인 (Clerk)
- **미팅 접근 제어**:
  - **Public**: 로그인 없이 누구나 접근 가능
  - **Allowlist**: 로그인 필요 + 허용된 이메일만 접근 가능
  - 미팅 소유자는 접근 모드를 변경하고 allowlist 이메일을 관리할 수 있음

### Meetings CRUD
- **목록**: `/meetings` - 모든 미팅 목록 표시
- **생성**: `/meetings/new` - 새 미팅 생성 (제목, 타입, URL, 언어, 초대 모드)
- **상세**: `/meetings/[id]` - 미팅 상세 정보 및 접근 제어 편집기

### 오디오 녹음
- **in_person 미팅**: 마이크 권한 요청 및 오디오 레벨 미터
- 실시간 오디오 레벨 표시
- 한국어/영어 지원

### WebSocket 세션 관리
- **session.start**: 미팅 세션 시작, sessionId 반환
- **session.end**: 미팅 세션 종료
- 세션 정보는 데이터베이스에 저장됨

### 데이터베이스 모델
- **Meeting**: 미팅 기본 정보
- **MeetingAccess**: 접근 제어 설정
- **MeetingSession**: 미팅 세션 (시작/종료 시간, 상태)
- **CaptionFinal**: 자막 데이터
- **Summary**: 요약 정보
- **Keyword**: 키워드 (사용자/미팅 범위)
- **Document**: 문서 및 추출된 컨텍스트

## 데이터베이스 관리

### Prisma Studio 실행
데이터베이스를 시각적으로 탐색:

```bash
npm run db:studio
```

### 마이그레이션 생성
스키마 변경 후 마이그레이션 생성:

```bash
npm run db:migrate
```

## API 엔드포인트

### Meetings
- `GET /api/meetings` - 미팅 목록 조회
- `POST /api/meetings` - 새 미팅 생성
- `GET /api/meetings/[id]` - 미팅 상세 조회
- `PATCH /api/meetings/[id]` - 미팅 수정
- `DELETE /api/meetings/[id]` - 미팅 삭제
- `PATCH /api/meetings/[id]/access` - 접근 제어 설정 변경

## WebSocket 메시지

### 클라이언트 → 서버
- `session.start`: 세션 시작
  ```json
  {
    "type": "session.start",
    "payload": {
      "meetingId": "uuid",
      "startedBy": "clerk-user-id"
    }
  }
  ```

- `session.end`: 세션 종료
  ```json
  {
    "type": "session.end",
    "payload": {
      "sessionId": "uuid"
    }
  }
  ```

### 서버 → 클라이언트
- `session.start.ack`: 세션 시작 확인
  ```json
  {
    "type": "session.start.ack",
    "payload": {
      "sessionId": "uuid"
    }
  }
  ```

- `session.end.ack`: 세션 종료 확인
  ```json
  {
    "type": "session.end.ack",
    "payload": {
      "sessionId": "uuid"
    }
  }
  ```

- `connection.established`: 연결 확인
- `error`: 에러 메시지
