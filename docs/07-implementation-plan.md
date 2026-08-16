# MeetPoint 2~3일 프로토타입 구현 계획

## 계획 상태

- **확정**: 기존 `client`, `services/server`, `services/solver` 구조를 유지하고 기능을 단계적으로 연결한다.
- **확정**: 1일차에는 저장·방 API, 2일차에는 참여자 입력과 결과용 데이터, 3일차에는 Solver·확정 흐름을 완성한다.
- **확정**: MVP 토큰은 방별 불투명 토큰으로 발급하고 24시간 유효하게 하며, Client의 방별 `sessionStorage`에 저장한다. 서버는 원문이 아닌 해시를 보관한다.
- **확정**: NestJS의 PostgreSQL 접근은 `@nestjs/typeorm`, TypeORM, `pg`를 사용하고 명시적 migration으로 관리한다. `synchronize=false`, `migrationsRun=false`를 유지한다.
- **확정**: 1일차 Room 단계에는 Room과 방 생성에 필요한 최소 HOST Participant 영속화가 포함된다. 일반 참여자 입장과 참여자 입력은 2일차 범위다.
- **확정**: Room 자체는 자동 만료하지 않는다. 24시간 만료 대상은 방 범위 접근 토큰이며, 방 데이터 삭제·보존 기간은 추후 결정한다.
- **이번 문서의 역할**: 구현 순서를 정의하며, 실제 패키지 설치·코드·설정 변경은 각 구현 단계에서 수행한다.

## 개발 전 공통 확인

아래 정책을 먼저 고정해 두어야 3일 안에 범위가 흔들리지 않는다.

- 호스트 포함 참가자 3~6명
- 활성 후보 2~5개
- 후보 하나는 시간과 장소를 한 쌍으로 가짐
- 개인 조건과 후보별 응답을 별도로 저장
- MVP 점수 정책 `mvp-1`: 시간 40, 이동 25, 예산 20, 선호 15
- 현재 첫 계산 vertical slice의 프로필은 `MVP_NO_CONDITIONS`다. Participant condition은 추가·저장하지 않으며, 실제 입력은 `availabilityStatus`와 `travelBurden`이다. 예산 20과 선호 15는 제한 없음의 내부 기본값이고, `CONDITION_INCOMPLETE`·예산 충돌·선호 충돌은 발생시키지 않는다.
- 미응답은 0점·확정 차단, 완전 일치 후보 없음은 정상 결과
- 실제 지도 API 없이 참가자 자기 기입 이동 부담 사용
- Client는 NestJS API만 호출하고 Solver·PostgreSQL을 직접 호출하지 않음
- Room 자체의 자동 만료·자동 `CLOSED` 전환은 MVP에서 구현하지 않음
- 토큰 만료와 Room 만료를 구분하고, 방 데이터 삭제·보존 기간은 추후 결정함

## 1일차 — 저장 기반과 방 수명주기

### 작업 순서

1. **PostgreSQL Docker 실행 준비**
   - `infra/docker-compose.yml`의 PostgreSQL 데이터베이스 이름, 사용자, 5432 포트, `meetpoint-postgres-data` named volume 정책을 사용한다.
   - PostgreSQL healthcheck와 Server의 `DATABASE_URL` 연결을 확인한다.
   - 이 작업의 범위는 PostgreSQL 실행 환경이며, Solver가 DB를 직접 연결하도록 만들지 않는다.

2. **NestJS health check**
   - `GET /health` 또는 동일한 health endpoint에서 프로세스가 살아 있는지 확인한다.
   - 응답에는 Server 상태와 DB 연결 상태를 구분해 기록한다.
   - Solver health를 Server health에 무조건 종속시키지 않는다. 계산 요청 시점의 Solver 오류와 기본 서버 생존을 분리한다.

