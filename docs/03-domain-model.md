# MeetPoint 도메인 모델

## 모델링 원칙

- **확정**: `Room`이 방 단위의 aggregate root다. 서버만 방 상태와 참여자·후보·응답·결정을 변경한다.
- **확정**: Solver는 아래 도메인 객체를 데이터베이스에서 읽지 않는다. 서버가 한 번의 계산에 필요한 스냅샷을 만들어 Solver 입력으로 전달한다.
- **확정**: 후보 시간과 후보 장소는 서로 다른 값 객체지만, MVP의 비교 단위인 `Candidate` 안에서 한 쌍으로 관리한다.
- **미결정**: 실제 ORM 엔티티명, 테이블 분할, ID 생성 방식(UUID·문자열 등)은 구현 단계에서 정한다. 문서의 ID는 API 예시용 문자열이다.

## 객체 관계

```text
Room 1 ─── N Participant
Room 1 ─── N Candidate
Participant 1 ─── N ParticipantResponse N ─── 1 Candidate
Room 1 ─── N ScoreResult
Room 1 ─── N Decision ─── 1 Candidate
Decision ─── 1 ScoreResult (확정 당시 사용한 계산 결과)
```

`ParticipantCondition`은 별도 생명주기를 갖는 주 객체가 아니라 `Participant`에 속한 값 객체다. `ParticipantResponse`는 개인 조건과 달리 특정 후보에 대한 제출 기록이다.

## Room

### 목적

한 번의 모임 의사결정 세션을 나타낸다. 참가자·후보·응답·계산 이력·최종 결정을 묶고 방의 전체 상태 전이를 관리한다.

### 주요 필드

```json
{
  "id": "room_01",
  "roomCode": "A7K9P2",
  "title": "토요일 저녁 모임",
  "timezone": "Asia/Seoul",
  "status": "OPEN",
  "hostParticipantId": "participant_host",
  "maxParticipants": 6,
  "latestScoreResultId": "score_20260813_01",
  "currentDecisionId": null,
  "createdAt": "2026-08-13T04:00:00Z",
  "updatedAt": "2026-08-13T04:20:00Z"
}
```

- `roomCode`: 링크가 없을 때 입장에 사용하는 6자리 코드
- `timezone`: 입력하지 않은 시간의 기본 시간대
- `status`: 방의 현재 작업 가능 상태
- `latestScoreResultId`: 가장 최근 계산 결과를 가리키는 선택적 참조
- `currentDecisionId`: 현재 확정 또는 재검토 중인 결정 참조

### 상태값

- `DRAFT`: 방은 만들어졌지만 후보·참여자 입력이 진행 중이다.
- `OPEN`: 참여자와 후보를 추가·수정할 수 있다.
- `CALCULATING`: 최신 입력 스냅샷을 Solver가 처리 중이다.
- `CALCULATED`: 유효한 계산 결과가 있고 아직 최종 확정하지 않았다.
- `CONFIRMED`: 현재 최종 결정이 있다. 기본적으로 데이터 변경을 막는다.
- `CLOSED`: 더 이상 입장·수정·계산하지 않는 종결 상태다. MVP의 자동 종결은 아직 미결정이다.

상태 전이는 다음 규칙을 따른다. 계산 실패나 타임아웃은 별도의 `Room` 상태를 만들지 않고 `CALCULATING → OPEN`으로 되돌리며, 해당 `ScoreResult`만 `FAILED`로 저장한다. 실패한 계산 때문에 이전 입력을 성공으로 오인하지 않도록 호스트는 새 계산을 요청해야 한다.

