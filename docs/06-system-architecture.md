# MeetPoint 시스템 아키텍처

## 문서 상태

- **확정**: `client`는 화면과 입력을 담당하고, `services/server`는 유일한 외부 REST API·데이터 소유자이며, `services/solver`는 독립적인 계산 HTTP 서비스다.
- **확정**: PostgreSQL은 Docker로 실행하고 NestJS 서버만 접근한다. Solver와 브라우저는 PostgreSQL에 직접 연결하지 않는다.
- **확정**: 외부 AI API를 도입할 때는 NestJS 서버에서 직접 호출한다. GPT는 구조화·설명 보조에만 사용하고 수치 계산은 Rust Solver가 한다.
- **권장 기준**: 로컬 포트는 client `3000`, server `3001`, solver `4000`, PostgreSQL `5432`를 기준으로 문서화한다.
- **확정**: NestJS의 PostgreSQL 접근은 `@nestjs/typeorm` + TypeORM + `pg`로 구성하고 `synchronize=false`, `migrationsRun=false`로 시작한다. 도메인 엔티티와 migration은 다음 단계에서 추가한다.
- **확정**: Rust Solver의 HTTP 서버는 Axum + Tokio로 구성한다. 이번 단계에는 `/health`만 둔다.
- **미결정**: 실제 배포 플랫폼, TLS 종료 위치, 데이터베이스 백업·보존 기간, Solver의 인증 방식은 구현·배포 준비 때 확정한다.

## 1. 전체 시스템 구성

```text
사용자 브라우저
      │
      │ HTTP/JSON
      ▼
Next.js Client (client :3000)
      │
      │ /api/v1 REST, room-scoped token
      ▼
NestJS Server (services/server :3001)
      ├────────────── PostgreSQL (:5432, Docker)
      │                  └─ Room, Participant, Candidate,
      │                     Response, ScoreResult, Decision
      │
      └────────────── Rust Solver (services/solver :4000)
                         └─ 후보별 점수·순위·근거 계산

추후:
NestJS Server ───────── OpenAI API
                   └─ 자연어 조건 구조화 또는 계산 결과 설명 보조
```

각 화살표의 소유권은 다음과 같다.

| 구간 | 통신 주체 | 목적 | 금지하는 중복 책임 |
| --- | --- | --- | --- |
| 브라우저 → Server | client → NestJS REST | 방·참여자·후보·조건·결과의 읽기/쓰기 | client에서 점수 계산·DB 접근 금지 |
| Server → PostgreSQL | NestJS → DB | 도메인 원본과 계산 이력 저장 | client/Solver의 직접 SQL 금지 |
| Server → Solver | NestJS → Rust HTTP | 완전한 입력 스냅샷 계산 | Solver에서 방 상태·인증·DB 관리 금지 |
| Server → OpenAI(추후) | NestJS → 외부 AI | 자연어를 구조화하거나 결과 설명 보조 | OpenAI에서 최종 점수·결정 금지 |

## 2. Client와 NestJS Server의 통신

### Client 책임

- 방 생성·입장·후보 입력·조건 입력·응답 수정 화면 렌더링
- 폼의 즉시 입력 오류 표시와 API 응답 상태 표시
- 서버에서 받은 점수, breakdown, 충돌, 커버리지를 시각화
- 호스트 토큰 또는 참여자 토큰을 방별 `sessionStorage`에 보관하고 `Authorization` 헤더에 전달
- Room·계산·Decision 상태는 중앙 Room session에서 REST polling과 브라우저 재활성화 재조회로 갱신

Client는 `overallScore`를 다시 계산하거나 후보 순위를 자체적으로 바꾸지 않는다. 화면에서 소수점 형식을 꾸미는 것과 Solver가 결정한 값을 변경하는 것은 구분한다.

### Server 책임

- REST API, JSON 유효성 검사, 방 범위 토큰 검사, 역할 검사
- Room aggregate와 모든 하위 데이터의 생성·변경·상태 전이
- 활성 참가자·후보·조건·응답을 일관된 스냅샷으로 묶기
- Solver 호출, 타임아웃·재시도, 결과 저장, 최신 결과의 `STALE` 관리
- 최종 Decision의 호스트 권한 검사와 확정 이력 보존
- 추후 OpenAI 호출과 외부 응답의 구조화

