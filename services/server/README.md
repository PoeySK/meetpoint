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

NestJS와 PostgreSQL 연결에는 `@nestjs/typeorm`과 TypeORM을 사용합니다. `synchronize`와 자동 migration 실행은 끄고, Room·Participant·Candidate 엔티티와 migration은 다음 구현 단계에서 추가합니다.