| 사건 | 이전 상태 | 이후 상태 | 함께 변경되는 객체 |
| --- | --- | --- | --- |
| 방 생성 | 없음 | `DRAFT` | 호스트 `Participant` 생성 |
| 참여자 입장 또는 방 작업 시작 | `DRAFT` | `OPEN` | 멤버 `Participant` 생성 가능 |
| 계산 요청 접수 | `OPEN` 또는 `CALCULATED` | `CALCULATING` | `ScoreResult=REQUESTED/RUNNING` |
| 계산 성공 | `CALCULATING` | `CALCULATED` | `ScoreResult=COMPLETED` |
| 계산 실패·타임아웃 | `CALCULATING` | `OPEN` | `ScoreResult=FAILED` |
| 후보·조건·응답 변경 | `CALCULATED` | `OPEN` | 기존 완료 결과 `STALE` |
| 최종 후보 확정 | `CALCULATED` | `CONFIRMED` | `Decision=CONFIRMED` |
| 확정 결과 재검토 시작 | `CONFIRMED` | `OPEN` | 현재 `Decision=REOPENED` |
| 방 종결 | `OPEN`·`CALCULATED`·`CONFIRMED` | `CLOSED` | 이후 외부 변경 API 거부 |

### 관계

하나의 `Room`은 여러 `Participant`, `Candidate`, `ScoreResult`, `Decision`을 가진다. 모든 하위 객체는 `roomId`로 소속을 확인하고 다른 방의 ID를 참조할 수 없다.

### 생성 및 변경 시점

- 방 생성 요청 때 호스트 참여자와 함께 생성한다.
- 후보·참여자·조건·응답이 변경될 때 `updatedAt`을 바꾸고 최신 계산 참조를 무효화할 수 있다.
- 계산 시작·완료·결정 확정·재검토 시 상태를 전이한다.

## Participant

### 목적

해당 방에서 한 사람의 표시 이름, 역할, 참여 상태, 개인 조건을 나타낸다. 로그인 계정이 아니라 방에 한정된 참여자 기록이다.

### 주요 필드

```json
{
  "id": "participant_02",
  "roomId": "room_01",
  "displayName": "지수",
  "role": "MEMBER",
  "status": "RESPONDED",
  "condition": {
    "availabilityWindows": [
      {
        "startsAt": "2026-08-15T19:00:00+09:00",
        "endsAt": "2026-08-15T22:00:00+09:00"
      }
    ],
    "maxBudgetKrw": 25000,
    "preferences": {
      "requiredTags": ["INDOOR"],
      "preferredTags": ["QUIET"],
      "avoidTags": ["SMOKING"]
    }
  },
  "joinedAt": "2026-08-13T04:10:00Z",
  "conditionSubmittedAt": "2026-08-13T04:15:00Z"
}
```

접근 자격 메타데이터는 공개 Participant 응답과 분리해 서버 내부에 보관한다.

```json
{
  "participantId": "participant_02",
  "tokenHash": "sha256:example",
  "tokenExpiresAt": "2026-08-14T04:10:00Z",
  "tokenRevokedAt": null
}
```

`tokenHash`는 원문 토큰을 복원할 수 없는 서버 내부 값이며 Client에 반환하지 않는다.

### `ParticipantCondition` 값 객체

- `availabilityWindows`: 가능한 시간 구간. 후보 시간과 겹치지 않으면 `AVAILABLE` 응답을 제출할 수 없다.
- `maxBudgetKrw`: 1인 예상 비용 상한. `null`이면 예산 제한 없음.
- `requiredTags`: 반드시 후보 장소 태그에 포함되어야 하는 조건.
- `preferredTags`: 포함되면 선호 점수를 받는 조건.
- `avoidTags`: 포함되면 충돌로 보는 조건.

### 상태값

- `JOINED`: 방에 입장했지만 조건 또는 후보 응답이 완료되지 않았다.
- `RESPONDED`: 조건이 저장되고 모든 활성 후보에 응답했다.

`LEFT`와 `REMOVED`는 MVP 외부 API와 계산 입력에 포함하지 않는다. 추후 참여자 이탈·강제 제거를 지원할 때 상태값, 계산 제외 시점, 토큰 폐기 API를 함께 별도 결정한다.

