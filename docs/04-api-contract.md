# MeetPoint REST API 계약

## 문서 상태와 공통 원칙

- **확정**: 브라우저는 Next.js 화면에서 NestJS REST API만 호출한다. Next.js API Route와 Server Action은 사용하지 않는다.
- **확정**: 외부 클라이언트용 API와 내부 Rust Solver API를 분리한다. PostgreSQL은 NestJS 서버만 접근한다.
- **확정**: 모든 날짜·시간은 ISO 8601 문자열로 전달하고, 시간대가 필요한 값에는 `timezone`을 함께 둔다.
- **확정**: 금액은 부동소수점이 아닌 KRW 정수(`estimatedCostPerPersonKrw`, `maxBudgetKrw`)로 전달한다.
- **확정**: 현재 token은 방 코드와 별개의 불투명 난수로 발급하고 서버에는 해시만 저장한다. Client는 방별 `sessionStorage`에 보관하며 URL·로그에는 넣지 않는다. token은 발급 후 24시간 유효하고 현재 갱신 API는 제공하지 않는다.
- **확정**: 현재 외부 API에는 `CLOSED` 전환 endpoint를 제공하지 않는다. Room 자체는 자동 만료되지 않으며, 현재 시간에 따른 `CLOSED` 전환도 구현하지 않는다.
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

### 현재 Room API 범위