NestJS 내부 서비스도 기능 단위로 책임을 나눈다. `RoomService`는 방 생성·입장을, `RoomQueryService`는 Room 조회 projection을, `CandidateService`는 후보 등록을, `ParticipantResponseService`는 참가자 응답 저장을, `RoomCalculationService`는 계산 접수·조회·Solver 완료 전이를, `ParticipantLifecycleService`는 MEMBER leave·HOST kick의 Participant 상태·token 폐기·최신 ScoreResult 무효화를 담당한다. `DecisionService`는 Decision 확정·재검토·조회와 그 transaction을 담당한다. HTTP 진입점도 `RoomsController`, `CandidateController`, `ParticipantResponseController`, `CalculationController`, `DecisionController`, `ParticipantLifecycleController`로 나누며, 각 Controller는 경로·헤더·본문을 해당 서비스로 전달하는 얇은 어댑터로 유지한다.

브라우저가 직접 Solver를 호출하지 않으므로 계산 입력에 방 토큰이나 내부 서비스 주소가 노출되지 않는다.

### 통신 규칙

- 로컬 개발에서 client는 `http://localhost:3001/api/v1`를 호출한다.
- Server는 `http://localhost:3000`을 허용 origin으로 설정한다. 실제 CORS 설정값은 환경 변수로 둔다.
- 브라우저가 보내는 Origin은 사용자가 접속한 주소이므로 Docker 내부 서비스명(`client`)을 CORS origin으로 임의 지정하지 않는다. 호스트 실행에서는 `http://localhost:3000`, 배포에서는 실제 공개 Client origin을 사용한다.
- MVP는 쿠키 세션을 사용하지 않고 Bearer 토큰을 사용하므로 CORS 요청에 `credentials`를 요구하지 않는다.
- API 오류는 `docs/04-api-contract.md`의 공통 오류 envelope와 `requestId`를 사용한다.
- 서버는 계산 요청을 받은 뒤 `calculationId`를 반환하고, Client는 계산 상태·결과 API를 조회한다.

## 3. NestJS Server와 PostgreSQL의 통신

### 저장해야 하는 원본

- 방과 상태, 방 코드, 호스트 참여자 참조
- 참여자와 개인 조건
- 후보 시간, 장소, 비용, 태그, 활성/보관 상태
- 참여자의 후보별 응답
- Solver 호출의 입력 스냅샷 식별자, 정책 버전, 상태, 결과, 실패 원인
- 최종 Decision과 과거 Decision의 상태·사유·참조 계산

### DB 접근 원칙

- PostgreSQL 연결·트랜잭션·마이그레이션은 NestJS 서버가 소유한다.
- 후보·조건·응답 변경과 최신 계산 무효화는 하나의 일관된 서버 작업으로 처리해야 한다.
- 계산 결과는 현재 데이터로 덮어쓰지 않고 `ScoreResult` 이력으로 저장한다.
- `Decision`은 확정 시 사용한 `scoreResultId`를 참조하여 당시 점수와 현재 입력을 구분한다.
- 방 범위 ID 검증은 SQL 쿼리와 서비스 로직 양쪽에서 확인하여 다른 방의 데이터를 섞지 않는다.

### 트랜잭션 경계

- 방 생성: Room과 호스트 Participant 생성
- 후보·조건·응답 변경: 원본 변경과 최신 결과 `STALE` 표시
- 계산 접수: 입력 스냅샷 식별자와 `ScoreResult(REQUESTED)` 생성
- 계산 완료: Solver 결과 검증·ScoreResult 저장·Room 최신 결과 갱신
- 결정 확정: 최신 계산 검증·Decision 생성·Room `CONFIRMED` 전환
- Participant leave/kick: Room row lock·Participant 상태·token 폐기·최신 완료 ScoreResult `STALE`·필요한 Room `OPEN` 전환