`HOST` 역할의 참여자도 상태와 조건 구조는 동일하다. `INVITED`는 링크를 보냈지만 아직 `Participant` 레코드가 만들어지지 않은 사람을 UI에서 표현하는 파생 상태로 사용하며, 입장 전에는 별도 참여자 객체를 만들지 않는다.

토큰 원문은 `Participant`에 저장하지 않는다. 서버는 토큰 해시, `tokenExpiresAt`, `revokedAt` 같은 접근 자격 메타데이터만 보관하며 API 응답에는 노출하지 않는다. 호스트 식별은 `role=HOST`와 토큰의 `participantId`를 함께 검증하고, 참여자 작업은 토큰의 참여자 ID와 경로 ID가 일치해야 한다.

### 관계

하나의 참여자는 하나의 방에만 속하고 여러 `ParticipantResponse`를 가진다. 참여자의 조건은 후보별 응답과 별도로 저장된다.

### 생성 및 변경 시점

- 방 생성 때 호스트 참여자를 생성한다.
- 초대 링크 또는 코드로 입장할 때 멤버 참여자를 생성한다.
- 참여자가 조건을 제출하거나 수정할 때 `condition`과 제출 시각을 갱신한다.
- MVP에서는 참여자 이탈·강제 제거 상태를 변경하는 외부 API를 제공하지 않는다.

## Candidate

### 목적

호스트가 비교 대상으로 제안한 한 개의 시간-장소 조합이다. Solver의 순위 단위이며, 최종 `Decision`이 가리키는 대상이다.

### 주요 필드

```json
{
  "id": "candidate_01",
  "roomId": "room_01",
  "displayOrder": 1,
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
  "tags": ["INDOOR", "QUIET"],
  "status": "ACTIVE",
  "version": 1,
  "archivedAt": null,
  "createdByParticipantId": "participant_host",
  "createdAt": "2026-08-13T04:05:00Z",
  "updatedAt": "2026-08-13T04:05:00Z"
}
```

### 시간과 장소의 구분

- **후보 시간**은 `startsAt`, `endsAt`, `timezone`으로 표현되는 만남 시간 구간이다.
- **후보 장소**는 `name`, `address`, `area`로 표현되는 만남 위치다. 장소 태그는 `Candidate.tags`에 저장한다. 주소와 area는 MVP에서 표시용이고, 태그만 선호 점수에 사용한다.
- 둘은 각각 변경 가능한 값이지만 MVP의 후보 ID 하나 안에 함께 저장한다. 예를 들어 같은 식당의 금요일 19시와 토요일 18시는 서로 다른 `Candidate`다.
- 지도 API가 없으므로 장소의 좌표나 실제 경로를 필수 필드로 두지 않는다. 이동 부담 계산에는 참가자가 후보별로 제출한 `travelBurden`을 사용한다.

### 상태값

- `ACTIVE`: 현재 계산·응답 대상인 후보
- `ARCHIVED`: 호스트가 삭제한 논리적 후보. 과거 계산 스냅샷에서는 보존될 수 있다.

### 관계

한 방에 0~5개의 활성 후보가 있을 수 있다. 후보는 여러 참여자의 응답과 여러 계산 결과의 breakdown에 참조된다.

### 생성 및 변경 시점

- 호스트가 후보를 추가할 때 생성한다.
- 호스트가 시간·장소·비용·태그·표시 순서를 수정할 때 갱신한다.
- 호스트가 삭제할 때 물리 삭제가 아닌 `ARCHIVED`로 변경한다.
- 활성 후보의 변경은 해당 방의 최신 계산과 결정 가능 여부를 무효화한다.

## ParticipantResponse

### 목적

한 참여자가 특정 후보에 대해 제출한 후보별 판단과 자기 기입 이동 정보를 나타낸다. 개인 조건 자체가 아니라 `participantId + candidateId` 조합의 응답이다.

### 주요 필드

```json
{
  "id": "response_02_01",
  "roomId": "room_01",
  "participantId": "participant_02",
  "candidateId": "candidate_01",
  "availabilityStatus": "AVAILABLE",
  "travelBurden": "EASY",
  "note": "지하철로 이동 가능",
  "status": "SUBMITTED",
  "submittedAt": "2026-08-13T04:18:00Z",
  "updatedAt": "2026-08-13T04:18:00Z"
}
```