3. **기본 도메인 구조**
   - 이번 단계에서는 `Room`과 최소 `Participant`의 책임과 상태를 문서 모델에 맞춘다.
   - Room에는 방 코드, 호스트 Participant 참조, 방 상태, nullable 최신 계산·결정 참조를 저장한다.
   - 최소 Participant에는 ID, Room 소속, 표시 이름, `HOST` 역할, `JOINED` 상태, 토큰 해시·만료·폐기 시각을 저장한다.
   - Room과 Participant는 논리적으로 양방향 관계지만 DB 외래 키는 `Participant.roomId`에만 설정한다. `Room.hostParticipantId`는 서비스에서 Participant 존재 여부, 같은 Room 소속 여부, `HOST` 역할을 검증한다.
   - `Candidate`와 `ParticipantResponse`는 2일차 첫 vertical slice에서 추가하고, `ScoreResult`와 `Decision`은 Solver 연동 단계에서 추가한다.

4. **방 생성 및 조회**
   - 애플리케이션에서 Room ID와 Participant ID를 먼저 생성한다.
   - Room을 저장한 뒤 HOST Participant를 저장하고, `hostParticipantId`와 Participant ID가 일치하는지 검증한 뒤 커밋한다.
   - 방 생성 시 Room과 HOST Participant를 하나의 데이터베이스 트랜잭션으로 처리하며 어느 단계에서든 실패하면 rollback한다.
   - 6자리 방 코드와 방 범위 호스트 토큰을 반환한다.
   - `roomCode` unique 충돌 시 새 코드를 생성해 제한된 횟수만큼 재시도한다.
   - 방 조회 시 참여자 상태, 후보 목록, 최신 계산 요약을 결과 화면이 사용할 수 있는 형태로 반환한다.
   - 아직 후보가 없고 참가자가 호스트뿐인 방도 조회 가능해야 한다.

5. **명시적 migration 관리**
   - CLI용 TypeORM `DataSource`를 별도로 구성한다.
   - `CreateRoomsTable` migration에는 `roomCode` unique 제약, 필수 `hostParticipantId`, nullable `latestScoreResultId`·`currentDecisionId`를 추가하고 `hostParticipantId` DB 외래 키는 추가하지 않는다.
   - `CreateParticipantsTable` migration에는 `Participant.roomId → Room.id` 외래 키와 `tokenHash` 조회 인덱스를 추가한다.
   - PostgreSQL `DEFERRABLE` 또는 `INITIALLY DEFERRED` 외래 키는 사용하지 않는다.
   - `pnpm migration:generate`, `pnpm migration:run`, `pnpm migration:revert` 명령으로 migration을 관리한다.
   - 애플리케이션 시작 시 자동 schema 동기화나 자동 migration 실행은 사용하지 않는다.

### 1일차 완료 기준

- PostgreSQL Docker 컨테이너가 로컬에서 시작·종료되고 데이터 볼륨 정책이 확인된다.
- NestJS health check가 Server와 DB 상태를 구분해 응답한다.
- 방을 만들면 호스트 참여자와 방 코드가 함께 생긴다.
- Room과 HOST Participant가 한 트랜잭션에서 생성되고, 생성 실패 시 서로 함께 롤백된다.
- 호스트 토큰 원문은 응답에서만 한 번 반환되고 데이터베이스에는 저장되지 않는다.
- 다른 Room의 Participant를 `hostParticipantId`로 지정하거나 `HOST`가 아닌 Participant를 호스트로 지정할 수 없다.
- Room과 HOST Participant 생성 실패 시 두 레코드가 함께 rollback된다.
- 생성한 방을 같은 방 범위 토큰으로 조회할 수 있다.
- Room 조회 시 후보는 빈 배열, 최신 계산 결과와 결정은 `null`로 반환된다.
- 방 상태와 도메인 ID가 문서의 객체 관계와 일치한다.

## 2일차 — 참여자 입력과 결과 화면용 API

### 작업 순서

1. **참여자 입장**
   - 방 코드로 입장하고 표시 이름과 참여자 토큰을 발급한다.
   - 활성 참가자가 6명일 때 입장을 막는다.
   - 방 코드 오류, 확정 방 입장, 중복 표시 이름 처리 정책을 확인한다.

2. **후보 등록·수정·보관**
   - 호스트가 시간·장소·1인 예상 비용·태그를 입력한다.
   - 후보 등록과 활성 후보 최대 5개 규칙을 우선 적용하고, 수정·`ARCHIVED` 논리 삭제는 후속 단계로 둔다.
   - 시간·장소를 하나의 Candidate 안에서 분리된 필드로 반환한다.
   - 후보가 바뀌면 최신 계산을 `STALE`로 바꾼다.

