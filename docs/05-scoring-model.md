# MeetPoint 후보 점수 계산 모델

## 문서 상태

- **확정**: 점수 계산은 GPT가 아니라 Rust Solver가 담당한다. NestJS는 입력 스냅샷을 만들고 Solver 결과를 저장·전달한다.
- **확정**: MVP의 모든 참가자는 동일한 기본 가중치를 사용하고, 계산은 `policyVersion: mvp-1` 규칙으로 결정적으로 수행한다.
- **확정**: 미응답 후보를 찬성으로 간주하지 않는다. 점수에는 0으로 반영하고 커버리지·충돌 표시를 남기며, 미응답 상태에서는 최종 확정을 막는다.
- **미결정**: MVP 사용성 검증 이후 가중치나 선호 태그 체계를 바꿀지, 바꾼다면 기존 결과를 어떻게 재현할지는 별도 결정한다. 정책 버전은 바뀐 규칙을 식별하는 데 사용한다.

## 1. 계산 대상과 기본 정책

하나의 계산은 다음 입력 스냅샷을 사용한다.

```json
{
  "policyVersion": "mvp-1",
  "weights": {
    "time": 40,
    "travelBurden": 25,
    "budget": 20,
    "preference": 15
  },
  "participants": 3,
  "activeCandidates": 2
}
```

후보 하나에 대해 참가자별 0~100 점수를 만들고, 모든 활성 참가자의 평균을 후보 총점으로 만든다. 호스트도 다른 참가자와 같은 가중치를 받는다. 특정 사람이 “더 중요한 사람”이라는 설정은 MVP에 없다.

### 계산 순서

1. 후보의 시간·장소·비용·태그와 참가자의 개인 조건·후보별 응답을 정규화한다.
2. 참가자별로 시간, 이동, 예산, 선호 점수를 계산한다.
3. 필수 조건 위반과 미응답을 구조화된 충돌로 기록한다.
4. 참가자별 점수의 평균을 후보 총점으로 계산한다. 미응답도 분모에 포함한다.
5. 후보의 `eligible`, `coverage`, `recommendationStatus`를 결정한다.
6. 결정적 정렬 규칙으로 순위를 만든다.

## 2. 가능한 시간 조건 반영

참여자는 개인 조건에 가능한 시간 구간을 저장하고, 후보마다 `availabilityStatus`를 제출한다.

| 응답 | 시간 점수(40점) | 의미 | 하드 충돌 |
| --- | ---: | --- | --- |
| `AVAILABLE` | 40 | 후보 시간에 참여 가능 | 없음 |
| `MAYBE` | 20 | 조정하면 가능하지만 확정적이지 않음 | 없음. 단, 설명 플래그 표시 |
| `UNAVAILABLE` | 0 | 참여할 수 없음 | `TIME_UNAVAILABLE` |

- `AVAILABLE`은 후보 시간이 적어도 하나의 가능한 시간 구간과 겹쳐야 한다. 서버가 이 규칙을 먼저 검증한다.
- `MAYBE`는 투표의 반쪽 찬성이 아니라 불확실성으로 표시한다. 20점을 주지만 “모두가 확실히 가능”으로 설명하지 않는다.
- `UNAVAILABLE`인 참가자가 한 명이라도 있으면 후보는 `eligible=false`다.
- 시간 구간의 날짜와 시간대는 후보의 `time`과 같은 기준으로 비교한다. 시간대 변환 후 실제 순간의 겹침을 계산한다.

## 3. 이동 부담 또는 위치 조건 반영

MVP에는 지도·실제 이동시간·좌표 기반 거리 API가 없다. 장소의 주소에서 Rust가 이동거리나 이동시간을 추정하지 않는다. 참여자가 각 후보에 대해 자신의 체감 이동 부담을 직접 선택한다.

`ParticipantResponse.travelBurden`은 다음 세 값만 허용한다.

| 응답 | 이동 점수(25점) | 의미 | 하드 충돌 |
| --- | ---: | --- | --- |
| `EASY` | 25 | 이동이 편하고 큰 부담이 없음 | 없음 |
| `NORMAL` | 12.5 | 조정 가능하지만 부담이 있음 | 없음. `TRAVEL_BURDEN_UNCERTAIN` 표시 |
| `HARD` | 0 | 이동이 매우 부담스럽거나 사실상 어려움 | `TRAVEL_BURDEN_HARD` |