- `availabilityStatus`: `AVAILABLE`, `MAYBE`, `UNAVAILABLE`
- `travelBurden`: 해당 후보 장소까지의 자기 기입 이동 부담. `EASY`, `NORMAL`, `HARD` 중 하나이며 지도나 GPS 값이 아니다.
- `note`: 참가자가 남기는 설명이며 표시용이다. 점수·순위·충돌 판정에는 사용하지 않는다.
- 예산과 태그 적합성은 후보 사실과 `ParticipantCondition`을 Solver가 비교하므로 응답에 중복 저장하지 않는다.

### 상태값

- `SUBMITTED`: 계산에 사용할 수 있는 최신 응답
- 응답 레코드가 존재하지 않는 상태는 객체 상태가 아니라 후보별 `MISSING` 파생 상태다.

### 관계

한 참여자는 활성 후보마다 최대 하나의 최신 응답을 갖는다. 한 후보는 여러 참여자의 응답을 갖는다. `(participantId, candidateId)`에는 중복 최신 응답을 두지 않고 수정 이력을 별도로 보존할지는 미결정이다.

### 생성 및 변경 시점

- 참여자가 후보별 응답을 제출할 때 생성한다.
- 참여자가 내용을 수정할 때 같은 논리 응답을 갱신한다.
- 후보가 `ARCHIVED`되면 해당 응답은 새 계산에서 제외한다.
- 응답의 생성·변경은 최신 `ScoreResult`를 `STALE`로 만든다.

## ScoreResult

### 목적

특정 시점의 방 입력 스냅샷을 Rust Solver에 전달해 얻은 후보별 계산 결과다. 단순 현재 점수가 아니라 계산에 사용한 정책 버전, 입력 기준, 참가자별 근거를 함께 보존한다.

### 주요 필드

```json
{
  "id": "score_20260813_01",
  "roomId": "room_01",
  "status": "COMPLETED",
  "policyVersion": "mvp-1",
  "inputSnapshotHash": "sha256:example",
  "participantCount": 4,
  "candidateCount": 3,
  "coverage": {
    "respondedParticipants": 4,
    "totalParticipants": 4,
    "submittedResponses": 12,
    "expectedResponses": 12
  },
  "recommendationStatus": "PARTIAL_MATCH",
  "recommendationWarnings": [],
  "ranking": ["candidate_01", "candidate_03", "candidate_02"],
  "createdAt": "2026-08-13T04:25:00Z",
  "completedAt": "2026-08-13T04:25:01Z"
}
```

계산 결과의 각 후보에는 `overallScore`, `eligible`, `matchLevel`, `participantBreakdown`, `reasons`, `conflicts`, `blockingIssues`, `explanationFlags`가 들어간다. `hardConflicts`는 참가자별 하드 충돌, `conflicts`는 후보 전체의 하드 충돌 목록, `blockingIssues`는 `MISSING_RESPONSE` 같은 완전성 차단 사유다. `recommendationWarnings`는 전체 후보를 비교한 뒤 표시하는 경고다. 원본 참여자 객체를 결과에 복사하지 않고, 계산 시점의 입력 스냅샷 또는 해시와 결과 breakdown을 함께 보존한다.

### 상태값

- `REQUESTED`: 서버가 계산을 접수하고 Solver 호출을 준비 중
- `RUNNING`: Solver 호출 중
- `COMPLETED`: 결과가 유효하게 반환됨
- `FAILED`: 입력 오류 또는 Solver 장애로 계산 실패
- `STALE`: 계산 이후 방의 후보·조건·응답이 변경됨

### 관계

하나의 방에 계산 이력이 여러 개 있을 수 있다. `Decision`은 확정 당시 사용한 `ScoreResult` 하나를 참조해야 한다. 최신 결과가 아니거나 `STALE`이면 확정에 사용할 수 없다.

