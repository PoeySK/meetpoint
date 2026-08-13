# MeetPoint Solver

Rust와 Cargo로 작성하는 계산 프로젝트입니다.

## 실행 방법

```bash
cargo run
```

기본 포트는 `4000`이며 `SOLVER_PORT` 환경 변수로 변경할 수 있습니다.

상태 확인:

```text
GET http://localhost:4000/health
```

응답에는 `status`, `service`, `timestamp`가 포함됩니다. 이번 단계에는 장소 계산과 점수 계산 로직을 포함하지 않습니다.

## 빌드

```bash
cargo build
```

## 테스트

```bash
cargo test
```