- `travelBurden`은 모든 활성 후보에 필수다. 응답 자체가 없으면 `MISSING_RESPONSE`로 처리한다.
- 이 값은 참가자의 주관적 평가이므로 결과 화면에 `SELF_REPORTED_TRAVEL_BURDEN` 플래그를 표시한다.
- `place.name`, `place.address`, `place.area`는 MVP에서 표시용이다. `Candidate.tags`는 선호 점수에, 후보 비용은 예산 점수에 사용한다.
- `ParticipantResponse.note`는 참가자에게 다시 보여주는 설명용 값이며 계산 입력에는 포함하지 않는다.
- 숫자 이동시간이나 실제 거리로 환산하지 않는다. 따라서 결과 문장도 “예상 이동 25분”이 아니라 “참여자 평가: 이동 부담 EASY”라고 표시한다.

## 4. 예산 조건 반영

후보의 `estimatedCostPerPersonKrw = C`와 참가자의 `maxBudgetKrw = B`를 비교한다.

- `B`가 `null`이면 예산 제한이 없는 것으로 보고 20점을 준다. `NO_BUDGET_CONSTRAINT`를 표시한다.
- `B = 0`이면 `C = 0`일 때만 20점, 그 외에는 0점이다.
- `0 <= C <= B`이면 20점이다.
- `B < C <= 2B`이면 `20 × (2 - C/B)` 점이다.
- `C > 2B`이면 0점이다.
- `C > B`이면 `BUDGET_LIMIT_EXCEEDED` 하드 충돌이다. 예산 초과를 선호도 점수의 작은 감점으로 숨기지 않는다.

예를 들어 최대 예산 25,000원, 후보 비용 28,000원이면:

```text
budgetScore = 20 × (2 - 28,000 / 25,000)
            = 20 × 0.88
            = 17.6점
```

이 경우 점수는 17.6점이지만 `BUDGET_LIMIT_EXCEEDED`가 있으므로 후보 `eligible`은 false다.

## 5. 개인 선호도 반영

후보의 `tags`와 개인 조건의 세 종류 태그를 비교한다. 선호 점수는 총 15점이다.

### 필수·회피 조건 10점

- 모든 `requiredTags`가 후보 태그에 있고, 모든 `avoidTags`가 후보 태그에 없으면 10점
- 필수 태그 하나라도 없거나 회피 태그가 하나라도 있으면 0점
- 이 위반은 각각 `REQUIRED_TAG_MISSING` 또는 `AVOID_TAG_PRESENT` 하드 충돌이다.

### 선호 조건 5점

```text
preferredScore = 5 × (matchedPreferredTags / preferredTags의 개수)
```

- 선호 태그가 2개이고 1개가 맞으면 2.5점
- 선호 태그가 없으면 제한이 없는 것으로 보고 5점을 준다.
- 태그가 없거나 매핑되지 않은 자연어는 Solver가 추측하지 않는다. 서버가 정규화된 태그로 저장하지 못한 조건은 `PREFERENCE_UNEVALUATED`로 표시한다.

### 선호도 예시

개인 조건이 `requiredTags=["INDOOR"]`, `preferredTags=["QUIET"]`, `avoidTags=["SMOKING"]`이고 후보 태그가 `["INDOOR", "QUIET"]`이면:

```text
hardPreferenceScore = 10  // 필수 충족, 회피 태그 없음
preferredScore       = 5   // QUIET 1개 중 1개 일치
preferenceScore      = 15
```

## 6. 참여자별 가중치 적용 여부

MVP에서는 **참여자별 숫자 가중치를 적용하지 않는다**.

- 모든 참가자는 시간 40, 이동 25, 예산 20, 선호 15의 동일한 구성으로 계산한다.
- 호스트에게 별도 가중치를 주지 않는다.
- “나는 예산이 절대 조건이고 다른 사람은 선호만 중요하다”는 차이는 `maxBudgetKrw`, 필수 태그, 선호 태그 같은 조건의 종류로 표현한다.
- 참여자가 임의로 자신의 점수를 2배로 만들거나 다른 사람의 점수를 낮추는 입력은 받지 않는다.

추후 사용성 검증에서 개인별 중요도를 제공하기로 결정하면 새로운 `policyVersion`과 입력 스키마를 함께 정의해야 한다. 기존 결과를 같은 정책으로 재현할 수 있어야 한다.

## 7. 후보 총점과 조건 충족 처리

참가자 수를 `P`, 참가자 `i`의 후보 점수를 `S_i`라고 할 때:

```text
overallScore = round_half_up((S_1 + S_2 + ... + S_P) / P, 1)
```

