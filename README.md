# MeetPoint

MeetPoint는 여러 사용자의 가능한 시간·후보별 이동 부담·예산·선호 조건을 바탕으로 모임 시간과 장소 후보를 비교하는 서비스입니다.

프론트엔드, 백엔드, 계산 로직을 각각 분리하여 개발하며, 각 기술의 역할과 통신 구조를 학습하는 것을 목표로 합니다.

## 어떻게 동작하나요?

호스트가 모임 방을 만들고 시간·장소 후보를 등록한 뒤 링크나 방 코드를 공유합니다. 참가자들은 가능한 시간과 후보별 이동 부담을 입력하고, MeetPoint는 응답을 바탕으로 후보별 점수와 충돌 지점을 비교해 보여줍니다. 결과를 확인한 호스트가 최종 후보를 직접 확정합니다.

```text
방 만들기 → 후보 등록 → 참가자 응답 → 후보 비교 → 호스트 확정
```

## AI와 함께 프로젝트를 구성하는 방식

MeetPoint는 AI를 설계·구현·검증 과정에 활용해, 아이디어를 문서·API 계약·실행 코드·테스트가 연결된 시스템으로 발전시키고 있습니다. 대화로 문제를 구체화하고, 결정된 내용을 문서와 코드로 남기며, 작은 단위의 기능을 실제 실행 결과로 확인하는 방식입니다.

```text
문제와 아이디어
  ↓ AI와 요구사항 질문·정리
제품 정의·사용자 흐름·범위
  ↓ 상태·경계·실패 조건 구체화
도메인 모델·API 계약·아키텍처 결정
  ↓ 작은 vertical slice 구현
Client·Server·DB 연결
  ↓ AI를 활용한 시나리오·보안·rollback 검토
자동 테스트·수동 검증·build
  ↓
결정과 다음 작업을 문서에 기록
```

### 개발 과정에 반영하는 방식

| 개발 단계   | AI 활용                                                               | 결과                                 |
| ----------- | --------------------------------------------------------------------- | ------------------------------------ |
| 문제 정의   | 사용자 상황과 핵심 문제를 질문으로 구체화                             | 제품 정의, 사용자 흐름               |
| 시스템 설계 | 상태, 권한, 데이터 소유권, API 경계와 실패 케이스를 정리              | 도메인 모델, API 계약, 아키텍처 결정 |
| 기능 구현   | 검증 가능한 vertical slice로 나누고 실제 Client·Server·DB 흐름을 연결 | 실행 코드와 통합 기능                |
| 품질 검증   | 입력 오류, 인증, 민감 정보, 트랜잭션 rollback 시나리오를 도출         | 단위 테스트, e2e 테스트, build 결과  |
| 반복 개선   | 실제 동작과 문서·계약을 비교해 다음 변경 사항을 구체화                | 갱신된 코드와 결정 기록              |

이 과정에서 AI는 요구사항을 구조화하고, 경계와 예외를 발견하고, 검증 시나리오를 확장하는 데 사용됩니다. 결과는 API 계약, 도메인 문서, 실행 코드, 데이터베이스 상태, 자동 테스트로 이어져 다음 작업의 기준이 됩니다.

제품 내부 기능도 같은 구성으로 확장합니다. 자연어 조건은 구조화된 데이터로 정리하고, Rust Solver는 입력 snapshot을 바탕으로 결정적인 점수와 근거를 계산하며, NestJS는 전체 흐름과 데이터 계약을 관리합니다. 현재는 방 생성·입장·개인 조건·후보 생성·수정·보관·의견 저장·계산·확정·재검토·leave/kick·개인 접근 복구가 구현되어 있습니다. 계산은 PostgreSQL outbox·lease·제한 재시도로 복구합니다.

## 프로젝트 구조

```text
meetpoint/
├─ client/                 # Next.js 프론트엔드
│  └─ README.md
│
├─ services/
│  ├─ server/              # NestJS 백엔드 API 서버
│  │  └─ README.md
│  │
│  └─ solver/              # Rust 기반 장소 계산 및 추천 로직
│     └─ README.md
│
├─ infra/                  # Docker 및 실행 환경 설정
│  └─ docker-compose.yml   # PostgreSQL 실행 구성
│
├─ .gitignore
└─ README.md
```

## 각 프로젝트의 역할

| 프로젝트          | 역할                                  | 기술                        |
| ----------------- | ------------------------------------- | --------------------------- |
| `client`          | 사용자 화면과 사용자 입력 처리        | Next.js, React, TypeScript  |
| `services/server` | API 제공, 데이터 처리, 서비스 간 연결 | NestJS, Node.js, TypeScript |
| `services/solver` | 장소 계산 및 추천 알고리즘 처리       | Rust, Cargo                 |
| `infra`           | PostgreSQL과 서비스 실행 환경 관리    | Docker, PostgreSQL          |

## 기본 통신 구조

```text
사용자
  ↓
Next.js Client
  ↓
NestJS Server
  ├─ 데이터베이스
  └─ Rust Solver
```