3. **참여자 조건 저장**
   - 가능한 시간대, 최대 예산, 필수·선호·회피 태그를 저장한다.
   - 조건이 없는 값과 아직 제출하지 않은 상태를 구분한다.
   - 본인 토큰으로 본인 조건만 수정하도록 한다.

4. **후보별 응답 저장**
   - 후보마다 `AVAILABLE`, `MAYBE`, `UNAVAILABLE`과 `EASY`, `NORMAL`, `HARD` 이동 부담을 저장한다.
   - 모든 활성 후보에 이동 부담을 필수로 입력하게 한다.
   - 응답 수정 시 최신 계산 상태를 `STALE`로 반환한다. 현재는 조건 저장 API가 없으므로 참여자 상태는 `JOINED`로 유지한다.

5. **결과 화면에 사용할 API**
   - 최신 계산 결과 조회 API의 응답 모양을 먼저 고정한다.
   - 아직 Solver 연결 전에는 계산 상태·빈 결과·오류 상태를 화면에서 표현할 수 있는 계약을 사용한다.
   - 화면이 직접 점수를 계산하지 않고 `overallScore`, `participantBreakdown`, `reasons`, `conflicts`, `coverage`를 그대로 시각화하도록 한다.

### 2일차 완료 기준

- 호스트 포함 최대 6명이 방 코드로 입장할 수 있다.
- 호스트가 후보를 2~5개 관리하고, 후보 변경 시 결과가 오래된 상태가 된다.
- 각 참가자가 개인 조건과 후보별 응답을 저장·수정할 수 있다.
- 특정 후보에 응답하지 않은 상태가 화면에 `MISSING_RESPONSE` 또는 응답 수로 나타난다.
- 결과 화면이 사용할 JSON 계약이 서버에서 일관되게 반환된다.

## 3일차 — Solver 연결과 최종 결정

### 작업 순서

1. **Rust Solver HTTP 연결**
   - Solver의 입력·출력 JSON과 `policyVersion`을 확정한다.
   - Server가 DB의 현재 데이터를 계산 스냅샷으로 만들어 `/v1/solve`에 보낸다.
   - Solver에는 토큰, DB 연결정보, 방 상태를 보내지 않는다.

2. **후보 점수 계산**
   - `mvp-1` 고정 가중치로 참가자별 component score를 계산한다.
   - 평균 총점, `eligible`, 커버리지, 충돌 코드, 근거 템플릿을 반환한다.
   - 미응답은 0점으로 반영하고, 모든 후보가 하드 충돌이면 `NO_FULL_MATCH` 정상 결과를 반환한다.
   - 미응답이 없는 계산에서 최고 후보의 점수가 60.0 미만이면 `recommendationWarnings: ["LOW_SCORE"]`를 반환하고 자동 확정하지 않는다.

3. **계산 결과 저장·조회**
   - 계산 요청 시 `REQUESTED/RUNNING`, 완료 시 `COMPLETED`, 실패 시 `FAILED`를 저장한다. 프로토타입은 NestJS 프로세스 내부 비동기로 실행하며 Queue/Redis를 추가하지 않으므로 프로세스 재시작 시 실행 중 계산이 중단될 수 있다.
   - 응답·후보·조건 변경 후 이전 결과가 `STALE`인지 확인한다.
   - Solver timeout과 구조화된 입력 오류를 서로 다른 API 오류로 표시한다.

4. **결과 표시**
   - 후보 순위, 총점, 참가자별 breakdown, 시간·이동·예산·선호 이유를 표시한다.
   - `SELF_REPORTED_TRAVEL_BURDEN`, `MAYBE_RESPONSE`, `MISSING_RESPONSE`, `NO_FULL_MATCH`, `LOW_SCORE`를 점수와 함께 표시한다.
   - 점수가 높은 후보를 자동 확정하지 않는다.

