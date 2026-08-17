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

제품 내부 기능도 같은 구성으로 확장합니다. 자연어 조건은 구조화된 데이터로 정리하고, Rust Solver는 입력 snapshot을 바탕으로 결정적인 점수와 근거를 계산하며, NestJS는 전체 흐름과 데이터 계약을 관리합니다. 현재는 Room과 HOST Participant vertical slice를 기반으로 다음 기능을 연결하고 있습니다.

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

현재는 각 프로젝트의 기본 실행 환경을 구성하는 단계이며, 이후 기능을 개발하면서 프로젝트 간 통신과 데이터 구조를 확장합니다.

## 권장 로컬 포트

| 구성 요소         | 목표 포트 | 현재 상태                                        |
| ----------------- | --------: | ------------------------------------------------ |
| `client`          |      3000 | Next.js 기본 포트                                |
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
| `CLIENT_ORIGIN`   | `http://localhost:3000`                                           | Server CORS 허용 origin       |
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
| Client        | `http://localhost:3000` | Next.js 화면       |
| NestJS Server | `http://localhost:3001` | `GET /health`      |
| Rust Solver   | `http://localhost:4000` | `GET /health`      |
| PostgreSQL    | `localhost:5432`        | Docker healthcheck |

현재 Compose 파일은 PostgreSQL만 실행하며 Docker 리소스 이름은 `meetpoint-postgres`, `meetpoint-postgres-data`, `meetpoint-network`를 사용한다. Server와 Solver를 호스트 프로세스로 실행할 때는 `localhost`를 사용한다. 추후 세 서비스를 Docker 네트워크에 넣으면 Server 컨테이너에서 PostgreSQL은 `meetpoint-postgres:5432`, Solver는 `meetpoint-solver:4000`으로 접근하고, 브라우저가 사용하는 Client → Server 주소는 공개 가능한 호스트명으로 별도 설정한다.