Solver 호출 자체는 DB 트랜잭션을 오래 잠그지 않는다. 서버는 먼저 계산 상태와 스냅샷을 저장하고, Solver가 반환한 뒤 별도 짧은 트랜잭션으로 결과를 확정한다.

## 4. NestJS Server와 Rust Solver의 통신

### 요청 흐름

```text
호스트 계산 요청
  → Server가 상태·후보·조건·응답 검증
  → 계산 ID와 입력 snapshot 저장
  → POST /v1/solve
  → Solver가 mvp-1 규칙으로 계산
  → 결과 또는 구조화된 오류 반환
  → Server가 결과 저장
  → Client가 최신 결과 조회
```

### Solver 책임

- Server가 전달한 후보와 참여자 조건·응답의 유효성을 다시 확인
- 시간·이동·예산·선호의 고정 규칙 계산
- 후보별 총점, 참가자별 breakdown, 근거, 충돌, 커버리지 반환
- 입력 스냅샷 밖의 데이터나 외부 API를 조회하지 않음
- 사용자 인증, 방 참여자 관리, 최종 후보 확정을 하지 않음

### Server 책임

- Solver 입력에 포함할 활성 데이터와 계산 정책 버전 결정
- Solver endpoint와 timeout 설정 관리
- `requestId`·`calculationId`를 통해 중복 계산 및 재시도 추적
- Solver 결과가 요청의 참가자·후보 집합과 일치하는지 검증
- 결과를 API용 JSON으로 보존하고 Client에 노출

Solver가 반환한 점수를 Server가 다시 평균 내거나 보정하지 않는다. 서버에서 수행하는 검사는 결과를 신뢰하기 위한 구조·ID·정책 버전 검증이지 별도의 추천 알고리즘이 아니다.

## 5. 추후 OpenAI API의 위치

OpenAI API는 다음 경로로만 추가한다.

```text
Client → NestJS Server → OpenAI API
                     ↘ Rust Solver
```

가능한 역할은 다음으로 제한한다.

- “회사에서 7시 이후, 너무 비싸지 않은 조용한 곳” 같은 자연어를 `availability`, `maxBudgetKrw`, `preferences` 구조로 변환하는 보조
- 이미 계산된 구조화 결과와 근거 코드를 사람이 읽기 쉬운 설명으로 다듬는 보조

OpenAI API가 할 수 없는 역할은 다음과 같다.

- 후보 순위·점수·가중치 결정
- 미응답을 임의로 추정하여 `AVAILABLE`로 변경
- 방장 대신 최종 후보 확정
- Client에서 API 키를 직접 사용하는 것

OpenAI 응답은 Server에서 schema 검증·수정 이력·실패 처리를 거친다. AI 호출은 현재 MVP 경로에 포함하지 않는다.

## 6. 서비스별 책임 범위

| 서비스 | 담당 | 담당하지 않음 |
| --- | --- | --- |
| `client` | 화면, 폼, API 호출, 결과 시각화 | 비즈니스 점수 계산, DB, 인증 서버, Solver 호출 |
| `services/server` | REST, 방 상태, 참여자·후보·응답, DB, Solver orchestration, Decision, 추후 OpenAI | 화면 렌더링, Rust 계산 규칙의 별도 복제 |
| `services/solver` | 순수한 후보 점수·순위·근거 계산 HTTP API | DB, 사용자 인증, 방 상태, 알림, 최종 확정 |
| `infra` | PostgreSQL Docker와 서비스 실행 환경, 환경 변수 템플릿 | 도메인 로직, 점수 계산 |

기능을 추가할 때 “어느 서비스가 원본 상태를 소유하는가”를 먼저 정한다. 예를 들어 Solver는 참가자 응답을 저장하지 않고, Client는 계산 결과를 수정하지 않는다.

## 7. 서비스 간 오류 처리

### Client ↔ Server