5. **최종 후보 확정**
   - 호스트가 최신 `COMPLETED` 결과의 후보를 선택한다.
   - 모든 참가자의 모든 후보 응답이 있어야 한다.
   - 완전 일치가 아니거나 결과에 `LOW_SCORE` 경고가 있으면 `acknowledgeIssues` 확인과 결정 메모리를 요구한다.
   - Decision과 계산 ID를 함께 저장하고 방을 `CONFIRMED`로 바꾼다.
   - 재검토 API로 기존 결정을 `REOPENED` 상태로 만들고 다시 계산할 수 있는지 확인한다.

### 3일차 완료 기준

- 실제 Server 요청이 Rust Solver에 도달하고 동일한 입력으로 동일한 결과가 나온다.
- 결과 화면에서 후보별 점수와 계산 근거를 확인할 수 있다.
- 조건 충돌이 있는 후보를 숨기지 않고 `eligible=false`로 표시한다.
- 응답이 완전하지 않으면 결과는 볼 수 있어도 확정 API가 거부된다.
- 완전 일치 후보가 없을 때 호스트가 충돌을 확인하고 후보를 확정할 수 있다.
- 확정 결과를 호스트와 참여자가 다시 조회할 수 있다.

## 2~3일 프로토타입에서 하지 않을 일

- 인증 계정·비밀번호·소셜 로그인
- 실제 지도 검색 또는 이동시간 호출
- 자연어 해석을 위한 OpenAI API 연결
- 알림·채팅·실시간 동기화
- 자동 배포 파이프라인
- 별도의 투표 수 집계 알고리즘
- 기존 폴더를 `apps`나 Turborepo로 재구성

## 추후 작업

### GPT 자연어 조건 입력

참가자가 자연어로 입력한 조건을 구조화된 시간·예산·태그로 변환한다. 변환 결과는 사용자 확인을 거친 뒤 저장하며, 점수는 계속 Rust 규칙이 계산한다.

### 지도 및 실제 이동시간 API

주소 정규화, 좌표, 교통수단별 예상시간을 도입한다. 자기 기입 `travelBurden`과 외부 API 값을 어떤 우선순위로 사용할지, 비용·쿼터·오류 시 대체 정책을 먼저 정한다.

### 사용자 계정

방 범위 임시 토큰을 계정·세션과 연결하여 방 목록, 참여 이력, 토큰 분실 복구를 제공한다. 계정 도입 전에는 익명 방 데이터의 보안·만료 정책을 보완해야 한다.

### 알림

초대, 조건 미입력, 계산 완료, 최종 확정 이벤트를 이메일·푸시 등으로 전달한다. 알림 실패가 방 상태나 점수 계산을 롤백하지 않도록 비동기 경계를 둔다.

### 모임 유형 확장

식사 중심 후보에서 카페, 운동, 여행, 행사 등으로 확장할 때 비용·시간·장소 태그 외에 유형별 조건과 Solver 정책 버전을 정의한다.

### 실시간 결과 반영

참여자 응답 변경을 방장 화면에 실시간으로 전달한다. 단, 변경 즉시 자동 확정하지 않고 계산 스냅샷과 결과 버전을 명시한다.

### 배포 자동화

Client, NestJS, Solver, PostgreSQL의 이미지·health check·migration·secret 관리·로그·롤백을 자동화한다. 현재는 배포 대상과 운영 데이터 보존 정책이 미결정이다.

## 구현 전 확인할 위험

- NestJS는 `SERVER_PORT` 우선·`PORT` fallback으로 3001을 사용하고, Rust Solver는 `SOLVER_PORT` 우선·`PORT` fallback으로 4000을 사용하므로 실행 환경별 변수를 혼용하지 않아야 한다.
- 현재 Compose는 PostgreSQL만 실행하므로 Server와 Solver를 컨테이너로 묶는 작업은 배포·실행 환경 확장 범위로 남아 있다.
- 익명 토큰은 로그인보다 약한 보안 모델이므로 URL·로그·브라우저 저장소 노출을 점검해야 한다.
- 자기 기입 이동 부담은 실제 이동시간이 아니므로 제품 설명과 결과 화면에 주관적 평가임을 표시해야 한다.