- 계산 내부에서는 가능한 한 소수로 유지하고 최종 표시 점수만 소수 첫째 자리에서 반올림한다.
- 후보에 하드 충돌이 하나라도 있으면 `eligible=false`, `matchLevel=CONFLICTED`다.
- 모든 참가자의 응답이 있고 하드 충돌이 없으면 `eligible=true`다.
- `matchLevel=FULL`은 모든 참가자가 `AVAILABLE`이고 이동 부담도 모두 `EASY`인 후보다.
- `matchLevel=PARTIAL`은 응답은 완전하지만 `MAYBE` 또는 `NORMAL`이 하나 이상 있는 후보이며, 완전 일치로 표현하지 않는다.
- `matchLevel=INCOMPLETE`는 미응답이 있는 후보다. 이 후보는 `eligible=false`다.
- 계산 전체의 `recommendationStatus`는 다음 우선순위로 정한다. 미응답이 있으면 일부 후보의 점수가 높아도 결과 전체를 완전 비교로 표시하지 않는다.
  1. `INCOMPLETE`: 하나 이상의 후보가 `INCOMPLETE`임
  2. `FULL_MATCH`: `INCOMPLETE`가 없고 `FULL` 후보가 하나 이상 있음
  3. `PARTIAL_MATCH`: `INCOMPLETE`와 `FULL`이 없고 `PARTIAL` 후보가 하나 이상 있음
  4. `NO_FULL_MATCH`: 모든 후보가 `CONFLICTED`이고 미응답이 없음
- `recommendationWarnings`는 점수의 의미를 보완하는 전체 결과 경고 배열이다. 미응답이 없어 모든 후보가 `INCOMPLETE`가 아닌 상태에서 최고 `overallScore`가 `60.0` 미만이면 `["LOW_SCORE"]`를 넣고, 그렇지 않으면 빈 배열을 반환한다. 미응답이 있으면 `INCOMPLETE`와 `MISSING_RESPONSE`가 우선한다. 이 경고는 점수·순위를 바꾸지 않지만, 호스트의 최종 선택에는 `acknowledgeIssues=true`가 필요하다.
- `NO_FULL_MATCH`, `PARTIAL_MATCH` 또는 `LOW_SCORE` 경고가 있는 결과에서도 호스트는 후보를 선택할 수 있다. 이때 충돌·불확실성·낮은 점수를 확인하고 결정 메모리를 남긴다.

## 8. 미응답 참가자 처리

활성 참가자 수가 `P`, 활성 후보 수가 `C`이면 기대 응답 수는 `P × C`다.

- 특정 참가자가 특정 후보에 응답하지 않으면 해당 후보의 그 참가자 점수는 0점이다.
- 미응답 참가자를 후보의 평균 분모에서 빼지 않는다. 미응답이 결과를 유리하게 만들지 않도록 한다.
- 후보별 `coverage`는 `제출된 응답 수 / 기대 응답 수`로 표시한다.
- `MISSING_RESPONSE`는 조건 충돌과 별도의 결과 차단 사유다.
- 미응답이 하나라도 있으면 계산 결과는 조회할 수 있지만 `eligible=false`이며 최종 확정은 거부한다.
- 호스트가 다시 계산해도 미응답이 자동으로 `AVAILABLE`로 채워지지 않는다.

예를 들어 참가자 4명, 후보 3개인데 응답이 10개만 있으면:

```json
{
  "coverage": {
    "submittedResponses": 10,
    "expectedResponses": 12,
    "ratio": 0.8333
  },
  "blockingIssues": ["MISSING_RESPONSE"]
}
```

## 9. 동점 후보 처리

표시 점수가 같아도 순위가 실행 순서에 따라 달라지지 않도록 다음 순서로 정렬한다.

1. `eligible=true`인 후보를 먼저 둔다.
2. 원시 `overallScore`가 높은 후보를 먼저 둔다.
3. 참가자별 점수 중 최솟값(`minimumParticipantScore`)이 높은 후보를 먼저 둔다. 한 사람의 큰 손해를 줄이기 위한 기준이다.
4. 하드 충돌 수가 적은 후보를 먼저 둔다.
5. `Candidate.displayOrder`가 작은 후보를 먼저 둔다.

표시 점수가 소수 첫째 자리에서 같고 1~4번 기준으로만 순서가 갈리면 UI에는 `동점 그룹`을 함께 표시한다. `displayOrder`는 결과를 재현하기 위한 마지막 tie-breaker이며, 투표 수를 의미하지 않는다.

## 10. 점수만으로 설명하기 어려운 경우

점수 옆에 아래의 구조화된 `explanationFlags`를 표시한다. 자유 문장만 생성하지 않고 원인 코드와 입력값을 함께 둔다.

