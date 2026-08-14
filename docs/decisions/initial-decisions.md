# MeetPoint 초기 기술·제품 결정 기록

## 결정 기록의 범위

- **확정**은 현재 MVP의 기본 방향으로 취급한다.
- **미결정**은 구현자가 임의로 확정하지 않고, 해당 단계에서 별도 합의를 남긴다.
- 이 기록은 현재 저장소의 `client`, `services/server`, `services/solver`, `infra` 디렉터리와 `meetpoint-{역할}` Docker 리소스 이름을 기준으로 한다.

## 1. Spring Boot가 아니라 NestJS를 사용하는 이유

### 결정

백엔드 API 서버는 NestJS, Node.js, TypeScript로 구현한다. Spring Boot 서버를 추가하지 않는다.

### 이유

- Client가 Next.js·React·TypeScript이고, 서버도 TypeScript로 맞추면 요청·응답 타입과 검증 모델을 한 언어로 공유하기 쉽다.
- 현재 저장소에 이미 `services/server` NestJS 프로젝트가 생성되어 있다.
- MeetPoint MVP에서 Server의 핵심 역할은 REST API, PostgreSQL 조정, Rust Solver 호출, 추후 OpenAI 호출이다. NestJS의 모듈·가드·서비스 구조가 이 경계를 표현하기에 충분하다.
- Java 런타임과 별도의 빌드·배포·팀 기술 스택을 추가하지 않아 2~3일 프로토타입의 변경 범위를 줄인다.

### 영향

Spring Boot 방식의 Controller/Service/Repository 구조를 그대로 복제하지 않고, NestJS 모듈 경계와 현재 프로젝트 설정을 따른다. 서버의 외부 API 소유자는 NestJS 하나다.

## 2. FastAPI를 추가하지 않는 이유

### 결정

FastAPI를 별도의 API 서버로 추가하지 않는다.

### 이유

- 이미 REST API의 주체는 NestJS이고 계산 서비스의 주체는 Rust Solver로 확정되어 있다.
- FastAPI를 추가하면 같은 도메인 API를 두 프레임워크가 나누거나, Python 서버와 Rust Solver 사이에 불필요한 중간 계층이 생긴다.
- MVP에 Python 기반 자연어 처리 서버가 필요한 것도 아니다. 추후 AI API가 필요해도 NestJS가 직접 OpenAI API를 호출한다.
- 서비스 수를 늘리면 인증·환경 변수·배포·오류 처리 경계가 늘어나 2~3일 범위를 벗어난다.

### 영향

`services/server`는 데이터·API·외부 연동을 담당하고, `services/solver`는 Rust HTTP 계산 서비스로 유지한다. Python 서비스는 현재 아키텍처에 포함하지 않는다.

## 3. Supabase가 아니라 PostgreSQL을 직접 사용하는 이유

### 결정

데이터베이스는 Docker로 실행하는 PostgreSQL을 사용하고, NestJS 서버가 직접 연결한다. Supabase의 인증·DB·자동 API는 사용하지 않는다.

### 이유

- MeetPoint의 원본 상태와 변경 규칙은 NestJS 서버가 소유해야 한다. 방 상태, 계산 이력, 결정 이력을 API 서비스의 트랜잭션으로 명확히 관리할 수 있다.
- 로컬 프로토타입에서 PostgreSQL을 Docker로 재현하면 특정 BaaS 계정이나 클라우드 프로젝트 없이 동일한 데이터베이스를 실행할 수 있다.
- Supabase가 제공하는 인증·자동 REST·실시간 기능은 이번 MVP에서 제외한 로그인·실시간 기능과 중복된다.
- 향후 배포 환경이나 PostgreSQL 운영 방식을 바꾸더라도 애플리케이션과 데이터베이스 소유권의 경계를 유지할 수 있다.

### 영향

마이그레이션, 연결 풀, 백업, 계정·비밀번호, 영속 볼륨은 프로젝트가 직접 관리해야 한다. 이 부담은 인지하고 `infra/`의 Docker 설정과 운영 정책을 별도 작업으로 둔다.

## 4. Next.js API Route를 사용하지 않는 이유

### 결정

Next.js는 화면 렌더링과 사용자 입력을 담당하고, API는 NestJS에서만 제공한다. Next.js API Route와 Server Action은 사용하지 않는다.

