# MeetPoint Solver

Rust와 Cargo로 작성하는 계산 프로젝트입니다.

## 실행 방법

```bash
cargo run
```

기본 포트는 `4000`이며 `SOLVER_PORT` 환경 변수로 변경할 수 있습니다.

## 검증

CI와 동일한 Rust 1.95.0 및 rustfmt를 설치하고 lockfile 기반으로 실행합니다.

```bash
rustup toolchain install 1.95.0 --component rustfmt
rustup override set 1.95.0
cargo fmt --check
cargo check --locked
cargo test --locked
```

Client의 `pnpm test:e2e`는 실제 Solver를 자유 포트에서 실행·정리합니다. Server 통합 테스트에 수동으로 연결할 때는 개발 Solver를 재사용하지 않고 `SOLVER_PORT=15400 cargo run --locked`처럼 별도 프로세스를 띄우세요. 전체 기동과 CI 범위는 루트 [README](../../README.md#자동-검증)에 기록되어 있습니다.

상태 확인:

```text
GET http://localhost:4000/health
```

계산 요청은 `POST http://localhost:4000/v1/solve`로 보냅니다. 현재 입력 프로필은
`CONDITION_AWARE`이며, 입력된 ParticipantCondition과 ParticipantResponse를 사용해
시간·이동 부담·예산·선호를 계산합니다. ParticipantCondition이 없어도 응답 기반 계산을
수행하고 결과에 미입력 기준을 표시합니다. 기존 결과 재현을 위해
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
