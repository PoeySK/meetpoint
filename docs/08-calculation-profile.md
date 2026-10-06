# 기존 계산 프로필 호환 규칙

이 문서는 이미 저장된 결과와 외부에서 직접 호출하는 Solver 요청을 재현하기 위한
기존 호환 프로필을 설명한다. 현재 Server가 새로 생성하는 계산은
`CONDITION_AWARE` 프로필을 사용하며 ParticipantCondition과 ParticipantResponse를
함께 Solver에 전달한다.

## 입력 경계

참여자별 계산 입력은 다음 응답이다.

- `availabilityStatus`: `AVAILABLE`, `MAYBE`, `UNAVAILABLE`
- `travelBurden`: `EASY`, `NORMAL`, `HARD`

기존 `mvp-1` 정책의 가중치는 시간 40, 이동 부담 25, 예산 20, 선호 15다.
이 프로필은 조건 입력이 없는 과거 요청을 처리하며, 예산·선호를 기본 점수로 계산하고
`CONDITION_INCOMPLETE`, 예산 충돌, 선호 충돌을 생성하지 않는다.

새 계산의 조건 기반 규칙은 [docs/05-scoring-model.md](05-scoring-model.md)와
`CONDITION_AWARE` 계약을 기준으로 한다.

## 계산 lifecycle

`POST /api/v1/rooms/{roomId}/calculations`는 `ScoreResult`를 만들고 `202 Accepted`를
반환한다. 요청 transaction은 Room·ScoreResult와 snapshot을 담은 PostgreSQL
`calculation_jobs` outbox를 함께 저장한다. Client는 계산 결과 API를 polling한다.

- HOST만 시작하며 `CALCULATING` 중 중복 시작은 거부한다.
- Worker는 row lock과 lease로 claim하고 `REQUESTED` → `RUNNING`으로 진행한다.
- 성공은 Room·ScoreResult·Job을 같은 transaction에서 저장한다.
- timeout·연결 실패 등 재시도 가능한 오류는 제한 횟수까지 재요청한다. 영구 오류 또는 한도 초과만 `FAILED`로 확정하고 Room을 `OPEN`으로 되돌린다.
- 시작/polling에서 만료 lease를 재claim한다. claim 시각·시도 횟수로 오래된 worker의 저장을 차단한다.
- DB 저장 오류는 rollback 후 drain을 종료하고 다음 polling/lease 만료로 복구한다.
- 종료 시 새 claim과 polling을 중지한다. 진행 중 작업의 종료 대기는 없고 저장되지 않은 작업은 lease로 복구한다.
- 같은 snapshot의 Solver 재호출은 가능하며 외부 호출의 exactly-once는 보장하지 않는다. Redis는 사용하지 않는다.

자세한 실패 경계와 테스트 근거는 [현재 작업 계획](07-implementation-plan.md)의 계산 내구성 항목을 따른다.

## 결과 metadata

```json
{
  "scoringProfile": "MVP_NO_CONDITIONS",
  "weights": {
    "time": 40,
    "travelBurden": 25,
    "budget": 20,
    "preference": 15
  }
}
```

`MVP_NO_CONDITIONS`와 `mvp-1`을 새 이름으로 교체하려면 Solver, Server, Client,
저장 결과, API 계약, 테스트를 함께 변경하는 정책 버전 migration이 필요하다.
그 전까지는 사용자 화면에 이 내부 식별자를 표시하지 않는다.