| 플래그 | 표시 이유 |
| --- | --- |
| `SELF_REPORTED_TRAVEL_BURDEN` | 이동 부담이 참여자의 자기 평가임 |
| `MAYBE_RESPONSE` | 시간 응답이 확정 가능이 아니라 조정 가능임 |
| `NO_BUDGET_CONSTRAINT` | 예산 제한이 없어 예산 점수를 만점 처리함 |
| `PREFERENCE_UNEVALUATED` | 정규화된 태그로 비교하지 못함 |
| `MISSING_RESPONSE` | 후보별 응답이 없음 |
| `NO_FULL_MATCH` | 모든 후보에 하드 충돌이 하나 이상 있음 |
| `TRAVEL_BURDEN_UNCERTAIN` | 이동 부담이 `NORMAL`임 |
| `ISSUES_ACKNOWLEDGED` | 호스트가 불확실성 또는 충돌을 인지하고 최종 확정함 |

근거 문장은 다음처럼 규칙 템플릿으로 만든다.

```json
{
  "code": "TRAVEL_BURDEN_HARD",
  "participantId": "participant_01",
  "values": {
    "travelBurden": "HARD"
  },
  "message": "참여자가 이 후보의 이동 부담을 어려움으로 평가했습니다."
}
```

MVP의 Solver는 이 근거를 자연어로 새로 추론하지 않는다. 입력값을 설명 템플릿에 채우는 수준으로 제한한다. 자연어 조건 해석이 필요해지는 경우에도 GPT는 조건 구조화 또는 설명 보조에만 사용하고 점수의 최종 값은 규칙이 만든다.

## 11. 전체 계산 JSON 예시

### 입력

```json
{
  "policyVersion": "mvp-1",
  "weights": {
    "time": 40,
    "travelBurden": 25,
    "budget": 20,
    "preference": 15
  },
  "participants": [
    {
      "participantId": "p1",
      "condition": {
        "availabilityWindows": [
          {
            "startsAt": "2026-08-15T18:00:00+09:00",
            "endsAt": "2026-08-15T22:00:00+09:00"
          }
        ],
        "maxBudgetKrw": 30000,
        "preferences": {
          "requiredTags": ["INDOOR"],
          "preferredTags": ["QUIET"],
          "avoidTags": ["SMOKING"]
        }
      },
      "responses": [
        {"candidateId": "c1", "availabilityStatus": "AVAILABLE", "travelBurden": "EASY"},
        {"candidateId": "c2", "availabilityStatus": "MAYBE", "travelBurden": "HARD"}
      ]
    },
    {
      "participantId": "p2",
      "condition": {
        "availabilityWindows": [
          {
            "startsAt": "2026-08-15T19:00:00+09:00",
            "endsAt": "2026-08-15T22:00:00+09:00"
          }
        ],
        "maxBudgetKrw": 30000,
        "preferences": {
          "requiredTags": ["INDOOR"],
          "preferredTags": ["QUIET"],
          "avoidTags": []
        }
      },
      "responses": [
        {"candidateId": "c1", "availabilityStatus": "AVAILABLE", "travelBurden": "EASY"},
        {"candidateId": "c2", "availabilityStatus": "UNAVAILABLE", "travelBurden": "HARD"}
      ]
    },
    {
      "participantId": "p3",
      "condition": {
        "availabilityWindows": [
          {
            "startsAt": "2026-08-15T18:00:00+09:00",
            "endsAt": "2026-08-15T22:00:00+09:00"
          }
        ],
        "maxBudgetKrw": 40000,
        "preferences": {
          "requiredTags": [],
          "preferredTags": ["VEGAN"],
          "avoidTags": []
        }
      },
      "responses": [
        {"candidateId": "c1", "availabilityStatus": "MAYBE", "travelBurden": "NORMAL"},
        {"candidateId": "c2", "availabilityStatus": "AVAILABLE", "travelBurden": "EASY"}
      ]
    }
  ],
  "candidates": [
    {
      "candidateId": "c1",
      "time": {
        "startsAt": "2026-08-15T19:00:00+09:00",
        "endsAt": "2026-08-15T21:00:00+09:00",
        "timezone": "Asia/Seoul"
      },
      "place": {
        "name": "역삼 조용한 식당",
        "address": "서울 강남구 테헤란로 1",
        "area": "강남"
      },
      "estimatedCostPerPersonKrw": 28000,
      "tags": ["INDOOR", "QUIET"]
    },
    {
      "candidateId": "c2",
      "time": {
        "startsAt": "2026-08-15T18:00:00+09:00",
        "endsAt": "2026-08-15T20:00:00+09:00",
        "timezone": "Asia/Seoul"
      },
      "place": {
        "name": "강남역 야외 테이블",
        "address": "서울 강남구 강남대로 1",
        "area": "강남"
      },
      "estimatedCostPerPersonKrw": 22000,
      "tags": ["OUTDOOR", "VEGAN"]
    }
  ]
}
```