현재 핵심 사용자 흐름과 자동 검증·CI가 구현되어 있습니다. 다음 작업은 배포, 남용 방지, 실제 사용자 검증, 데이터 lifecycle과 운영 관측입니다. 구체적인 작업 순서는 [현재 작업 계획](docs/07-implementation-plan.md)에 기록합니다.

## 권장 로컬 포트

| 구성 요소         | 목표 포트 | 현재 상태                                        |
| ----------------- | --------: | ------------------------------------------------ |
| `client`          |     10081 | Next.js 기본 포트                                |
| `services/server` |      3001 | `SERVER_PORT` 또는 `PORT`가 없으면 3001으로 실행 |
| `services/solver` |      4000 | `SOLVER_PORT`가 없으면 4000으로 실행             |
| PostgreSQL        |      5432 | `infra/docker-compose.yml`의 PostgreSQL 컨테이너 |

위 포트는 목표 로컬 구성이다. Docker 내부 통신에서는 서비스 이름을 사용하고, 브라우저가 호출하는 Client의 Server URL은 브라우저에서 접근 가능한 주소로 별도 설정한다.

## 로컬 실행

환경 변수는 셸 또는 `services/server/.env`·루트 `.env`에 직접 설정한다. `.env` 파일은 커밋하지 않는다. 현재 로컬 기본값은 다음과 같다.

| 변수              | 기본값                                                            | 용도                          |
| ----------------- | ----------------------------------------------------------------- | ----------------------------- |
| `SERVER_PORT`     | `3001`                                                            | NestJS Server 포트            |
| `SOLVER_PORT`     | `4000`                                                            | Rust Solver 포트              |
| `CLIENT_ORIGIN`   | `http://localhost:10081`                                          | Server CORS 허용 origin       |
| `DATABASE_URL`    | `postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint` | Server의 PostgreSQL 연결 주소 |
| `SOLVER_BASE_URL` | `http://localhost:4000`                                           | Server의 Solver 연결 주소     |

`meetpoint-local`은 로컬 Docker 전용 기본 비밀번호이며 운영 환경에서 재사용하지 않는다. 운영 비밀번호와 API 키 같은 실제 비밀 값은 환경 변수나 비밀 저장소로 주입한다.

```bash
# PostgreSQL만 Docker로 실행
docker compose -f infra/docker-compose.yml up -d meetpoint-postgres

# NestJS Server — services/server에서
pnpm install
pnpm start:dev

# Rust Solver — services/solver에서
cargo run

# Next.js Client — client에서
pnpm install
pnpm dev
```

실행 후 주소는 다음과 같다.

| 서비스        | 주소                    | 확인 경로          |
| ------------- | ----------------------- | ------------------ |
| Client        | `http://localhost:10081` | Next.js 화면       |
| NestJS Server | `http://localhost:3001` | `GET /live`, `GET /ready` |
| Rust Solver   | `http://localhost:4000` | `GET /health`      |
| PostgreSQL    | `localhost:5432`        | Docker healthcheck |

개발 Compose는 PostgreSQL만 실행합니다. 전체 서비스의 최소 배포 구성은 `infra/docker-compose.deploy.yml`이며 개발 자원과 분리된 project 이름을 사용합니다. 새 환경 설정, 명시적 migration, HTTPS 같은 site 구성, backup/restore 및 rollback은 [배포 운영 절차](docs/09-deployment.md)를 따릅니다. 격리 배포 검증은 `node infra/test-deployment.cjs`로 실행합니다.

## 자동 검증

Server `/live`는 DB 장애에도 200을 반환한다. `/ready`는 DB `SELECT 1` 성공 시 200, 미설정·미초기화·실패·1초 검사 초과 시 503을 반환한다. 기존 `/health`는 HTTP 200의 진단 응답을 유지한다. Solver 장애는 일반 방 API의 readiness를 실패시키지 않으며 계산 의존성은 Solver `/health`로 별도 확인한다. E2E·CI는 상태 코드와 본문 계약을 함께 확인하고 개별 HTTP 요청은 최대 1초, 기동 대기는 최대 60초로 제한한다. 응답 timeout은 실제 DB 쿼리 취소가 아니며 끝나지 않은 검사를 공유해 누적을 막는다. 자세한 제한은 [Server README](services/server/README.md)에 기록한다.

