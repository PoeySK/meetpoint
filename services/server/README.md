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

NestJS와 PostgreSQL 연결에는 `@nestjs/typeorm`과 TypeORM을 사용합니다. `synchronize`와 자동 migration 실행은 끄고, Room·Participant·Candidate·ParticipantCondition·ParticipantResponse·ScoreResult·Decision을 명시적 migration으로 관리합니다. ParticipantCondition 저장과 후보별 응답 상태 전환은 현재 API에 연결되어 있으며, 개인 조건은 선택 사항입니다.

## 검증

Node 24.12.0, pnpm 11.21.0을 사용합니다.

```bash
pnpm install --frozen-lockfile
pnpm lint:check       # 검사만 수행; 기존 pnpm lint는 --fix를 포함
pnpm test --runInBand # DB 없는 단위·HTTP 테스트
pnpm build
```

전체 PostgreSQL 통합 테스트는 전용 PostgreSQL과 실제 Solver를 먼저 띄운 뒤 실행합니다. 루트 [README](../../README.md#자동-검증)에 기동·정리 명령이 있습니다.

```bash
DATABASE_URL=postgresql://meetpoint_test:test-only-password@localhost:15432/postgres \
SOLVER_BASE_URL=http://localhost:15400 RUN_CALCULATION_E2E=true pnpm test:integration
```

`test:integration`은 기존 `test/run-isolated-e2e.cjs`를 실행합니다. DB 연결과 실제 Solver health를 확인하고 `meetpoint_recovery_test_<무작위 ID>` DB를 생성해 실제 migration을 적용한 뒤 `test:e2e`의 Jest 설정으로 전체 테스트를 실행합니다. `synchronize`를 사용하지 않으며 개발 DB를 migration/삭제하지 않습니다. 성공·실패·중단·2분 제한에서 소유 DB를 제거합니다. `RUN_CALCULATION_E2E=true`가 없으면 계산 테스트는 건너뛰며, 이 경우 전체 통합 검증이 아닙니다. CI는 이 값을 명시합니다. `pnpm test:e2e`를 직접 실행하면 DB를 생성/정리하지 않으므로 준비된 임시 DB에만 사용하세요.
