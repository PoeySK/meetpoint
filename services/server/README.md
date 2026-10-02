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
GET http://localhost:3001/live
GET http://localhost:3001/ready
```

`/live`는 DB·Solver와 무관하게 프로세스가 응답하면 HTTP 200과 `status: ok`, `service: server`를 반환합니다. `/ready`는 초기화된 DataSource의 `SELECT 1` 성공 시 200(`status: ready`, `dependencies.database.status: up`), 미설정·미초기화·연결 실패·1초 초과 시 503(`status: not_ready`)입니다. 기존 `/health`는 HTTP 200과 `ok/degraded`, timestamp, DB 상태를 유지하는 진단용 endpoint이며 기동 대기에 사용하지 않습니다.

DB 검사는 동시에 하나만 실행하며 `/health`와 `/ready`가 공유합니다. 1초 응답 제한은 PostgreSQL 작업 취소를 보장하지 않습니다. 제한 이후에도 실제 쿼리가 끝날 때까지 새 검사를 만들지 않고 503을 반환합니다. 쿼리가 종료되면 다음 검사에서 복구를 확인합니다. DB driver의 기존 pool 설정을 유지하므로 끊어진 연결의 종료가 지연되면 readiness 회복도 지연될 수 있습니다. 검사는 데이터나 계산 상태를 변경하지 않고 오류 원문을 응답·로그에 출력하지 않습니다.

Solver는 방 조회·조건·의견 저장의 필수 의존성이 아니므로 Server readiness에서 제외합니다. Server의 `ready`는 계산 의존성까지 정상이라는 의미가 아닙니다. 계산 worker의 기존 재시도·lease 정책을 유지하며 계산 테스트는 Solver `/health`의 HTTP 200과 `status: ok`, `service: solver`를 별도로 확인합니다. Solver는 외부 의존성이 없는 계산 서비스라 이 endpoint가 프로세스 응답과 계산 서비스 기동 확인을 겸합니다.

브라우저 E2E는 Server `/ready`의 HTTP 상태와 DB 상태 본문을 함께 확인합니다. CI와 통합 runner는 Solver 계약을 별도로 검사합니다. 각 HTTP 검사에는 최대 1초, 기동 대기에는 최대 60초 제한을 두며 소유 프로세스 종료 시 조기에 실패합니다. 통합 runner는 별도 HTTP Server를 띄우지 않고 Nest 테스트 앱의 readiness를 HTTP 테스트로 검증합니다. 준비 상태를 고정 sleep으로 우회하지 않으며 소유한 임시 자원의 정리는 유지합니다.

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
