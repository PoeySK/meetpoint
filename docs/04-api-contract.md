# MeetPoint REST API 계약

## 문서 상태와 공통 원칙

- **확정**: 브라우저는 Next.js 화면에서 NestJS REST API만 호출한다. Next.js API Route와 Server Action은 사용하지 않는다.
- **확정**: 외부 클라이언트용 API와 내부 Rust Solver API를 분리한다. PostgreSQL은 NestJS 서버만 접근한다.
- **확정**: 모든 날짜·시간은 ISO 8601 문자열로 전달하고, 시간대가 필요한 값에는 `timezone`을 함께 둔다.
- **확정**: 금액은 부동소수점이 아닌 KRW 정수(`estimatedCostPerPersonKrw`, `maxBudgetKrw`)로 전달한다.
- **확정**: MVP 토큰은 방 코드와 별개의 불투명 난수 토큰으로 발급하고 서버에는 해시만 저장한다. Client는 방별 `sessionStorage`에 보관하며 URL·로그에는 넣지 않는다. 토큰은 발급 후 24시간 유효하고 갱신 API는 MVP에서 제공하지 않는다.
- **확정**: MVP 외부 API에는 `CLOSED` 전환 endpoint를 제공하지 않는다. Room 자체는 자동 만료되지 않으며, 이번 단계에서는 시간에 따른 `CLOSED` 전환도 구현하지 않는다.
- **확정**: 방 생성 API는 Room과 최소 HOST Participant를 하나의 트랜잭션으로 생성한다. 호스트 토큰 원문은 응답에서 한 번만 반환하고 서버에는 해시와 만료 정보만 저장한다.
- **미결정**: API 문서 도구(OpenAPI 등), 방 데이터 삭제·보존 기간은 추후 확정한다.

## 기본 규칙

- 외부 API 기본 경로: `/api/v1`
- 요청·응답 본문: `application/json; charset=utf-8`
- ID: 문서에서는 `room_01` 같은 문자열 예시를 사용한다.
- 방 생성과 방 코드 입장을 제외한 방 데이터 API는 `Authorization: Bearer <room-scoped-token>` 헤더를 사용한다.
- 토큰에는 계정 권한이 아니라 `roomId`, `participantId`, `role(HOST|MEMBER)` 범위만 부여한다.
- 호스트 작업은 `role=HOST`, 자기 조건·응답 변경은 토큰의 `participantId`와 경로의 참여자 ID가 일치해야 한다.
- 후보·조건·응답이 변경되면 관련 최신 `ScoreResult`는 `STALE`로 표시된다.
- 서버는 `requestId`를 생성하여 응답과 오류에 포함한다.
- 계산 후보의 `matchLevel`은 `FULL`, `PARTIAL`, `CONFLICTED`, `INCOMPLETE` 중 하나이며, 전체 계산의 `recommendationStatus`와 구분한다.

### 이번 단계의 Room API 범위

- Room과 HOST·MEMBER Participant를 영속화하고, HOST의 Candidate 등록과 참여자의 Candidate별 `ParticipantResponse` 제출·수정을 제공한다. MEMBER는 방 코드 입장 API로 생성한다.
- 참여자 개인 조건, Candidate 수정·보관, ScoreResult·Decision API는 다음 단계에서 구현한다.
- Room 조회 응답의 `hostParticipant`에는 생성된 HOST Participant의 공개 정보만 반환한다.
- Room 조회의 `participants`에는 현재 방에 속한 HOST·MEMBER Participant의 공개 정보를 반환한다.
- Room 조회의 `candidates`에는 현재 활성 Candidate를 `displayOrder` 순서로 반환한다. 아직 구현하지 않은 계산·결정 데이터는 각각 `null`, `null`로 반환한다.
- 현재 ParticipantCondition API가 없으므로 Candidate 응답 저장 후에도 `participantStatus`는 `JOINED`로 반환한다.
- `TOKEN_EXPIRED`는 Room 만료가 아니라 24시간이 지난 방 범위 접근 토큰을 의미한다.

## 공통 오류 응답

모든 실패 응답은 다음 형태를 따른다.