- 4xx: 사용자가 수정할 수 있는 입력·권한·상태 오류를 공통 오류 코드로 표시한다.
- 409 `STALE_RESULT`: 최신 결과가 아니므로 계산 화면으로 돌아가 재계산을 안내한다.
- 502 `SOLVER_ERROR`: 입력은 정상이나 계산 서비스가 구조화된 실패를 반환한 경우다.
- 503 `SOLVER_UNAVAILABLE`: 연결 실패·타임아웃을 표시하고 재시도 가능 여부를 안내한다.
- 500: 사용자에게 내부 상세를 노출하지 않고 `requestId`를 보여준다.

### Server ↔ PostgreSQL

- 연결 실패·트랜잭션 실패는 API 성공으로 위장하지 않는다.
- 원본 변경과 `STALE` 갱신이 함께 완료되지 않으면 전체 변경을 롤백한다.
- 결과 저장 전에 계산 ID와 입력 snapshot hash가 현재 요청과 일치하는지 확인한다.

### Server ↔ Solver

- Solver 오류 body의 `code`, `message`, `retryable`을 `ScoreResult(FAILED)`에 보존한다.
- Server는 Solver 오류를 새로운 점수로 대체하지 않는다.
- 재시도 가능한 오류도 최대 정책 횟수를 넘기지 않으며, 실패 상태와 request ID를 Client에 반환한다.

## 8. 타임아웃 및 재시도 정책

### MVP 권장값

- 연결 타임아웃: 1초
- Solver 응답 타임아웃: 3초
- 재시도: 네트워크 오류 또는 Solver의 500·503에 한해 1회
- 재시도 간격: 짧은 고정 지연 또는 지수 지연 중 구현 단계에서 선택
- 400·422 입력 오류와 409 상태 충돌은 재시도하지 않음

재시도는 최초 요청과 같은 `calculationId`/`requestId` 또는 멱등 키를 사용한다. 첫 번째 호출이 성공했지만 응답만 유실된 경우 중복 ScoreResult가 만들어지지 않아야 한다. Solver 계산은 MVP 입력 크기에서 3초 안에 끝나는 것을 목표로 하며, 실제 기준은 부하 테스트 후 조정한다.

## 9. 환경 변수 관리 방식

환경 변수 이름은 서비스별 접두어를 사용한다.

```text
# Client: 브라우저에 노출되어도 되는 URL만 NEXT_PUBLIC_으로 시작
NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:3001

# NestJS Server
SERVER_PORT=3001
DATABASE_URL=postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint
SOLVER_BASE_URL=http://localhost:4000
SOLVER_CONNECT_TIMEOUT_MS=1000
SOLVER_RESPONSE_TIMEOUT_MS=3000
CLIENT_ORIGIN=http://localhost:3000
OPENAI_API_KEY=  # 추후 사용, 현재 비워 둠

# PostgreSQL Docker
POSTGRES_DB=meetpoint
POSTGRES_USER=meetpoint
POSTGRES_PASSWORD=meetpoint-local
POSTGRES_PORT=5432
```

위 예시는 모든 프로세스를 호스트에서 실행할 때의 주소다. Server와 PostgreSQL·Solver를 Docker 같은 네트워크에서 실행하면 Server 컨테이너 안에서는 `localhost`가 자기 자신을 뜻하므로 다음처럼 서비스명을 사용한다.

```text
# Docker network 내부의 NestJS Server 컨테이너
SERVER_PORT=3001
DATABASE_URL=postgresql://meetpoint:meetpoint-local@meetpoint-postgres:5432/meetpoint
SOLVER_BASE_URL=http://meetpoint-solver:4000

# 브라우저가 호스트에서 접근하는 Client의 API 주소는 계속 공개 주소를 사용
NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:3001
CLIENT_ORIGIN=http://localhost:3000
```

`meetpoint-postgres`와 `meetpoint-solver`는 MeetPoint Docker 리소스의 역할 기반 이름이다. 추후 Server와 Client를 컨테이너화할 때도 `meetpoint-server`, `meetpoint-client` 규칙을 사용한다. `NEXT_PUBLIC_SERVER_BASE_URL`은 브라우저가 해석하므로 `http://meetpoint-server:3001` 같은 Docker 내부 이름을 넣지 않는다. 호스트 실행과 Docker 실행을 동시에 지원하려면 위 두 환경 세트를 별도 파일·프로파일로 관리한다.