- Room과 HOST·MEMBER Participant를 영속화하고, HOST의 Candidate 등록과 참여자의 ParticipantCondition·Candidate별 `ParticipantResponse` 제출·수정을 제공한다. MEMBER는 방 코드 입장 API로 생성한다.
- 현재 계산·결정 흐름에서는 ScoreResult 계산 시작·polling·최신 결과 조회와 HOST의 Decision 확정·재검토, 모든 참여자의 Decision 조회 API를 제공한다. Candidate는 HOST의 생성·수정·보관 API를 제공하며, 보관은 물리 삭제가 아닌 `ARCHIVED` 전환으로 처리한다.
- Room 조회 응답의 `hostParticipant`에는 생성된 HOST Participant의 공개 정보만 반환한다.
- Room 조회 응답의 `currentParticipant`에는 Bearer token으로 인증·확인한 현재 Participant의 공개 정보만 반환한다.
- Room 조회의 `participants`에는 현재 활성 상태(`JOINED` 또는 `RESPONDED`)인 HOST·MEMBER Participant의 공개 정보를 반환한다. `LEFT`·`REMOVED` Participant의 이력은 이 응답에 포함하지 않는다.
- Room 조회의 `candidates`에는 현재 활성 Candidate를 `displayOrder` 순서로 반환한다. 아직 구현하지 않은 계산·결정 데이터는 각각 `null`, `null`로 반환한다.
- Room 조회의 `myResponses`에는 Authorization 토큰으로 확인한 현재 참여자가 현재 방의 활성 Candidate에 저장한 응답만 `candidates` 순서로 반환한다. 저장된 응답이 없으면 빈 배열을 반환하며, 다른 참여자의 응답과 `ARCHIVED` Candidate의 과거 응답은 반환하지 않는다.
- ParticipantCondition은 선택 사항이다. 조건을 저장하지 않아도 활성 Candidate에 모두 응답하면 `participantStatus`를 `RESPONDED`로 반환하며, Candidate가 추가되면 새 응답이 필요하므로 다시 `JOINED`가 된다.
- Participant lifecycle API는 MEMBER 본인의 leave와 HOST의 활성 MEMBER kick을 제공한다. 상태 변경 시 `LEFT`·`REMOVED` Participant는 활성 목록·계산 snapshot·coverage에서 제외하고 기존 Response와 계산·Decision 이력은 보존한다.
- `TOKEN_EXPIRED`는 Room 만료가 아니라 24시간이 지난 방 범위 접근 토큰을 의미한다.
- Decision 확정은 최신 `COMPLETED` ScoreResult만 사용하며, `STALE`·`FAILED` 결과와 100% 미만 응답 coverage는 거부한다. 서버는 점수·순위를 다시 계산하지 않고 snapshot의 ID·상태·응답 존재만 재검증한다.
- `POST /decision`과 `POST /decision/reopen`은 HOST만 수행할 수 있고, `GET /decision`은 유효한 Room Participant가 읽을 수 있다. 결정이 없을 때의 `404 DECISION_NOT_FOUND`는 정상적인 미확정 상태다.

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
| 409 | `ROOM_STATE_CONFLICT`, `CALCULATION_IN_PROGRESS`, `STALE_RESULT`, `DUPLICATE_RESPONSE`, `CANDIDATE_VERSION_CONFLICT` | 현재 상태 또는 오래된 Candidate 버전과 충돌 |
| 422 | `BUSINESS_RULE_VIOLATION`, `NO_ACTIVE_CANDIDATES`, `CANDIDATE_LIMIT_EXCEEDED`, `CONDITION_INCOMPLETE`, `PARTICIPANT_COUNT_OUT_OF_RANGE`, `RESPONSE_FIELD_MISSING` | JSON은 맞지만 MeetPoint 규칙 위반. `CONDITION_INCOMPLETE`은 조건을 보냈을 때의 형식·범위 오류이며 미입력을 뜻하지 않는다. 후보와 조건의 시간 충돌은 응답 제출을 거부하지 않고 계산 결과에 표시한다. |
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
  "currentParticipant": {
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
  "myResponses": [],
  "myCondition": null,
  "latestScoreResult": null,
  "decision": null
}
```

#### 주요 실패 상태와 유효성 검사

- `401 MISSING_TOKEN`, `INVALID_TOKEN` 또는 `TOKEN_EXPIRED`
- `404 RESOURCE_NOT_FOUND`: 토큰의 방 범위와 일치하지 않는 방 ID도 상세 없이 404로 처리
- 조회 응답에는 다른 방의 참여자·후보·계산 결과를 포함하지 않는다.
- `currentParticipant`는 요청 Bearer token으로 인증한 Participant이며, Client가 sessionStorage의 participant ID를 권한·표시 근거로 사용하지 않도록 한다.
- `myResponses`는 요청 본문의 참여자 ID가 아니라 Bearer 토큰의 참여자 범위로 결정한다. Room과 Participant의 소속이 일치하는지 서버가 확인한다.

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

### 4. 참여자 방 나가기

`POST /api/v1/rooms/{roomId}/leave`

요청 본문은 사용하지 않는다. 대상 Participant는 요청 본문이 아니라 Room-scoped Bearer token으로 식별한다.

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_004",
  "participant": {
    "id": "participant_02",
    "displayName": "지수",
    "role": "MEMBER",
    "status": "LEFT"
  },
  "roomStatus": "OPEN"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`: 토큰이 없거나 유효하지 않거나 폐기·만료됨
- `409 ROOM_STATE_CONFLICT`: HOST 본인 요청, 이미 비활성 Participant, `CALCULATING`, `CONFIRMED`, `CLOSED` Room
- 성공하면 Participant를 `LEFT`로 바꾸고 `tokenRevokedAt`을 기록한다.
- ParticipantResponse는 삭제하지 않는다. 최신 완료 `ScoreResult`가 있으면 `STALE`로 바꾸고, Room이 `CALCULATED`라면 `OPEN`으로 전환한다.
- 폐기된 token으로 Room 조회·응답 수정·계산·Decision 조회를 다시 수행할 수 없다.

### 5. HOST의 MEMBER 강퇴

`POST /api/v1/rooms/{roomId}/participants/{participantId}/kick`

