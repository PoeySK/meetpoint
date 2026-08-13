# MeetPoint

MeetPoint는 여러 사용자의 위치와 조건을 바탕으로 적절한 모임 장소를 추천하는 서비스입니다.

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
| `infra`           | 데이터베이스와 서비스 실행 환경 관리  | Docker                      |

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
