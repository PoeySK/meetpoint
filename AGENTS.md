# MeetPoint 개발 지침

이 문서는 저장소 전체에 적용되는 작업 지침이다. 더 깊은 경로에 있는 `AGENTS.md`가 있으면 해당 경로에서는 더 구체적인 지침을 우선한다. 기존 `client/AGENTS.md`의 Next.js 관련 지침도 함께 따른다.

## 기본 원칙

- 작업 전에 관련 코드, API 계약, 결정 문서, 테스트 설정을 확인한다.
- 사용자가 요청한 범위만 변경하고, 관련 없는 리팩터링이나 파일 이동을 함께 하지 않는다.
- 실제 API 응답과 기존 테스트를 기준으로 구현한다. 계약과 코드가 다르면 임의로 추측하지 말고 차이와 최소 수정안을 보고한다.
- 운영 코드와 테스트 코드를 구분한다. 테스트를 위해 운영 테이블, 운영 데이터, 환경 설정을 임시로 훼손하지 않는다.
- 토큰, 비밀번호, API 키, 원문 인증 정보는 로그·화면·커밋·테스트 출력에 노출하지 않는다.
- 환경 변수는 `.env.example`에 이름과 안전한 예시만 기록하고 실제 비밀 값은 커밋하지 않는다.
- 변경 후에는 해당 영역에서 사용할 수 있는 lint, test, build를 실행하고 명령과 결과를 보고한다.
- 커밋이나 브랜치 조작은 사용자가 명시적으로 요청한 경우에만 수행한다.

## 프로젝트 경계

```text
client/          Next.js 웹 클라이언트
services/server/ NestJS REST API, 도메인 로직, PostgreSQL 접근
services/solver/ Rust 계산 HTTP 서비스
infra/           Docker Compose와 실행 환경 설정
docs/            제품·도메인·API·아키텍처 문서
```

- 브라우저는 NestJS API만 호출한다. DB와 Solver를 client에서 직접 호출하지 않는다.
- Room, Participant, Candidate, ScoreResult, Decision의 원본 상태와 트랜잭션은 server가 소유한다.
- Solver는 계산에 집중하고 인증, DB 상태 변경, 최종 결정 권한을 갖지 않는다.
- OpenAI 연동이 추가되더라도 client가 직접 호출하지 않고 server를 통해 호출한다.

## Frontend: FSD 구조

`client`는 Next.js App Router 위에 Feature-Sliced Design(FSD)을 적용한다. 현재 루트 구조를 대규모로 옮기지 말고, 새 기능부터 아래 경계를 따른다.

```text
client/
├─ app/                 Next.js 라우팅·layout·provider·얇은 route entry
├─ widgets/             여러 기능과 엔티티를 조합한 화면 단위
├─ features/            사용자의 행동·유스케이스 단위
├─ entities/            Room, Participant 같은 도메인 단위
└─ shared/              재사용 UI, API client, 설정, 공통 타입·유틸리티
   ├─ ui/
   ├─ api/
   ├─ config/
   ├─ lib/
   └─ types/
```

- `app/**/page.tsx`와 `layout.tsx`는 라우팅과 조합을 담당하고, 복잡한 상태·검증·API 호출을 직접 갖지 않게 한다.
- `features/<feature-name>`에는 `create-room`, `copy-room-code`처럼 사용자의 목적을 기준으로 코드를 둔다.
- `entities/<entity-name>`에는 Room/Participant의 타입, 표시 모델, 도메인 관련 UI를 둔다.
- `widgets/<widget-name>`에는 생성 폼, 대기 화면처럼 여러 feature/entity를 묶은 화면 블록을 둔다.
- 공통 API 호출은 `shared/api` 또는 해당 feature의 API 모듈에 둔다. 화면 컴포넌트에서 `fetch`를 반복하지 않는다.
- 의존 방향은 `app → widgets → features → entities → shared`를 기본으로 한다. 하위 계층이 상위 계층을 import하지 않는다.
- 같은 계층의 slice끼리 내부 파일을 직접 import하지 말고, 필요한 경우 각 slice의 공개 `index.ts`를 사용한다.
- 전역 상태는 필요한 경우에만 사용한다. Room token처럼 브라우저 전용 값은 서버 렌더링 시점에 접근하지 않는다.
- `NEXT_PUBLIC_` 환경 변수에는 브라우저에 공개되어도 되는 값만 둔다. 현재 Next.js client가 자동으로 읽는 환경 파일은 `client` 디렉터리 기준이다.
- 새 UI는 기존 Tailwind 및 client 스타일 방식과 모바일 화면을 함께 고려한다.