요청 본문은 사용하지 않는다. 요청자의 역할은 Bearer token에서 확인하고, 경로의 `participantId`는 같은 Room의 강퇴 대상인지 서버가 다시 검증한다.

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_005",
  "participant": {
    "id": "participant_02",
    "displayName": "지수",
    "role": "MEMBER",
    "status": "REMOVED"
  },
  "roomStatus": "OPEN"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`
- `403 HOST_ONLY`: MEMBER token으로 강퇴를 요청하거나 실제 Room HOST가 아님
- `404 RESOURCE_NOT_FOUND`: 대상 Participant가 없거나 다른 Room에 속함
- `409 ROOM_STATE_CONFLICT`: HOST 자기 자신, 이미 `LEFT`·`REMOVED`인 대상, `CALCULATING`, `CONFIRMED`, `CLOSED` Room
- 성공하면 대상 Participant를 `REMOVED`로 바꾸고 대상 token을 폐기한다.
- ParticipantResponse와 과거 ScoreResult·Decision은 삭제하지 않는다. 최신 완료 `ScoreResult`가 있으면 `STALE`로 바꾸고, Room이 `CALCULATED`라면 `OPEN`으로 전환한다.
- leave/kick은 Room row lock을 획득한 짧은 transaction에서 상태·token 폐기·ScoreResult·Room 변경을 함께 처리한다. 중간 저장 실패는 전체 rollback한다.

### 6. 후보 등록

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

### 7. 후보 수정

`PATCH /api/v1/rooms/{roomId}/candidates/{candidateId}`

#### 요청 헤더

- `Authorization: Bearer <host-token>`
- `If-Match-Version: <현재 Candidate version>` (필수)

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
    "roomId": "room_01",
    "displayOrder": 1,
    "status": "ACTIVE",
    "time": {
      "startsAt": "2026-08-15T19:30:00+09:00",
      "endsAt": "2026-08-15T21:30:00+09:00",
      "timezone": "Asia/Seoul"
    },
    "place": {
      "name": "역삼 조용한 식당",
      "address": "서울 강남구 테헤란로 1",
      "area": "강남"
    },
    "estimatedCostPerPersonKrw": 30000,
    "tags": ["INDOOR", "QUIET"],
    "version": 2,
    "archivedAt": null
  },
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`, `404 RESOURCE_NOT_FOUND`
- `409 ROOM_STATE_CONFLICT`: 후보가 `ARCHIVED`이거나 방이 확정·종결 상태
- `400 VALIDATION_ERROR`: 부분 요청의 시간 구간, 주소, 비용 형식 또는 `If-Match-Version` 헤더 오류
- `409 CANDIDATE_VERSION_CONFLICT`: 요청 헤더의 버전이 현재 Candidate 버전과 다름
- 성공하면 Candidate `version`이 1 증가하고, 기존 완료 결과는 `STALE`이 된다.

### 8. 후보 삭제(보관)

`DELETE /api/v1/rooms/{roomId}/candidates/{candidateId}`

#### 요청 헤더

- `Authorization: Bearer <host-token>`
- `If-Match-Version: <현재 Candidate version>` (필수)

실제 행을 즉시 삭제하지 않고 `ARCHIVED`로 바꾸어 과거 계산 결과가 참조한 후보를 보존한다.

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_006",
  "candidate": {
    "id": "candidate_01",
    "roomId": "room_01",
    "displayOrder": 1,
    "status": "ARCHIVED",
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
    "version": 2,
    "archivedAt": "2026-08-13T04:42:00Z"
  },
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `403 HOST_ONLY`, `404 RESOURCE_NOT_FOUND`
- `409 ROOM_STATE_CONFLICT`: 확정·종결 방, 이미 보관된 후보
- `400 VALIDATION_ERROR`: `If-Match-Version` 헤더가 없거나 올바른 양의 정수가 아님
- `409 CANDIDATE_VERSION_CONFLICT`: 요청 헤더의 버전이 현재 Candidate 버전과 다름
- 활성 후보가 1개가 되는 삭제는 저장할 수 있지만, 다음 계산·확정은 후보 2개 이상이 될 때까지 거부한다.

### 9. 참여자 개인 조건 제출·수정

`PUT /api/v1/rooms/{roomId}/participants/{participantId}/conditions`