```json
{
  "error": {
    "code": "CANDIDATE_LIMIT_EXCEEDED",
    "message": "활성 후보는 최대 5개까지 등록할 수 있습니다.",
    "details": {
      "activeCandidateCount": 5,
      "max": 5
    },
    "requestId": "req_20260813_001"
  }
}
```

Room API의 실패 응답은 항상 위 구조를 사용한다. `details`에 전달할 값이 없으면 빈 객체를 반환하며, `requestId`는 서버가 요청마다 생성한다.

공통 오류 코드는 다음과 같다.

| HTTP 상태 | 코드 | 의미 |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `VALIDATION_ERROR` | JSON 형식 또는 필드 형식 오류 |
| 401 | `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED` | 방 범위 토큰이 없거나 유효하지 않거나 만료됨 |
| 403 | `HOST_ONLY`, `PARTICIPANT_ONLY`, `FORBIDDEN` | 역할 또는 본인 범위를 벗어난 요청 |
| 404 | `ROOM_NOT_FOUND_OR_INVALID_CODE`, `RESOURCE_NOT_FOUND`, `SCORE_RESULT_NOT_FOUND`, `DECISION_NOT_FOUND` | 방 또는 하위 객체가 없음 |
| 409 | `ROOM_STATE_CONFLICT`, `CALCULATION_IN_PROGRESS`, `STALE_RESULT`, `DUPLICATE_RESPONSE` | 현재 상태와 충돌 |
| 422 | `BUSINESS_RULE_VIOLATION`, `NO_ACTIVE_CANDIDATES`, `CANDIDATE_LIMIT_EXCEEDED`, `CONDITION_INCOMPLETE`, `PARTICIPANT_COUNT_OUT_OF_RANGE`, `TIME_CONDITION_CONFLICT`, `RESPONSE_FIELD_MISSING` | JSON은 맞지만 MeetPoint 규칙 위반 |
| 502 | `SOLVER_ERROR` | Solver가 계산 실패를 반환함 |
| 503 | `SOLVER_UNAVAILABLE` | Solver에 연결할 수 없음 또는 타임아웃 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 서버 오류 |

---

## NestJS Server 외부 REST API

### 1. 방 생성

`POST /api/v1/rooms`

#### 요청 JSON

```json
{
  "title": "토요일 저녁 모임",
  "timezone": "Asia/Seoul",
  "host": {
    "displayName": "민수"
  }
}
```

#### 응답 JSON — `201 Created`

```json
{
  "requestId": "req_20260813_001",
  "room": {
    "id": "room_01",
    "roomCode": "A7K9P2",
    "title": "토요일 저녁 모임",
    "timezone": "Asia/Seoul",
    "status": "DRAFT",
    "maxParticipants": 6,
    "hostParticipantId": "participant_host"
  },
  "hostParticipant": {
    "id": "participant_host",
    "role": "HOST",
    "displayName": "민수",
    "status": "JOINED"
  },
  "access": {
    "hostToken": "room-scoped-token-example",
    "inviteUrl": "https://client.example/join/A7K9P2"
  }
}
```

#### 주요 실패 상태와 유효성 검사

- `400 VALIDATION_ERROR`: 제목이 비어 있거나 80자를 초과, 표시 이름이 1~30자가 아님, 잘못된 시간대
- `409 ROOM_STATE_CONFLICT`: 서버가 방 코드 발급 중 충돌을 해결하지 못함
- 호스트 토큰은 이 요청에서 필요하지 않으며 응답에서 한 번 발급한다.
- Room과 HOST Participant 생성은 하나의 트랜잭션으로 처리하며, 어느 한쪽이라도 실패하면 전체 생성을 롤백한다.
- `roomCode` unique 충돌이 발생하면 서버는 새 코드를 생성해 재시도하고, 재시도 한도를 넘으면 `409 ROOM_STATE_CONFLICT`를 반환한다.
- `hostParticipantId`는 Room 생성 트랜잭션 안에서 생성한 Participant ID와 일치하는지 서비스가 검증한다. Participant 존재 여부, Room 소속, `HOST` 역할도 서비스에서 검증한다.