### 이유

- Client와 Server의 책임을 코드 위치로도 분리하여 REST 계약과 배포 경계를 명확히 한다.
- PostgreSQL·Solver·추후 OpenAI에 접근할 권한은 NestJS에만 있어야 한다.
- Next.js API Route에 도메인 로직을 넣으면 NestJS와 기능이 중복되고, 계산·결정 상태의 단일 소유자가 모호해진다.
- Client를 별도 포트와 배포 단위로 실행하는 현재 저장소 구조와 맞는다.

### 영향

브라우저는 NestJS base URL을 호출한다. CORS, room-scoped token, API 오류 envelope, 환경 변수는 NestJS 기준으로 설계한다.

## 5. Rust Solver가 데이터베이스에 직접 접근하지 않는 이유

### 결정

Rust Solver는 NestJS가 전달한 후보·참여자 조건·후보별 응답 스냅샷만 받아 계산하고, 데이터베이스에 접근하지 않는다.

### 이유

- Solver를 입력과 출력이 명확한 순수 계산 서비스로 만들면 같은 입력을 재실행해 같은 결과를 검증할 수 있다.
- 방 권한, 참여자 상태, 후보 활성화, 결정 확정은 도메인 상태이며 NestJS가 단일 소유자여야 한다.
- DB 자격 증명을 Solver에 주지 않으면 계산 서비스가 방 전체 데이터나 다른 방 데이터에 접근할 위험이 줄어든다.
- Solver를 독립 테스트·스케일링·교체하기 쉽다.

### 영향

NestJS가 매 계산마다 완전한 입력 스냅샷을 만든다. 데이터 복사와 snapshot hash 관리 비용은 있지만, 결과 이력과 재현성에 필요한 비용으로 본다.

## 6. GPT를 점수 계산에 사용하지 않는 이유

### 결정

후보 점수, 순위, 조건 충돌 판정은 Rust Solver의 명시적 규칙으로 계산한다. GPT는 점수 계산의 판단자가 아니다.

### 이유

- 같은 조건에 대해 매번 같은 수치와 순위를 제공해야 한다.
- 참가자는 “왜 72.4점인가”를 시간·이동·예산·선호의 입력값으로 확인할 수 있어야 한다.
- GPT의 확률적 응답은 임계값·필수 조건·미응답 처리를 반복 가능하게 보장하기 어렵다.
- 외부 API 장애나 비용이 핵심 모임 결정 기능을 막아서는 안 된다.

### GPT의 허용 범위

- 자연어 조건을 정규화된 시간·예산·태그 구조로 바꾸는 보조
- 이미 계산된 근거 코드를 사람이 읽기 좋은 문장으로 보조

최종 구조화 결과는 사용자 확인을 받고, 최종 수치는 계속 Solver가 만든다.

## 7. MVP에서 로그인과 지도 API를 제외하는 이유

### 결정

MVP에는 계정 로그인과 실제 지도·이동시간 API를 넣지 않는다.

### 로그인 제외 이유

- 첫 번째 검증 목표는 “방 생성 → 조건 입력 → 설명 가능한 결과 → 확정” 흐름이다. 계정·비밀번호·소셜 연동은 이 가설을 검증하는 데 필수적이지 않다.
- 방 코드와 방 범위 임시 토큰으로 친구 그룹이 빠르게 입장할 수 있다.
- 계정 복구, 사용자 개인정보, 친구 목록, 권한 정책을 추가하면 프로토타입의 위험 범위가 커진다.
- 임시 토큰은 MVP 편의를 위한 것이며 운영 수준의 계정 보안을 제공하지 않는다는 점을 명시한다.

### 지도 API 제외 이유

- API 비용·쿼터·주소 정규화·교통수단별 계산·장애 대체 정책을 먼저 결정해야 한다.
- 후보 장소는 직접 입력하고 참가자가 후보별 이동 부담을 `EASY/NORMAL/HARD`로 입력하면, MVP의 조건 기반 계산 흐름을 검증할 수 있다.
- 자기 기입 값은 `SELF_REPORTED_TRAVEL_BURDEN`으로 표시하여 실제 이동시간으로 과장하지 않는다.

### MVP 장소 점수 방식 비교