### 생성 및 변경 시점

- 호스트의 계산 요청마다 새 레코드를 생성한다.
- 상태와 완료 시각은 서버가 갱신한다.
- `COMPLETED` 결과의 점수·근거는 수정하지 않는다. 입력 변경 시 새 결과를 만들고 이전 결과를 `STALE`로 표시한다.

## Decision

### 목적

호스트가 계산 결과를 검토한 뒤 최종적으로 선택한 후보를 나타낸다. 계산 결과와 사람의 최종 판단을 분리하기 위한 객체다.

### 주요 필드

```json
{
  "id": "decision_01",
  "roomId": "room_01",
  "candidateId": "candidate_01",
  "scoreResultId": "score_20260813_01",
  "decidedByParticipantId": "participant_host",
  "status": "CONFIRMED",
  "acknowledgeIssues": true,
  "decisionNote": "모두의 가능 시간이 겹치는 후보",
  "confirmedAt": "2026-08-13T04:30:00Z",
  "replacedDecisionId": null,
  "reopenedAt": null,
  "reopenReason": null
}
```

### 상태값

- `CONFIRMED`: 현재 확정된 결정
- `REOPENED`: 호스트가 변경을 위해 재검토를 열었지만 새 결정을 확정하지 않은 상태
- `SUPERSEDED`: 새 결정으로 대체된 과거 결정

### 관계

결정은 하나의 활성 후보와 하나의 완료된 계산 결과를 참조한다. `candidateId`와 `scoreResultId`는 같은 계산 스냅샷에 존재해야 한다. 한 방에 시간 순서상 여러 결정이 있을 수 있지만 `CONFIRMED`인 결정은 하나만 둔다.

### 생성 및 변경 시점

- 호스트가 최신 완료 결과에서 후보를 선택할 때 생성한다.
- 후보가 완전 일치가 아니거나 전체 점수 경고가 있으면 이슈 인지 여부와 메모리를 함께 저장한다.
- 확정 후 바꾸려면 기존 결정을 `REOPENED`로 전환하고 재계산한다.
- 새 결정을 확정하면 이전 결정은 `SUPERSEDED`가 된다. 과거 결정의 후보·점수·근거는 읽기 전용 이력으로 남긴다.

## 객체 간 핵심 구분

| 구분 | 저장 위치 | 의미 | Solver에서의 사용 |
| --- | --- | --- | --- |
| 후보 시간 | `Candidate.time` | 호스트가 제안한 만남 시간 구간 | 참여자 응답의 가능 여부와 비교 |
| 후보 장소 | `Candidate.place` | 호스트가 제안한 장소·주소·태그 | 주소·area는 표시, 태그는 선호·비용은 예산과 비교 |
| 개인 조건 | `Participant.condition` | 참여자가 일반적으로 지키고 싶은 기준 | 후보별 조건 충족 여부 계산 |
| 후보별 응답 | `ParticipantResponse` | 특정 후보에 대한 가능/보류/불가와 자기 기입 이동 부담 | 시간 점수와 이동 점수의 직접 입력 |
| 계산 결과 | `ScoreResult` | Solver가 스냅샷에 대해 산출한 점수·근거 | 순위와 충돌 표시 |
| 최종 확정 | `Decision` | 호스트가 결과를 보고 선택한 후보 | 자동 계산과 사람의 결정을 구분 |

## 확정 사항과 미결정 사항 요약

- **확정**: 도메인 변경의 기준은 `Room`이며, `ScoreResult`는 이력 보존형이고 `Decision`은 별도 확정 기록이다.
- **확정**: 후보 시간과 장소를 각각 값 객체로 저장하되, MVP의 후보 비교 단위는 둘을 묶은 `Candidate`다.
- **미결정**: 방 만료·삭제, 응답 변경 이력의 보존 수준, ORM 테이블의 세부 분할, 참여자 이탈·제거의 공개 API 여부는 구현 전에 정한다.