### 2. 방 조회

`GET /api/v1/rooms/{roomId}`

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_002",
  "room": {
    "id": "room_01",
    "roomCode": "A7K9P2",
    "title": "토요일 저녁 모임",
    "timezone": "Asia/Seoul",
    "status": "DRAFT",
    "hostParticipantId": "participant_host"
  },
  "hostParticipant": {
    "id": "participant_host",
    "displayName": "민수",
    "role": "HOST",
    "status": "JOINED"
  },
  "participants": [
    {
      "id": "participant_host",
      "displayName": "민수",
      "role": "HOST",
      "status": "JOINED"
    }
  ],
  "candidates": [],
  "latestScoreResult": null,
  "decision": null
}
```

#### 주요 실패 상태와 유효성 검사

- `401 MISSING_TOKEN`, `INVALID_TOKEN` 또는 `TOKEN_EXPIRED`
- `404 RESOURCE_NOT_FOUND`: 토큰의 방 범위와 일치하지 않는 방 ID도 상세 없이 404로 처리
- 조회 응답에는 다른 방의 참여자·후보·계산 결과를 포함하지 않는다.

### 3. 참여자 입장

`POST /api/v1/rooms/{roomCode}/participants`

#### 요청 JSON

```json
{
  "displayName": "지수"
}
```

#### 응답 JSON — `201 Created`

```json
{
  "requestId": "req_20260813_003",
  "room": {
    "id": "room_01",
    "roomCode": "A7K9P2",
    "status": "OPEN"
  },
  "participant": {
    "id": "participant_02",
    "displayName": "지수",
    "role": "MEMBER",
    "status": "JOINED"
  },
  "access": {
    "participantToken": "room-member-token-example"
  }
}
```

#### 주요 실패 상태와 유효성 검사

- `400 VALIDATION_ERROR`: 표시 이름이 1~30자가 아님
- `404 ROOM_NOT_FOUND_OR_INVALID_CODE`: 코드가 틀렸거나 방을 입장할 수 없음
- `409 ROOM_STATE_CONFLICT`: 방이 `CALCULATING`, `CALCULATED`, `CONFIRMED`, `CLOSED`이거나 정원이 가득 참
- Room은 `DRAFT` 또는 `OPEN` 상태에서만 Participant 입장을 허용한다.
- 방 코드는 대문자로 정규화하고, 오류 메시지에서 실제 방 존재 여부를 구별하지 않는다.

### 4. 후보 등록

`POST /api/v1/rooms/{roomId}/candidates`

#### 요청 JSON

```json
{
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
  "tags": ["INDOOR", "QUIET"]
}
```

#### 응답 JSON — `201 Created`

```json
{
  "requestId": "req_20260813_004",
  "candidate": {
    "id": "candidate_01",
    "roomId": "room_01",
    "displayOrder": 1,
    "status": "ACTIVE",
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
    "version": 1,
    "archivedAt": null
  }
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`
- `409 ROOM_STATE_CONFLICT`: 확정·종결 방에서 후보 변경 또는 같은 시간 구간·장소 조합 중복
- `422 CANDIDATE_LIMIT_EXCEEDED`: 활성 후보가 이미 5개
- 시간의 `endsAt`은 `startsAt`보다 늦어야 한다.
- 장소명·주소는 1~120자, 비용은 0 이상 2,000,000 이하의 정수, 태그는 최대 10개다.
- 같은 시간 구간·장소 조합은 중복할 수 없다.

### 5. 후보 수정

`PATCH /api/v1/rooms/{roomId}/candidates/{candidateId}`

#### 요청 JSON

변경할 필드만 보낸다.

```json
{
  "time": {
    "startsAt": "2026-08-15T19:30:00+09:00",
    "endsAt": "2026-08-15T21:30:00+09:00",
    "timezone": "Asia/Seoul"
  },
  "estimatedCostPerPersonKrw": 30000
}
```

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_005",
  "candidate": {
    "id": "candidate_01",
    "status": "ACTIVE",
    "version": 2,
    "updatedAt": "2026-08-13T04:40:00Z"
  },
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`, `404 RESOURCE_NOT_FOUND`
- `409 ROOM_STATE_CONFLICT`: 후보가 `ARCHIVED`이거나 방이 확정·종결 상태
- `400 VALIDATION_ERROR`: 부분 요청의 시간 구간, 주소, 비용 형식 오류
- 수정 직전에 읽은 `version`을 `If-Match-Version` 헤더로 보낼 경우 버전 불일치에는 409를 반환한다. 이 헤더를 필수로 할지는 구현 전에 정한다.

### 6. 후보 삭제(보관)

`DELETE /api/v1/rooms/{roomId}/candidates/{candidateId}`

실제 행을 즉시 삭제하지 않고 `ARCHIVED`로 바꾸어 과거 계산 결과가 참조한 후보를 보존한다.

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_006",
  "candidate": {
    "id": "candidate_01",
    "status": "ARCHIVED",
    "archivedAt": "2026-08-13T04:42:00Z"
  },
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`, `404 RESOURCE_NOT_FOUND`
- `409 ROOM_STATE_CONFLICT`: 확정·종결 방, 이미 보관된 후보
- 활성 후보가 1개가 되는 삭제는 저장할 수 있지만, 다음 계산·확정은 후보 2개 이상이 될 때까지 거부한다.

### 7. 참여자 개인 조건 제출·수정

`PUT /api/v1/rooms/{roomId}/participants/{participantId}/conditions`

#### 요청 JSON

```json
{
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
    "avoidTags": ["SMOKING"]
  }
}
```

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_007",
  "participantId": "participant_02",
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
      "avoidTags": ["SMOKING"]
    }
  },
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 PARTICIPANT_ONLY` 또는 다른 참여자 수정 시 `FORBIDDEN`
- `404 RESOURCE_NOT_FOUND`: 다른 방의 참여자 ID 포함
- `409 ROOM_STATE_CONFLICT`: 확정 방에서 재검토 없이 수정
- `422 CONDITION_INCOMPLETE`: 시간 구간이 겹치지 않거나 예산이 음수, 중복 태그가 있음
- 시간 구간은 1~10개, 예산은 `null` 또는 0 이상 정수다. 이동 부담은 일반 조건에 저장하지 않고 후보별 응답의 `travelBurden`으로만 받는다.