| 방식 | 구현 난이도 | 결과 신뢰성 | MVP 결정 |
| --- | --- | --- | --- |
| 참가자가 후보별 `EASY/NORMAL/HARD` 직접 입력 | 낮음. 응답 enum과 고정 배점만 구현하면 됨 | 실제 이동시간은 아니지만 사용자의 체감 부담을 그대로 반영하고 가짜 수치를 만들지 않음 | **채택** |
| 출발 위치·후보 좌표로 직선거리 계산 | 중간. 위치 입력·좌표 검증·거리 계산이 필요함 | 직선거리는 교통수단·도로·환승을 반영하지 않아 실제 이동 부담과 차이가 큼 | MVP 이후 검토 |
| 지도·실제 이동시간 API 호출 | 높음. 주소 정규화·API 키·쿼터·장애·교통수단 정책이 필요함 | 가장 현실적인 이동시간을 제공할 수 있으나 외부 API 상태와 시점에 의존함 | MVP 이후 도입 |
| 장소 점수 자체를 제외 | 가장 낮음 | 장소가 MeetPoint의 핵심 판단 요소인데 반영하지 못함 | 채택하지 않음 |

따라서 MVP에서 Rust Solver는 주소로 거리나 이동시간을 계산하지 않고, `ParticipantResponse.travelBurden`을 `EASY=25`, `NORMAL=12.5`, `HARD=0`으로 변환한다.

## 8. 현재 폴더 구조를 유지하는 이유

### 결정

다음 구조를 유지한다.

```text
meetpoint/
├─ client/
├─ services/
│  ├─ server/
│  └─ solver/
├─ infra/
├─ .gitignore
└─ README.md
```

`apps/` 구조나 Turborepo 구조로 변경하지 않는다.

### 이유

- 루트 README가 이미 Client, NestJS Server, Rust Solver, Infra의 역할과 통신 방향을 정의한다.
- 각 서비스가 독립적인 실행·빌드 도구를 갖고 있어 현재 구조만으로 책임 분리와 로컬 실행을 설명할 수 있다.
- Turborepo 도입은 workspace·캐시·공통 패키지·빌드 파이프라인을 새로 결정하게 하며, 현재 MVP 문제 해결과 직접 관련이 없다.
- 폴더 이동은 기존 Next.js·NestJS·Cargo 설정과 경로, 문서 링크를 동시에 바꿀 위험이 있다.

### 영향

공유가 필요한 계약은 문서와 API JSON으로 먼저 관리한다. 나중에 공통 타입 패키지가 정말 필요해질 때도 폴더 구조 변경은 별도의 결정으로 다룬다.

## 9. NestJS와 PostgreSQL 연결 도구

### 결정

NestJS의 PostgreSQL 접근에는 `@nestjs/typeorm`, TypeORM, `pg`를 사용한다. `synchronize=false`, `migrationsRun=false`를 유지하고, Room 단계부터 명시적인 TypeORM `DataSource`와 migration으로 스키마를 관리한다. 이번 단계에서는 Room과 방 생성에 필요한 최소 HOST Participant 엔티티·migration을 추가한다.

### 이유

- `@nestjs/typeorm`이 NestJS 모듈·의존성 주입과 자연스럽게 통합된다.
- TypeORM은 PostgreSQL과 migration을 지원하고, 엔티티를 TypeScript 클래스로 확장할 수 있어 Room·Participant·Candidate 모델을 단계적으로 추가하기 쉽다.
- 현재 스캐폴드에 도메인 모델이 없는 상태에서 Prisma schema나 별도 SQL 구조를 먼저 확정하지 않아도 된다.
- `synchronize`를 끄면 개발 중 스키마가 자동으로 바뀌는 위험을 피하고, 이후 명시적인 migration을 학습·관리할 수 있다.

### 영향

Room 단계에서는 Room과 최소 HOST Participant의 entity, repository, API, migration을 제공한다. Candidate, ParticipantResponse, ScoreResult, Decision과 일반 참여자 입장·입력 API는 이후 단계에서 추가한다. 애플리케이션 시작 시 schema 자동 동기화와 migration 자동 실행은 사용하지 않는다.

### Room과 Participant 관계 제약