- 실제 비밀번호·토큰·API 키는 Git에 커밋하지 않는다.
- Server는 `services/server/.env` 또는 루트 `../../.env`를 읽을 수 있도록 설정되어 있다. 실제 비밀 값은 비어 있는 루트 `.env`나 로컬 전용 파일에 두고, 공유 가능한 기본값과 주소는 README와 이 문서에서 관리한다.
- Client 번들에 들어갈 수 있는 값은 `NEXT_PUBLIC_SERVER_BASE_URL`처럼 공개 가능한 값으로 제한한다.
- 현재 `services/server/src/main.ts`는 `SERVER_PORT`를 우선 사용하고 `PORT`를 fallback으로 사용하며, 둘 다 없으면 3001에서 listen한다.

현재 루트 `.env`는 비어 있고, `.gitignore`는 `.env`와 환경별 설정 파일을 제외한다. 로컬 실행에 필요한 주소와 기본값은 README에서 확인한다.

## 10. 로컬 개발 환경과 배포 환경의 차이

| 항목 | 로컬 개발 | 배포 목표 |
| --- | --- | --- |
| Client | 호스트에서 Next.js, `localhost:3000` | Client 컨테이너 또는 정적/Node 런타임, 공개 HTTPS 도메인 |
| Server | 호스트에서 NestJS, 목표 `localhost:3001` | 내부 서비스 포트와 외부 reverse proxy 경로 분리 |
| Solver | 호스트에서 Rust HTTP, 목표 `localhost:4000` | Server만 접근 가능한 내부 네트워크 서비스 |
| PostgreSQL | `infra`의 Docker 컨테이너, `localhost:5432` | 영속 볼륨을 가진 PostgreSQL 컨테이너 또는 별도 운영 환경. 최종 선택 미결정 |
| 주소 | 브라우저→Server는 `localhost:3001`, Server→DB는 `localhost:5432`, Server→Solver는 `localhost:4000` | 브라우저→공개 reverse proxy 주소, Server→`meetpoint-postgres:5432`·`meetpoint-solver:4000` 같은 내부 서비스 DNS |
| 보안 | 개발용 room token·CORS | HTTPS, secret rotation, rate limit, 내부 네트워크 제한 필요 |
| 실행 관리 | 각 프로젝트의 현재 기본 실행 방식 유지 | 추후 Docker 실행 설정과 health check 추가 |

## 11. 현재 저장소 상태와 포트 정합성

실행 환경 구성 이후의 저장소는 다음 포트 정책을 사용한다.

- Next.js Client는 3000을 유지한다.
- NestJS Server는 `SERVER_PORT` 우선, `PORT` fallback이며 기본값은 3001이다.
- Rust Solver는 `SOLVER_PORT` 우선, `PORT` fallback이며 기본값은 4000이다.
- `infra/docker-compose.yml`은 PostgreSQL을 호스트 5432에 공개하고 `meetpoint-postgres-data` named volume, `meetpoint-network`, healthcheck를 사용한다.
- 현재 Compose는 PostgreSQL만 실행한다. Server와 Solver는 로컬 프로세스로 실행하며, 추후 컨테이너화하면 내부 주소를 `meetpoint-postgres:5432`, `meetpoint-solver:4000`으로 분리한다.

## 확정 사항과 미결정 사항 요약

- **확정**: 브라우저 → NestJS → PostgreSQL/Rust Solver의 단방향 책임 분리, Solver의 무상태 HTTP 호출, 추후 OpenAI의 NestJS 직접 호출을 사용한다. Docker 내부 통신은 서비스 DNS를 사용하고 브라우저용 URL과 분리한다.
- **확정**: 서비스가 같은 기능을 중복 구현하지 않는다. 점수의 단일 계산 원본은 Rust Solver다.
- **미결정**: Docker에서 Server·Solver까지 함께 실행하는 구성, 배포 방식·TLS·secret 관리 세부는 구현 전에 정한다.
