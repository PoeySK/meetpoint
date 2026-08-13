# MeetPoint

MeetPoint는 여러 사용자의 가능한 시간·후보별 이동 부담·예산·선호 조건을 바탕으로 모임 시간과 장소 후보를 비교하는 서비스입니다.

프론트엔드, 백엔드, 계산 로직을 각각 분리하여 개발하며, 각 기술의 역할과 통신 구조를 학습하는 것을 목표로 합니다.

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
| `infra`           | PostgreSQL과 서비스 실행 환경 관리   | Docker, PostgreSQL          |

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

| 구성 요소 | 목표 포트 | 현재 상태 |
| --- | ---: | --- |
| `client` | 3000 | Next.js 기본 포트 |
| `services/server` | 3001 | `SERVER_PORT` 또는 `PORT`가 없으면 3001으로 실행 |
| `services/solver` | 4000 | `SOLVER_PORT`가 없으면 4000으로 실행 |
| PostgreSQL | 5432 | `infra/docker-compose.yml`의 PostgreSQL 컨테이너 |

위 포트는 목표 로컬 구성이다. Docker 내부 통신에서는 서비스 이름을 사용하고, 브라우저가 호출하는 Client의 Server URL은 브라우저에서 접근 가능한 주소로 별도 설정한다.

## 로컬 실행

환경 변수는 셸 또는 `services/server/.env`·루트 `.env`에 직접 설정한다. `.env` 파일은 커밋하지 않는다. 현재 로컬 기본값은 다음과 같다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `SERVER_PORT` | `3001` | NestJS Server 포트 |
| `SOLVER_PORT` | `4000` | Rust Solver 포트 |
| `CLIENT_ORIGIN` | `http://localhost:3000` | Server CORS 허용 origin |
| `DATABASE_URL` | `postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint` | Server의 PostgreSQL 연결 주소 |
| `SOLVER_BASE_URL` | `http://localhost:4000` | Server의 Solver 연결 주소 |

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

| 서비스 | 주소 | 확인 경로 |
| --- | --- | --- |
| Client | `http://localhost:3000` | Next.js 화면 |
| NestJS Server | `http://localhost:3001` | `GET /health` |
| Rust Solver | `http://localhost:4000` | `GET /health` |
| PostgreSQL | `localhost:5432` | Docker healthcheck |

현재 Compose 파일은 PostgreSQL만 실행하며 Docker 리소스 이름은 `meetpoint-postgres`, `meetpoint-postgres-data`, `meetpoint-network`를 사용한다. Server와 Solver를 호스트 프로세스로 실행할 때는 `localhost`를 사용한다. 추후 세 서비스를 Docker 네트워크에 넣으면 Server 컨테이너에서 PostgreSQL은 `meetpoint-postgres:5432`, Solver는 `meetpoint-solver:4000`으로 접근하고, 브라우저가 사용하는 Client → Server 주소는 공개 가능한 호스트명으로 별도 설정한다.