Room과 Participant는 논리적으로 양방향 관계를 갖는다. DB 외래 키는 `Participant.roomId`에서 `Room.id`를 참조하도록 설정한다. `Room.hostParticipantId`는 필수 UUID 컬럼으로 저장하지만 이번 MVP에서는 DB 외래 키를 설정하지 않는다.

NestJS 서비스는 `hostParticipantId`에 해당하는 Participant가 존재하는지, 현재 Room과 같은 `roomId`인지, `role=HOST`인지 검증한다. Room ID와 Participant ID를 먼저 생성한 뒤 하나의 트랜잭션에서 Room과 HOST Participant를 저장하고, 검증 실패 시 전체를 rollback한다. PostgreSQL `DEFERRABLE` 또는 `INITIALLY DEFERRED` 외래 키는 사용하지 않으며, 추후 필요하면 DB 수준의 순환 참조 제약을 검토한다.

`roomCode`는 unique 제약을 갖고 중복 발생 시 새 코드를 생성해 재시도한다. `tokenHash`에는 조회 인덱스를 둔다.

## 10. Rust HTTP 프레임워크

### 결정

Rust Solver의 HTTP 서버에는 Axum과 Tokio를 사용한다. 기본 포트는 4000이며 `SOLVER_PORT`를 우선하고 `PORT`를 fallback으로 사용한다.

### 이유

- Axum은 Tokio 기반 비동기 HTTP 서버이며 routing과 JSON 응답 구성이 간결하다.
- 이후 `/v1/solve` 입력·출력 계약을 타입이 있는 Rust handler와 serde 구조체로 확장하기 쉽다.
- 현재 Solver는 계산 로직만 담당해야 하므로, ORM이나 DB 클라이언트를 포함하지 않는 작은 HTTP 경계를 유지할 수 있다.

### 영향

이번 단계에는 `GET /health`와 서비스 상태·현재 시각 JSON만 구현한다. 장소 검색, 이동시간 조회, 점수 계산은 추가하지 않는다.

## 11. 관련 미결정 사항

다음은 초기 결정에서 일부러 확정하지 않았다.

- Docker에서 Server·Solver까지 함께 실행하는 Compose 구성
- TypeORM migration 파일의 생성·실행 명령과 CI 적용 방식
- Room 자체의 자동 만료·자동 `CLOSED` 전환은 MVP에서 구현하지 않는다. 익명 room-scoped token 자체는 24시간 유효하고, 서버에는 원문이 아닌 해시와 만료 정보만 저장하며, Client에는 방별 `sessionStorage`에 저장한다. 방 데이터 삭제·보존 기간은 추후 결정한다.
- 배포 환경에서 PostgreSQL을 계속 컨테이너로 운영할지, 별도 운영 PostgreSQL을 사용할지
- 방과 계산 이력의 보존 기간 및 삭제 요청 정책

## 결정 요약

| 항목 | 결정 |
| --- | --- |
| API Server | NestJS, Node.js, TypeScript |
| 계산 서비스 | Rust, Cargo, 독립 HTTP Solver |
| 데이터베이스 | Docker PostgreSQL, NestJS만 직접 접근, `@nestjs/typeorm` + TypeORM + `pg` |
| Rust HTTP | Axum + Tokio, Solver 기본 포트 4000 |
| AI | 추후 NestJS에서 직접 OpenAI 호출, 점수 계산에는 사용하지 않음 |
| Frontend API | Next.js API Route/Server Action 없이 NestJS REST 호출 |
| 인증 | MVP는 로그인 없이 방 코드·방 범위 토큰, 24시간 유효·해시 저장·방별 `sessionStorage` |
| Room 단계 데이터 | Room과 최소 HOST Participant를 하나의 트랜잭션으로 생성, Candidate 등은 이후 단계 |
| Room-Participant FK | 실제 DB FK는 `Participant.roomId`에만 설정, `Room.hostParticipantId`는 NestJS 서비스에서 검증 |
| Room 만료 | Room 자동 만료 없음, 24시간 만료는 접근 토큰에만 적용 |
| 지도 | MVP 제외, 자기 기입 이동 부담(`EASY/NORMAL/HARD`) |
| 저장소 구조 | 현재 `client/services/server/services/solver/infra` 유지 |
| 모노레포 도구 | Turborepo 사용하지 않음 |
