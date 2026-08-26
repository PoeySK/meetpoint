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
반환한다. NestJS는 현재 Solver 호출을 프로세스 내부 비동기 작업으로 실행하며,
Client는 계산 결과 API를 polling한다.

- 계산 시작은 HOST만 가능하다.
- Room이 `CALCULATING`인 동안 두 번째 계산 요청은 거부한다.
- 성공하면 `COMPLETED`를 저장하고 Room을 `CALCULATED`로 바꾼다.
- timeout, 연결 실패, Solver 출력 검증 실패는 `FAILED`를 저장하고 Room을 `OPEN`으로
  되돌린다.
- Queue나 Redis는 아직 사용하지 않는다. NestJS가 재시작되면 실행 중인 계산이
  `RUNNING` 상태로 남을 수 있으며, 재시작 복구·재시도는 현재 작업 계획의
  계산 내구성 작업에서 해결한다.

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