### 8. 참여자 후보별 응답 제출·수정

`PUT /api/v1/rooms/{roomId}/participants/{participantId}/responses/{candidateId}`

#### 요청 JSON

```json
{
  "availabilityStatus": "AVAILABLE",
  "travelBurden": "EASY",
  "note": "지하철로 이동 가능"
}
```

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_008",
  "response": {
    "id": "response_02_01",
    "participantId": "participant_02",
    "candidateId": "candidate_01",
    "availabilityStatus": "AVAILABLE",
    "travelBurden": "EASY",
    "note": "지하철로 이동 가능",
    "status": "SUBMITTED",
    "submittedAt": "2026-08-13T04:18:00Z",
    "updatedAt": "2026-08-13T04:45:00Z"
  },
  "participantStatus": "JOINED",
  "scoreResultStatus": "STALE"
}
```

이 예시는 아직 일부 후보에만 응답한 경우라 `participantStatus`가 `JOINED`다. 해당 참여자가 모든 활성 후보에 응답을 저장하면 같은 API는 `RESPONDED`를 반환한다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 PARTICIPANT_ONLY` 또는 본인 참여자 ID가 아니면 `FORBIDDEN`
- `404 RESOURCE_NOT_FOUND`: 방·참여자·후보 중 하나가 다른 방이거나 없음
- `409 ROOM_STATE_CONFLICT`: 후보가 보관되었거나 확정 방에서 재검토 없이 변경
- `400 VALIDATION_ERROR`: 상태가 세 값 중 하나가 아니거나 `travelBurden`이 `EASY`, `NORMAL`, `HARD` 중 하나가 아님
- `travelBurden`은 모든 활성 후보에 필수다.
- `note`는 선택 입력이며 0~300자다. Solver는 이 값을 점수·순위·충돌 판정에 사용하지 않는다.
- `AVAILABLE` 응답과 ParticipantCondition의 시간 구간 비교는 조건 저장 API가 구현되는 단계에서 적용한다. 현재 단계에서는 enum과 응답 필드 형식만 검증한다.

