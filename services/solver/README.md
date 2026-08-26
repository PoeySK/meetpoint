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

계산 요청은 `POST http://localhost:4000/v1/solve`로 보냅니다. 현재 입력 프로필은
`CONDITION_AWARE`이며, ParticipantCondition과 ParticipantResponse를 함께 사용해
시간·이동 부담·예산·선호를 계산합니다. 기존 결과 재현을 위해
`MVP_NO_CONDITIONS` 입력도 호환하며, Solver는 PostgreSQL에 접근하지 않습니다.

응답에는 `status`, `service`, `timestamp`가 포함됩니다. `/v1/solve`는 후보별
시간·이동 부담·예산·선호 점수, 순위, coverage, 충돌과 근거를 반환합니다.

## 빌드

```bash
cargo build
```

## 테스트

```bash
cargo test
```