필요 도구는 Node 24.12.0, pnpm 11.21.0, Rust 1.95.0/rustfmt, Docker Engine와 Compose v2입니다. pnpm은 `npm install --global pnpm@11.21.0`, Rust는 rustup으로 준비합니다. 실제 `.env`를 테스트용으로 복사하거나 수정하지 않습니다. 설치는 각 lockfile을 사용합니다.

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir services/server install --frozen-lockfile
pnpm --dir client exec playwright install chromium
# Linux 브라우저 시스템 라이브러리 포함 설치:
# pnpm --dir client exec playwright install --with-deps chromium
```

기존 검증은 각각 별도 명령으로 실행합니다.

```bash
cd client
pnpm test
pnpm lint
pnpm typecheck
pnpm build
cd ../services/server
pnpm lint:check
pnpm test --runInBand
pnpm build
cd ../solver
cargo fmt --check
cargo check --locked
cargo test --locked
```

Server의 `pnpm lint`는 기존대로 `--fix`를 포함하므로 CI/읽기 전용 검증에는 `lint:check`를 사용합니다. Client Node 테스트는 기존 두 파일을 직접 실행하며 `node --test` subprocess에 의존하지 않습니다.

실제 브라우저 검증은 저장소 루트에서 아래 한 명령으로 기동·migration·readiness·테스트·정리를 수행합니다. 개발 서비스를 종료하거나 재사용하지 않습니다.

```bash
pnpm --dir client test:e2e
```

브라우저 runner는 고유 `meetpoint-browser-test-<ID>` Compose project, 자유 포트, `meetpoint_browser_test_<ID>` DB, 실제 Server/Solver, 임시 Client production build를 사용합니다. PostgreSQL은 `infra/docker-compose.test.yml`의 tmpfs를 사용하며 개발 volume/network와 분리됩니다. 성공·실패·중단 시 소유 자원만 제거하고 20분 제한을 둡니다. 핵심 흐름/복구 시나리오와 안전한 실패 진단은 [Client README](client/README.md#검증)에 설명되어 있습니다.

Server 격리 통합 검증은 전용 DB와 별도 Solver를 먼저 준비합니다. 아래 명령은 Bash 기준이며 15432/15400 포트가 비어 있어야 합니다. 이미 실행 중인 개발 서비스에 연결하지 마세요. PostgreSQL project를 실행한 동일 작업에서 정리합니다.

```bash
export MEETPOINT_TEST_DB_PORT=15432
docker compose -f infra/docker-compose.test.yml -p meetpoint-server-verification up -d --wait
# 별도 터미널에서 실행하고 완료 후 이 프로세스만 Ctrl+C로 종료:
# cd services/solver && SOLVER_PORT=15400 cargo run --locked
cd services/server
DATABASE_URL=postgresql://meetpoint_test:test-only-password@localhost:15432/postgres \
SOLVER_BASE_URL=http://localhost:15400 RUN_CALCULATION_E2E=true pnpm test:integration
cd ../..
docker compose -f infra/docker-compose.test.yml -p meetpoint-server-verification down --volumes --remove-orphans
```

PowerShell에서는 같은 변수들을 `$env:MEETPOINT_TEST_DB_PORT = '15432'`, `$env:SOLVER_PORT = '15400'`, `$env:DATABASE_URL = 'postgresql://meetpoint_test:test-only-password@localhost:15432/postgres'`, `$env:SOLVER_BASE_URL = 'http://localhost:15400'`, `$env:RUN_CALCULATION_E2E = 'true'`로 해당 터미널에 설정하고 `pnpm test:integration`을 실행합니다. DB 컨테이너와 별도 Solver를 준비하는 순서는 같습니다.

`test:integration`은 임시 DB 생성·migration·기존 `test:e2e` Jest 실행·DB 제거를 담당합니다. `RUN_CALCULATION_E2E=true`를 명시하지 않은 실행은 실제 계산 테스트가 생략되므로 전체 통합 검증으로 보지 않습니다. readiness/정리 방식은 [Server README](services/server/README.md#검증)에 있습니다.

`.github/workflows/verification.yml`은 모든 pull request와 기본 브랜치 `master` push에서 실행합니다. 읽기 권한만 사용하며 Client 테스트/lint/typecheck/build, Server 검사 lint/단위·HTTP/build/전용 PostgreSQL+실제 Solver 통합, Rust fmt/check/test를 수행한 뒤 브라우저 job을 실행합니다. frozen lockfile 설치, 단일 browser worker, retry 0회, job timeout을 사용합니다. 테스트 DB 자격 증명만 포함하고 실제 secret은 필요하지 않습니다. job마다 환경이 분리되어 Server/Solver 빌드 일부는 독립적으로 반복됩니다.

CI artifact는 자격 증명이 없는 `browser-safe-summary`만 7일 보관합니다. trace/HAR, 다운로드한 복구 파일, 원본 오류/로그, DOM, storageState, 영상·스크린샷은 업로드하지 않습니다. 강제 OS 종료처럼 runner 정리가 불가능했던 경우 실행 ID가 붙은 테스트 project만 확인해 제거합니다.

현재 브라우저 검증은 Chromium 데스크톱·localhost HTTP의 개발 쿠키 정책입니다. HTTPS의 production Secure 쿠키, 실제 배포 CORS/프록시, 모바일·Firefox·WebKit은 별도 검증이 필요합니다. 로컬 통과는 GitHub Actions 실행 성공을 의미하지 않습니다. 커밋/push 후 실제 Actions 결과를 따로 확인해야 합니다.