### 9. 후보 점수 계산 요청

`POST /api/v1/rooms/{roomId}/calculations`

#### 요청 JSON

```json
{
  "clientRequestId": "client-calc-001"
}
```

요청자의 참여자 ID와 호스트 권한은 본문을 신뢰하지 않고 `Authorization` 토큰에서 가져온다. `clientRequestId`는 네트워크 재시도 시 같은 계산을 재사용하기 위한 멱등성 메타데이터다.

#### 응답 JSON — `202 Accepted`

```json
{
  "requestId": "req_20260813_009",
  "calculation": {
    "id": "score_20260813_02",
    "roomId": "room_01",
    "status": "RUNNING",
    "policyVersion": "mvp-1",
    "createdAt": "2026-08-13T04:50:00Z"
  },
  "pollUrl": "/api/v1/rooms/room_01/calculations/score_20260813_02"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`
- `409 CALCULATION_IN_PROGRESS`: 같은 방에 실행 중 계산이 있음
- `422 PARTICIPANT_COUNT_OUT_OF_RANGE`: 활성 참가자가 3~6명이 아님
- `422 NO_ACTIVE_CANDIDATES`: 활성 후보가 2개 미만이거나 5개 초과
- `422 CONDITION_INCOMPLETE`: 활성 참가자의 조건이 모두 제출되지 않음
- 후보별 응답 누락은 계산을 거부하지 않고 결과의 `coverage`와 `MISSING_RESPONSE`로 표시한다.
- `clientRequestId`가 같은 재시도 요청은 동일 계산을 재사용하도록 설계하지만, 이 키의 보존 기간은 미결정이다.

### 10. 계산 결과 조회