### 후보 c1 계산

| 참가자 | 시간 | 이동 | 예산 | 선호 | 참가자 점수 | 하드 충돌 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| p1 | 40.0 | 25.0 | 20.0 | 15.0 | 100.0 | 없음 |
| p2 | 40.0 | 25.0 | 20.0 | 15.0 | 100.0 | 없음 |
| p3 | 20.0 | 12.5 | 20.0 | 10.0 | 62.5 | 없음 (`MAYBE`·`NORMAL`은 불확실성) |

```text
c1 overallScore = (100.0 + 100.0 + 62.5) / 3
                 = 87.5
```

`c1`은 응답이 모두 있고 하드 충돌이 없으므로 `eligible=true`, `matchLevel=PARTIAL`이다. p3의 `MAYBE`와 `NORMAL` 이동 부담은 결과에 표시한다.

### 후보 c2 계산

| 참가자 | 시간 | 이동 | 예산 | 선호 | 참가자 점수 | 하드 충돌 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| p1 | 20.0 | 0.0 | 20.0 | 0.0 | 40.0 | 이동 부담 어려움, INDOOR 누락 |
| p2 | 0.0 | 0.0 | 20.0 | 0.0 | 20.0 | 시간 불가, 이동 부담 어려움, INDOOR 누락 |
| p3 | 40.0 | 25.0 | 20.0 | 15.0 | 100.0 | 없음 |

```text
c2 overallScore = (40.0 + 20.0 + 100.0) / 3
                 = 53.333...
                 = 53.3
```

### 출력 일부

```json
{
  "policyVersion": "mvp-1",
  "recommendationStatus": "PARTIAL_MATCH",
  "recommendationWarnings": [],
  "ranking": ["c1", "c2"],
  "candidates": [
    {
      "candidateId": "c1",
      "rank": 1,
      "overallScore": 87.5,
      "eligible": true,
      "matchLevel": "PARTIAL",
      "hardConflictCount": 0,
      "coverage": {"submittedResponses": 3, "expectedResponses": 3},
      "explanationFlags": ["MAYBE_RESPONSE", "TRAVEL_BURDEN_UNCERTAIN", "SELF_REPORTED_TRAVEL_BURDEN"]
    },
    {
      "candidateId": "c2",
      "rank": 2,
      "overallScore": 53.3,
      "eligible": false,
      "matchLevel": "CONFLICTED",
      "hardConflictCount": 5,
      "coverage": {"submittedResponses": 3, "expectedResponses": 3},
      "conflicts": [
        {"participantId": "p1", "code": "TRAVEL_BURDEN_HARD"},
        {"participantId": "p1", "code": "REQUIRED_TAG_MISSING"},
        {"participantId": "p2", "code": "TIME_UNAVAILABLE"},
        {"participantId": "p2", "code": "TRAVEL_BURDEN_HARD"},
        {"participantId": "p2", "code": "REQUIRED_TAG_MISSING"}
      ],
      "explanationFlags": ["SELF_REPORTED_TRAVEL_BURDEN"]
    }
  ]
}
```

이 예시는 `c1`이 하드 충돌은 없지만 `MAYBE`와 `NORMAL` 때문에 `PARTIAL_MATCH`인 경우다. 반대로 모든 후보에 하드 충돌이 있으면 `recommendationStatus=NO_FULL_MATCH`로 바뀐다. 모든 후보의 점수가 60.0 미만인 별도 계산에서는 `recommendationWarnings=["LOW_SCORE"]`를 추가하지만 계산 자체는 실패하지 않는다.

## 확정 사항과 미결정 사항 요약

- **확정**: `40/25/20/15` 고정 가중치, 참가자 평균, 하드 충돌 별도 표시, 미응답 0점·확정 차단, 결정적 tie-breaker를 MVP 규칙으로 사용한다.
- **확정**: 이동 부담은 `EASY/NORMAL/HARD` 자기 평가이며, 실제 이동거리·시간을 보장하지 않는다는 플래그를 표시한다.
- **확정**: 미응답이 없는 계산에서 최고 후보의 점수가 60.0 미만이면 `LOW_SCORE` 경고를 표시하고 호스트의 이슈 인지를 요구한다. 점수나 순위를 자동으로 무효화하지 않는다.
- **미결정**: 실제 사용자 피드백을 반영한 가중치 튜닝, 자연어를 태그로 변환하는 목록, 지도 API 도입 후 이동 점수의 재정의는 MVP 이후 결정한다.