## Backend: feature-first modular monolith

`services/server`는 NestJS feature-first modular monolith를 기본으로 하고, 기능이 커질 때만 가벼운 Clean Architecture/Hexagonal 경계를 추가한다.

```text
services/server/src/
├─ main.ts, app.module.ts
├─ common/                  공통 guard, filter, interceptor, pipe, decorator
├─ config/                  환경 변수 로딩·검증
├─ database/                DataSource와 migration
└─ <feature>/               rooms, participants 등 기능별 모듈
   ├─ <feature>.module.ts
   ├─ <feature>.controller.ts 또는 presentation/http/
   ├─ dto/ 또는 presentation/http/dto/
   ├─ <feature>.service.ts 또는 application/
   ├─ domain/
   └─ infrastructure/      TypeORM repository와 외부 서비스 adapter
```

- 작은 기능은 현재의 `src/rooms`, `src/participants`처럼 feature 폴더 안에 유지한다. 기능이 커질 때만 `presentation`, `application`, `domain`, `infrastructure`로 세분화한다.
- Controller는 HTTP 입력·인증·응답 매핑만 담당한다.
- Service/application은 유스케이스와 트랜잭션 경계를 담당한다.
- Domain은 외부 프레임워크에 덜 의존하는 규칙과 상태 전이를 담당한다.
- TypeORM entity/repository, HTTP client, Solver/OpenAI adapter는 infrastructure 경계에 둔다.
- `common`에는 정말 여러 기능에서 공유하는 코드만 둔다. 특정 Room 규칙을 `common`에 넣지 않는다.
- Room 생성과 Participant 생성처럼 원자성이 필요한 변경은 하나의 명확한 트랜잭션 경계에서 처리하고 rollback을 테스트한다.
- DTO validation, 인증 실패, 공개 응답 필드와 민감 필드 분리를 테스트로 고정한다.
- migration은 `services/server/src/database/migrations`에 추가하고 `synchronize`로 스키마를 변경하지 않는다.

## Solver와 인프라

- `services/solver`는 Rust/Cargo 표준 구조를 따르고, HTTP 입력·출력 schema와 계산 순수성을 분리한다.
- Solver가 DB나 사용자 인증을 직접 소유하지 않도록 한다. 필요한 데이터는 server가 검증한 입력 snapshot으로 전달한다.
- `infra/docker-compose.yml`은 로컬 의존 서비스의 진입점으로 유지한다. 컨테이너 간 연결에는 서비스 DNS를, 브라우저가 호출하는 URL에는 공개 가능한 client 환경 변수를 사용한다.
- 인프라 설정은 코드로 재현 가능하게 작성하고 healthcheck, 명시적 포트, named volume 등 기존 방식을 유지한다.
- 환경별 설정은 개발·테스트·운영을 분리한다. 비밀 값은 Secret Manager 또는 배포 환경 주입을 사용하며 저장소에 넣지 않는다.
- 새 인프라를 도입할 때는 먼저 현재 Docker Compose와 실행 스크립트로 충분한지 확인하고, Kubernetes나 Terraform 같은 도구를 필요 이상으로 추가하지 않는다.

## 문서와 API 계약

- API 변경 전 `docs/04-api-contract.md`와 해당 controller/e2e 테스트를 함께 확인한다.
- 계약 문서, DTO, 실제 응답, client 타입이 서로 다르면 어느 것이 기준인지 확인하고 최소 범위로 정렬한다.
- 기능을 추가하면 필요한 경우 결정 문서나 실행 방법을 갱신하되, 코드와 무관한 문서 변경은 섞지 않는다.

