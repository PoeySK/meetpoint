# MeetPoint Server

NestJS 기반 백엔드 프로젝트입니다.

## 실행 방법

```bash
pnpm install
pnpm start:dev
```

`SERVER_PORT` 또는 `PORT` 환경 변수가 없으면 `http://localhost:3001`에서 실행합니다.

PostgreSQL을 먼저 실행한 뒤 다음 연결 정보를 사용합니다.

```text
DATABASE_URL=postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint
```

서버 상태 확인:

```text
GET http://localhost:3001/health
```

NestJS와 PostgreSQL 연결에는 `@nestjs/typeorm`과 TypeORM을 사용합니다. `synchronize`와 자동 migration 실행은 끄고, Room·Participant·Candidate·ParticipantCondition·ParticipantResponse·ScoreResult·Decision을 명시적 migration으로 관리합니다. ParticipantCondition 저장과 조건 기반 응답 상태 전환은 현재 API에 연결되어 있습니다.