`GET /api/v1/rooms/{roomId}/calculations/{calculationId}`

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_010",
  "calculation": {
    "id": "score_20260813_02",
    "roomId": "room_01",
    "status": "COMPLETED",
    "policyVersion": "mvp-1",
    "inputSnapshotHash": "sha256:example",
    "recommendationStatus": "PARTIAL_MATCH",
    "recommendationWarnings": [],
    "coverage": {
      "respondedParticipants": 3,
      "totalParticipants": 3,
      "submittedResponses": 9,
      "expectedResponses": 9
    },
    "ranking": ["candidate_01", "candidate_02"],
    "candidates": [
      {
        "candidateId": "candidate_01",
        "rank": 1,
        "overallScore": 91.7,
        "eligible": true,
        "matchLevel": "PARTIAL",
        "hardConflictCount": 0,
        "participantBreakdown": [
          {
            "participantId": "participant_02",
            "score": 100.0,
            "components": {
              "time": 40.0,
              "travelBurden": 25.0,
              "budget": 20.0,
              "preference": 15.0
            },
            "hardConflicts": [],
            "blockingIssues": [],
            "reasons": ["가능 시간 응답: AVAILABLE", "이동 부담 EASY / 참여자 자기 평가", "예상 비용 28,000원 / 상한 30,000원 이내"]
          }
        ],
        "reasons": ["3명 응답 완료", "모든 필수 태그 충족"],
        "conflicts": [],
        "blockingIssues": [],
        "explanationFlags": []
      }
    ],
    "completedAt": "2026-08-13T04:50:01Z"
  }
}
```

`status`가 `RUNNING`이면 `candidates`가 없을 수 있다. `FAILED`이면 `calculation.error`에 Solver 오류 코드와 재시도 가능 여부를 담고, 해당 계산 요청으로 `Room`은 `OPEN`으로 돌아간다.

위 JSON은 설명을 위해 `participantBreakdown`을 한 명만 보인 축약 예시다. 실제 `COMPLETED` 응답에서는 `coverage.totalParticipants`에 해당하는 모든 참가자의 breakdown을 반환한다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `404 RESOURCE_NOT_FOUND`
- 계산 ID가 다른 방에 속하면 상세 정보 없이 404를 반환한다.
- `STALE` 결과도 조회는 가능하지만 확정 API는 이를 거부한다.

### 11. 최신 계산 결과 조회

`GET /api/v1/rooms/{roomId}/score-results/latest`

#### 응답 JSON — `200 OK`

계산 결과 조회 API의 `calculation` 객체와 같은 전체 결과를 반환한다. 결과 화면은 이 API를 사용한다.

```json
{
  "requestId": "req_20260813_011",
  "scoreResult": {
    "id": "score_20260813_02",
    "status": "COMPLETED",
    "policyVersion": "mvp-1",
    "ranking": ["candidate_01", "candidate_02"],
    "recommendationStatus": "PARTIAL_MATCH",
    "recommendationWarnings": []
  }
}
```

위 `scoreResult`는 식별·요약 필드만 보인 축약 예시다. 실제 응답은 10번 계산 결과 조회의 `coverage`, `candidates`, `participantBreakdown`, `reasons`, `conflicts`, `explanationFlags`를 모두 포함한다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `404 RESOURCE_NOT_FOUND`
- 계산 이력이 없으면 `404 SCORE_RESULT_NOT_FOUND`
- 최신 결과가 `FAILED` 또는 `STALE`이면 상태를 그대로 반환하며 자동으로 새 계산을 만들지 않는다.
- 최신 계산이 실패한 경우 새 계산 요청 전까지 방 상태는 `OPEN`이며, 실패 결과를 성공 결과처럼 확정에 사용할 수 없다.

### 12. 최종 후보 확정

`POST /api/v1/rooms/{roomId}/decision`

#### 요청 JSON

```json
{
  "candidateId": "candidate_01",
  "scoreResultId": "score_20260813_02",
  "acknowledgeIssues": true,
  "decisionNote": "모든 참가자의 가능한 시간과 예산을 함께 고려"
}
```

#### 응답 JSON — `201 Created`

```json
{
  "requestId": "req_20260813_012",
  "decision": {
    "id": "decision_01",
    "roomId": "room_01",
    "candidateId": "candidate_01",
    "scoreResultId": "score_20260813_02",
    "decidedByParticipantId": "participant_host",
    "status": "CONFIRMED",
    "acknowledgeIssues": true,
    "decisionNote": "모든 참가자의 가능한 시간과 예산을 함께 고려",
    "confirmedAt": "2026-08-13T04:55:00Z",
    "replacedDecisionId": null,
    "reopenedAt": null,
    "reopenReason": null
  },
  "roomStatus": "CONFIRMED"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`
- `409 STALE_RESULT`: 최신 완료 계산이 아니거나 후보·조건·응답이 계산 후 변경됨
- `409 ROOM_STATE_CONFLICT`: 이미 현재 확정 결정이 있음. 변경은 재검토 API를 먼저 사용한다.
- `422 BUSINESS_RULE_VIOLATION`: 응답 커버리지가 100%가 아님
- 선택 후보의 `matchLevel`이 `FULL`이 아니거나 계산 결과의 `recommendationWarnings`에 `LOW_SCORE`가 있으면 `acknowledgeIssues`가 `true`여야 하며, `decisionNote`는 1~300자여야 한다.
- 선택 후보는 계산 결과의 활성 후보여야 한다.

### 13. 확정 결과 재검토 열기

`POST /api/v1/rooms/{roomId}/decision/reopen`

최종 결과를 바꾸기 위한 명시적 단계다. 기존 점수를 지우지 않고 방을 다시 입력 가능한 상태로 만든다.

#### 요청 JSON

```json
{
  "reason": "토요일 장소의 예산 정보가 바뀌어 다시 비교해야 함"
}
```

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_013",
  "decision": {
    "id": "decision_01",
    "roomId": "room_01",
    "candidateId": "candidate_01",
    "scoreResultId": "score_20260813_02",
    "decidedByParticipantId": "participant_host",
    "status": "REOPENED",
    "acknowledgeIssues": true,
    "decisionNote": "모든 참가자의 가능한 시간과 예산을 함께 고려",
    "confirmedAt": "2026-08-13T04:55:00Z",
    "replacedDecisionId": null,
    "reopenedAt": "2026-08-13T05:00:00Z",
    "reopenReason": "토요일 장소의 예산 정보가 바뀌어 다시 비교해야 함"
  },
  "roomStatus": "OPEN",
  "nextStep": "CANDIDATE_OR_RESPONSE_CHANGE_THEN_RECALCULATE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`, `404 RESOURCE_NOT_FOUND`
- `409 ROOM_STATE_CONFLICT`: 현재 확정 결정이 없거나 이미 재검토 중
- 사유는 1~300자이며, 재검토만으로 기존 결정의 이력이 삭제되지 않는다.

### 14. 최종 결과 조회

`GET /api/v1/rooms/{roomId}/decision`

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_014",
  "decision": {
    "id": "decision_01",
    "status": "CONFIRMED",
    "candidate": {
      "id": "candidate_01",
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
    "version": 1,
    "archivedAt": null
    },
    "scoreResultId": "score_20260813_02",
    "overallScore": 91.7,
    "decidedByParticipantId": "participant_host",
    "acknowledgeIssues": true,
    "decisionNote": "모든 참가자의 가능한 시간과 예산을 함께 고려",
    "confirmedAt": "2026-08-13T04:55:00Z",
    "replacedDecisionId": null,
    "reopenedAt": null,
    "reopenReason": null
  }
}
```

최종 결과의 `overallScore`는 `Decision`에 별도로 저장하는 값이 아니라 `Decision.scoreResultId`가 가리키는 `ScoreResult`에서 읽는 조회용 projection이다. 확정 판단의 원본은 `candidateId`, `scoreResultId`, `acknowledgeIssues`, `decisionNote`다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `404 RESOURCE_NOT_FOUND`
- 현재 결정이 없으면 `404 DECISION_NOT_FOUND`
- `REOPENED` 상태이면 확정 결과 대신 재검토 중이라는 상태와 마지막 결정 이력을 반환한다.
- 참여자는 읽기만 할 수 있고 결과를 수정할 수 없다.

---

## Rust Solver 내부 HTTP API

### API 기본 원칙

- 내부 기본 경로: `/v1/solve`
- 목표 로컬 주소: `http://localhost:4000/v1/solve`
- 배포 시 NestJS가 사용하는 서비스 DNS 주소로 바꾼다.
- Solver는 데이터베이스 연결 문자열, 사용자 토큰, 방의 현재 상태를 받지 않는다.
- 서버가 만든 하나의 완전한 스냅샷을 입력으로 받고, 결과 또는 구조화된 계산 오류만 반환한다.