개인 조건은 선택 사항이다. 이 API를 호출하지 않아도 후보별 응답 제출과 계산을 진행할 수 있으며, 조건을 입력한 경우에만 시간·예산·태그 비교 기준으로 사용한다.

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
    "participantId": "participant_02",
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
    },
    "submittedAt": "2026-08-13T04:18:00Z",
    "updatedAt": "2026-08-13T04:45:00Z"
  },
  "participantStatus": "JOINED",
  "scoreResultStatus": "STALE"
}
```

#### 주요 실패 상태와 유효성 검사

- `401 MISSING_TOKEN`, `INVALID_TOKEN` 또는 `TOKEN_EXPIRED`; 다른 참여자 수정 시 `403 FORBIDDEN`
- `404 RESOURCE_NOT_FOUND`: 다른 방의 참여자 ID 포함
- `409 ROOM_STATE_CONFLICT`: 확정 방에서 재검토 없이 수정
- `422 CONDITION_INCOMPLETE`: 시간이 비어 있거나 종료 시각이 시작 시각보다 이르거나 같음, 예산이 음수, 태그가 중복되거나 허용 범위를 벗어남
- 시간 구간은 1~10개, 각 태그 배열은 최대 10개·태그는 50자 이내이며 세 태그 배열 사이에도 중복을 허용하지 않는다. 예산은 `null` 또는 0~2,000,000원 정수다. 이동 부담은 일반 조건에 저장하지 않고 후보별 응답의 `travelBurden`으로만 받는다.

### 10. 참여자 후보별 응답 제출·수정

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

- `401 MISSING_TOKEN`, `INVALID_TOKEN` 또는 `TOKEN_EXPIRED`; 본인 참여자 ID가 아니면 `403 FORBIDDEN`
- `404 RESOURCE_NOT_FOUND`: 방·참여자·후보 중 하나가 다른 방이거나 없음
- `409 ROOM_STATE_CONFLICT`: 후보가 보관되었거나 확정 방에서 재검토 없이 변경
- `400 VALIDATION_ERROR`: 상태가 세 값 중 하나가 아니거나 `travelBurden`이 `EASY`, `NORMAL`, `HARD` 중 하나가 아님
- `travelBurden`은 모든 활성 후보에 필수다.
- `note`는 선택 입력이며 0~300자다. Solver는 이 값을 점수·순위·충돌 판정에 사용하지 않는다.
- 응답 제출에는 개인 조건이 필요하지 않다. 조건을 입력한 참여자가 시간·예산·태그 기준과 다른 후보에 `AVAILABLE` 또는 `MAYBE`를 선택해도 응답을 저장한다. 해당 차이는 계산 결과의 충돌·근거로 표시한다.

### 11. 후보 점수 계산 요청

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
    "policyVersion": "condition-aware-1",
    "scoringProfile": "CONDITION_AWARE",
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
- 개인 조건은 선택 사항이다. 미입력 참여자의 `condition`은 `null`로 Solver에 전달하며 응답과 후보 정보로 계산한다. 결과의 `explanationFlags`에 `CONDITION_NOT_PROVIDED`를 표시한다.
- 후보별 응답 누락은 계산을 거부하지 않고 결과의 `coverage`와 `MISSING_RESPONSE`로 표시한다.
- `clientRequestId`가 같은 재시도 요청은 동일 계산을 재사용하도록 설계하지만, 이 키의 보존 기간은 미결정이다.

### 12. 계산 결과 조회

`GET /api/v1/rooms/{roomId}/calculations/{calculationId}`

#### 응답 JSON — `200 OK`

```json
{
  "requestId": "req_20260813_010",
  "calculation": {
    "id": "score_20260813_02",
    "roomId": "room_01",
    "status": "COMPLETED",
    "policyVersion": "condition-aware-1",
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
            "reasons": ["참석 가능 여부: 참석 가능", "이동 부담: 이동 쉬움", "예산: 예산 범위 안", "선호하는 특징: 선호 특징 1/1개 일치"]
          }
        ],
        "reasons": ["3명이 모두 의견을 남겼습니다."],
        "conflicts": [],
        "blockingIssues": [],
        "explanationFlags": []
      }
    ],
    "completedAt": "2026-08-13T04:50:01Z"
  }
}
```

`status`가 `RUNNING`이면 `candidates`가 없을 수 있다. `FAILED`이면 `calculation.error`에 Solver 오류 코드와 재시도 가능 여부를 담고, 해당 계산 요청으로 `Room`은 `OPEN`으로 돌아간다. `coverage`는 API 호환성을 위한 필드명이며, 화면에서는 “의견 작성 현황”으로 표시한다. `reasons`와 참가자별 `reasons`는 화면에 바로 보여줄 수 있는 한국어 설명 문장으로 반환한다.

위 JSON은 설명을 위해 `participantBreakdown`을 한 명만 보인 축약 예시다. 실제 `COMPLETED` 응답에서는 `coverage.totalParticipants`에 해당하는 모든 참가자의 breakdown을 반환한다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `404 RESOURCE_NOT_FOUND`
- 계산 ID가 다른 방에 속하면 상세 정보 없이 404를 반환한다.
- `STALE` 결과도 조회는 가능하지만 확정 API는 이를 거부한다.

### 13. 최신 계산 결과 조회

`GET /api/v1/rooms/{roomId}/score-results/latest`

#### 응답 JSON — `200 OK`

계산 결과 조회 API의 `calculation` 객체와 같은 전체 결과를 반환한다. 결과 화면은 이 API를 사용한다.

```json
{
  "requestId": "req_20260813_011",
  "scoreResult": {
    "id": "score_20260813_02",
    "status": "COMPLETED",
    "policyVersion": "condition-aware-1",
    "ranking": ["candidate_01", "candidate_02"],
    "recommendationStatus": "PARTIAL_MATCH",
    "recommendationWarnings": []
  }
}
```

위 `scoreResult`는 식별·요약 필드만 보인 축약 예시다. 실제 응답은 12번 계산 결과 조회의 `coverage`, `candidates`, `participantBreakdown`, `reasons`, `conflicts`, `explanationFlags`를 모두 포함한다.

#### 주요 실패 상태와 유효성 검사

- `401 INVALID_TOKEN`, `404 RESOURCE_NOT_FOUND`
- 계산 이력이 없으면 `404 SCORE_RESULT_NOT_FOUND`
- 최신 결과가 `FAILED` 또는 `STALE`이면 상태를 그대로 반환하며 자동으로 새 계산을 만들지 않는다.
- 최신 계산이 실패한 경우 새 계산 요청 전까지 방 상태는 `OPEN`이며, 실패 결과를 성공 결과처럼 확정에 사용할 수 없다.

### 14. 최종 후보 확정

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
- Server는 짧은 transaction 안에서 Room row lock 후 최신 ScoreResult의 Room 소속·`COMPLETED` 상태·Room의 `latestScoreResultId`, 활성 Participant/Candidate 수, 선택 후보 projection을 다시 확인한다.
- `coverage`가 활성 Participant × 활성 Candidate 전체 응답과 일치하지 않거나 실제 `SUBMITTED` 응답이 하나라도 빠지면 `422 BUSINESS_RULE_VIOLATION`으로 거부한다. 누락 응답을 `AVAILABLE` 또는 `NORMAL`로 채우지 않는다.
- `decisionNote`는 trim해서 저장한다. 선택 후보에 이슈가 없으면 생략할 수 있고, 이슈가 있는 경우에만 1~300자의 메모를 요구한다.
- 현재 확정 Decision이 있으면 먼저 재검토 API를 호출해야 한다. 재검토 후 새 확정이 저장되면 이전 Decision은 `SUPERSEDED`로 보존된다.

### 15. 확정 결과 재검토 열기

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
- 재검토는 Room이 `CONFIRMED`이고 현재 Decision이 `CONFIRMED`일 때만 허용한다. 성공하면 Room은 `OPEN`이 되고 기존 `currentDecisionId`는 같은 `REOPENED` Decision을 계속 가리킨다.
- 재검토 후 Room의 `currentDecisionId`는 기존 `REOPENED` Decision을 계속 가리키므로 GET 조회에서 기존 후보·점수·사유를 확인할 수 있다. 후보·응답이 실제로 변경되기 전에는 ScoreResult를 자동으로 덮어쓰지 않는다.

### 16. 최종 결과 조회

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
- 조회 projection의 `candidate`는 Decision과 같은 Room의 Candidate에서 조합하며, 후보가 이후 `ARCHIVED`가 되어도 과거 후보 payload를 반환한다. `overallScore`는 Decision에 저장하지 않고 참조한 ScoreResult의 선택 후보 projection에서 읽는다.

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
  "policyVersion": "condition-aware-1",
  "scoringProfile": "CONDITION_AWARE",
  "roomId": "room_01",
  "participants": [
    {
      "participantId": "participant_02",
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
- `participants[].condition`은 `null`일 수 있다. 이 경우 조건 충돌 없이 응답과 후보 정보만 계산하고 `CONDITION_NOT_PROVIDED`를 결과에 남긴다.
- 응답이 없는 후보는 입력 오류가 아니라 `MISSING_RESPONSE`로 결과에 포함한다. 응답은 있으나 `travelBurden`이 빠진 경우는 `RESPONSE_FIELD_MISSING` 오류다.
- Solver는 입력에 있는 `roomId`를 결과에 되돌려 줄 수 있지만, 이를 근거로 데이터베이스를 조회하지 않는다.

### 성공 출력 데이터 구조 — `200 OK`

```json
{
  "requestId": "score_20260813_02",
  "policyVersion": "condition-aware-1",
  "scoringProfile": "CONDITION_AWARE",
  "status": "COMPLETED",
  "metadata": {
    "scoringProfile": "CONDITION_AWARE",
    "weights": { "time": 40, "travelBurden": 25, "budget": 20, "preference": 15 }
  },
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
  "policyVersion": "condition-aware-1",
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
| 422 | `NO_PARTICIPANTS`, `NO_CANDIDATES`, `INVALID_TIME_RANGE`, `RESPONSE_FIELD_MISSING`, `INVALID_CONDITION` | 아니오 | 입력 스냅샷으로 계산할 수 없음. 개인 조건 `null`은 허용한다. |
| 500 | `SOLVER_INTERNAL_ERROR` | 한 번 | 계산 내부 오류 |
| 503 | `SOLVER_OVERLOADED` | 한 번 | 일시적으로 계산할 수 없음 |

NestJS는 Solver의 `requestId`와 오류 코드를 보존하여 외부 API의 `SOLVER_ERROR` 또는 `SOLVER_UNAVAILABLE`로 매핑한다. Solver가 만든 결과를 임의로 재점수화하지 않는다.

## 확정 사항과 미결정 사항 요약

- **확정**: 외부 API의 책임은 NestJS가 가지며, Solver API는 계산 입력과 출력에만 집중한다.
- **확정**: 결과에는 숫자 점수뿐 아니라 참가자별 breakdown, 근거, 충돌, 커버리지를 포함한다.
- **확정**: 토큰은 불투명 난수이며 24시간 후 만료되고, 현재 토큰 갱신 API가 없다. 구현 시 원문 대신 해시만 저장한다.
- **확정**: Room 자체는 자동 만료되지 않으며 `TOKEN_EXPIRED`는 만료된 방 범위 토큰에만 적용한다.
- **미결정**: 방 데이터 삭제·보존 기간, API 버전별 호환 기간, 계산 결과 페이지의 이력 조회 범위
- **확정**: Candidate 수정·보관에는 `If-Match-Version`을 필수로 사용하며, 버전이 다르면 `CANDIDATE_VERSION_CONFLICT`를 반환한다.