## 검증 기본값

변경 영역에 맞춰 다음 명령을 우선 사용한다. 실행 위치는 각 package의 디렉터리다.

```text
client:          pnpm lint, pnpm build
services/server: pnpm lint, pnpm test, pnpm test:e2e, pnpm build
services/solver: cargo fmt --check, cargo check, cargo test
```

DB나 외부 서비스가 필요한 검증은 실행 전 의존성 상태를 확인하고, 테스트 데이터는 식별 가능한 임시 데이터로 제한하며 기존 개발 데이터는 삭제하지 않는다.

## Git 커밋 추천 형식

사용자가 커밋 추천을 요청하면 아래 형식을 그대로 사용한다. `{역할}`은 `FE`, `BE`, `Solver`, `Infra`, `Docs`, `전체` 중 변경 범위를 가장 잘 설명하는 값으로 쓴다.

```text
{역할}: 구현 기능 설명 (1줄)

- 세부 구현 기능 설명 (1줄)
- 세부 구현 기능 설명 (1줄)
- ...

{역할}
- feat: 새로운 기능 구현
- chore: 코드 실행과 상관없는 코드 작성
- style: 스타일 변경
- docs: 주석 및 문서 작성
- remove: 파일 삭제
- refactor: 코드 리팩토링
```

- 제목은 한 줄로 쓰고, 본문은 실제 변경 사항만 항목별로 쓴다.
- 한 커밋에 역할과 성격이 섞이면 커밋을 나누는 것을 우선 추천한다.
- 사용자가 요청하지 않은 `git add`, `commit`, `push`는 실행하지 않는다.

## 추가 작업 원칙

These instructions prioritize safe, minimal, verifiable code changes over
speed. For trivial tasks, use judgment and avoid unnecessary process.

### 1. Think Before Coding

Do not assume silently. Do not hide uncertainty.

Before implementing:

- State important assumptions explicitly.
- If multiple valid interpretations exist and they affect implementation, ask
  before changing code.
- If the ambiguity is minor, make a conservative assumption and mention it in
  the final response.
- If a simpler approach solves the request, prefer it.
- Push back when the requested approach is likely to create unnecessary
  complexity or risk.

### 2. Simplicity First

Write the minimum code needed to solve the requested problem.

- Do not add features beyond the request.
- Do not create abstractions for single-use code.
- Do not add configurability unless requested.
- Do not add defensive code for impossible or irrelevant scenarios.
- If the implementation becomes large, look for a simpler version before
  continuing.

Ask: "Would a senior engineer consider this overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

Change only what is necessary.

When editing existing code:

- Do not improve adjacent code unless required.
- Do not refactor unrelated code.
- Do not reformat unrelated files.
- Match the existing project style, even if another style seems preferable.
- If unrelated dead code is found, mention it instead of deleting it.

Cleanup rule:

- Remove imports, variables, functions, or files that became unused because of
  your own changes.
- Do not remove pre-existing dead code unless explicitly asked.

Every changed line should trace directly to the user request.

### 4. Goal-Driven Execution

Turn tasks into verifiable goals.

For multi-step tasks, use a short plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Examples:

- "Add validation" → add or update tests for invalid inputs, then make them
  pass.
- "Fix a bug" → reproduce the bug first if possible, then fix it.
- "Refactor X" → verify behavior before and after the refactor.

### 5. Verification

After code changes:

- Run the most relevant tests, type checks, lint checks, or build commands
  available in the project.
- If a check cannot be run, explain why.
- Summarize what changed and how it was verified.
- Mention any remaining risks or assumptions.

### 6. Definition of Done

A task is complete only when:

- The requested behavior is implemented.
- Unrelated code is untouched.
- The diff is minimal and reviewable.
- Relevant verification has been run or clearly explained.
- The final response includes changed files, verification results, and any
  caveats.