### 계산 요청

`POST /v1/solve`

#### 입력 데이터 구조

```json
{
  "requestId": "score_20260813_02",
  "policyVersion": "mvp-1",
  "roomId": "room_01",
  "participants": [
    {
      "participantId": "participant_02",
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
          "avoidTags": ["SMOKING"]
        }
      },
      "responses": [
        {
          "candidateId": "candidate_01",
          "availabilityStatus": "AVAILABLE",
          "travelBurden": "EASY",
          "note": "지하철로 이동 가능"
        }
      ]
    }
  ],
  "candidates": [
    {
      "candidateId": "candidate_01",
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
      "tags": ["INDOOR", "QUIET"]
    }
  ]
}
```

#### 입력 유효성 검사

- `requestId`, `policyVersion`은 비어 있지 않아야 한다.
- `participants`가 비어 있으면 `NO_PARTICIPANTS`다.
- `candidates`가 비어 있으면 `NO_CANDIDATES`다.
- 후보 ID와 참여자 ID는 각 배열에서 유일해야 한다.
- 후보 시간·비용·태그와 조건 필드는 NestJS 계약과 같은 범위를 사용한다.
- 응답이 없는 후보는 입력 오류가 아니라 `MISSING_RESPONSE`로 결과에 포함한다. 응답은 있으나 `travelBurden`이 빠진 경우는 `RESPONSE_FIELD_MISSING` 오류다.
- Solver는 입력에 있는 `roomId`를 결과에 되돌려 줄 수 있지만, 이를 근거로 데이터베이스를 조회하지 않는다.

### 성공 출력 데이터 구조 — `200 OK`

```json
{
  "requestId": "score_20260813_02",
  "policyVersion": "mvp-1",
  "status": "COMPLETED",
  "recommendationStatus": "PARTIAL_MATCH",
  "recommendationWarnings": [],
  "coverage": {
    "respondedParticipants": 3,
    "totalParticipants": 3,
    "submittedResponses": 9,
    "expectedResponses": 9
  },
  "ranking": ["candidate_01", "candidate_02"],
  "candidates": [
    {
      "candidateId": "candidate_01",
      "rank": 1,
      "overallScore": 91.7,
      "eligible": true,
      "matchLevel": "PARTIAL",
      "hardConflictCount": 0,
      "participantBreakdown": [
        {
          "participantId": "participant_02",
          "score": 100.0,
          "components": {
            "time": 40.0,
            "travelBurden": 25.0,
            "budget": 20.0,
            "preference": 15.0
          },
          "hardConflicts": [],
          "blockingIssues": [],
          "reasons": [
            "가능 시간 응답: AVAILABLE",
            "이동 부담 EASY / 참여자 자기 평가",
            "예상 비용 28,000원 / 상한 30,000원 이내",
            "필수 태그 INDOOR 충족, 선호 태그 QUIET 충족"
          ]
        }
      ],
      "reasons": ["3명의 응답을 모두 반영함", "필수 조건 충돌 없음"],
      "conflicts": [],
      "blockingIssues": [],
      "explanationFlags": []
    }
  ]
}
```

`overallScore`는 0~100 범위의 한 자리 소수다. `participantBreakdown`은 후보별로 모든 참가자에 대해 만들며, 응답이 없으면 `score: 0`, `blockingIssues: ["MISSING_RESPONSE"]`로 표시한다. `MISSING_RESPONSE`는 조건 충돌 수에 포함하지 않는다.

### 계산 실패 출력 — `422 Unprocessable Entity` 또는 `500 Internal Server Error`

```json
{
  "requestId": "score_20260813_03",
  "policyVersion": "mvp-1",
  "status": "FAILED",
  "error": {
    "code": "NO_CANDIDATES",
    "message": "계산할 활성 후보가 없습니다.",
    "retryable": false,
    "details": {}
  }
}
```

| HTTP 상태 | Solver 오류 코드 | 재시도 | 의미 |
| --- | --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_SCHEMA` | 아니오 | JSON 또는 필드 구조 오류 |
| 422 | `NO_PARTICIPANTS`, `NO_CANDIDATES`, `INVALID_TIME_RANGE`, `RESPONSE_FIELD_MISSING` | 아니오 | 입력 스냅샷으로 계산할 수 없음 |
| 500 | `SOLVER_INTERNAL_ERROR` | 한 번 | 계산 내부 오류 |
| 503 | `SOLVER_OVERLOADED` | 한 번 | 일시적으로 계산할 수 없음 |

NestJS는 Solver의 `requestId`와 오류 코드를 보존하여 외부 API의 `SOLVER_ERROR` 또는 `SOLVER_UNAVAILABLE`로 매핑한다. Solver가 만든 결과를 임의로 재점수화하지 않는다.

## 확정 사항과 미결정 사항 요약

- **확정**: 외부 API의 책임은 NestJS가 가지며, Solver API는 계산 입력과 출력에만 집중한다.
- **확정**: 결과에는 숫자 점수뿐 아니라 참가자별 breakdown, 근거, 충돌, 커버리지를 포함한다.
- **확정**: 토큰은 불투명 난수이며 24시간 후 만료되고, MVP에는 토큰 갱신 API가 없다. 구현 시 원문 대신 해시만 저장한다.
- **확정**: Room 자체는 자동 만료되지 않으며 `TOKEN_EXPIRED`는 만료된 방 범위 토큰에만 적용한다.
- **미결정**: 방 데이터 삭제·보존 기간, API 버전별 호환 기간, 계산 결과 페이지의 이력 조회 범위와 `If-Match-Version` 필수 여부는 추후 결정한다.
