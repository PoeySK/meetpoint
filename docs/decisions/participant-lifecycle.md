# Participant lifecycle 결정 기록

## 결정 상태

- **상태**: 확정
- **결정일**: 2026-08-17
- **적용 범위**: Participant의 자발적 방 나가기와 HOST의 MEMBER 강퇴
- **구현 상태**: 정책 확정 및 leave/kick vertical slice 구현 완료.

## 배경

현재 `Participant`는 `JOINED`, `RESPONDED`, `LEFT`, `REMOVED` 상태를 이미 표현할 수 있고, `tokenRevokedAt`으로 방 범위 토큰을 폐기할 수 있다. 계산과 Decision 검증도 `LEFT`·`REMOVED`를 활성 Participant에서 제외하는 기준을 사용한다.

그러나 Participant가 스스로 나가거나 HOST가 제거하는 외부 API와 Room 사용자 흐름은 아직 구현하지 않았다. 이 결정은 기존 계산·Decision 이력 보존 원칙을 유지하면서 Participant의 활성 생명주기를 정의한다.

## 결정

### 1. MEMBER의 방 나가기

- MEMBER는 자신의 현재 Participant만 나갈 수 있다.
- 방 나가기는 Participant의 `status`를 `LEFT`로 바꾸는 논리 상태 변경이다. Participant 행과 연결된 응답은 물리 삭제하지 않는다.
- 방 나가기와 동시에 해당 Participant의 `tokenRevokedAt`을 설정한다. 기존 Room-scoped token 검증은 폐기된 token을 `TOKEN_EXPIRED`로 거부한다.
- 나간 Participant는 Room 조회, 후보·응답 변경, 계산 요청, Decision 조회를 포함한 방 범위 API를 더 사용할 수 없다.
- 이름은 인증 수단이 아니므로, `displayName`으로 나간 사람을 복구하거나 식별하지 않는다.

### 2. HOST의 강퇴하기

- 강퇴는 현재 Room의 HOST만 수행할 수 있다.
- HOST는 같은 Room에 속한 활성 MEMBER만 강퇴할 수 있다.
- HOST, 다른 Room의 Participant, 이미 `LEFT`·`REMOVED`인 Participant는 강퇴 대상이 아니다.
- 강퇴 대상의 `status`를 `REMOVED`로 바꾸고 `tokenRevokedAt`을 설정한다.
- MEMBER는 강퇴할 수 없고, 강퇴된 Participant는 폐기된 token으로 방 범위 API에 접근할 수 없다.
- 이미 처리된 Participant에 대한 중복 변경은 성공으로 간주하지 않고 기존 `ROOM_STATE_CONFLICT` 정책을 재사용한다.

### 3. HOST 본인의 방 나가기

- MVP에서는 HOST의 방 나가기를 금지한다.
- `Room.hostParticipantId`와 HOST 전용 작업의 소유자를 다른 Participant로 자동 변경하지 않는다.
- HOST 승계나 방 폐쇄가 필요해지는 경우 별도의 정책과 vertical slice로 결정한다.

### 4. 재입장

- `LEFT`·`REMOVED` Participant를 같은 Participant ID로 복구하거나 활성 상태로 되돌리지 않는다.
- 방 코드로 다시 입장하면 새로운 Participant ID와 새로운 room-scoped token을 발급한다.
- 새 Participant는 이전 Participant의 응답, 상태, 계산 근거를 상속하지 않는다.
- 익명 방 코드와 표시 이름만 사용하는 MVP에서는 `REMOVED` 상태가 같은 사람의 재입장을 영구적으로 식별·차단하는 계정 기반 ban을 의미하지 않는다. 영구 차단과 계정 연결은 MVP 범위 밖이다.

### 5. Room 상태별 변경 허용

| Room 상태 | 나가기·강퇴 | 처리 기준 |
| --- | --- | --- |
| `DRAFT` | 정상 흐름상 MEMBER가 존재하지 않으므로 적용 대상 없음 | HOST 나가기는 금지 |
| `OPEN` | 허용 | 활성 Participant를 줄이고 Room은 `OPEN` 유지 |
| `CALCULATING` | 차단 | 계산 snapshot과 Participant 변경의 경쟁을 허용하지 않음 |
| `CALCULATED` | 허용 | 최신 완료 ScoreResult를 `STALE`로 만들고 Room을 `OPEN`으로 전환 |
| `CONFIRMED` | 차단 | HOST가 먼저 Decision 재검토를 열어 `OPEN`으로 전환해야 함 |
| `OPEN` + 현재 Decision이 `REOPENED` | 허용 | 기존 Decision과 `currentDecisionId`를 보존하고 Participant 변경 후 재계산 요구 |
| `CLOSED` | 차단 | MVP에서는 Room 종결을 변경할 수 없음 |

`CALCULATED` 상태에서 변경할 때도 완료된 결과를 현재 데이터로 덮어쓰지 않는다. 기존 ScoreResult 행의 상태만 `STALE`로 바꾸고, 새 계산은 별도의 ScoreResult로 저장한다.

### 6. 활성 Participant와 데이터 보존

- 활성 Participant는 `JOINED` 또는 `RESPONDED` 상태다.
- `LEFT`·`REMOVED` Participant는 활성 인원 수, 계산 snapshot, 계산 coverage, 확정 검증에서 제외한다.
- `Participant`, `ParticipantResponse`, `ScoreResult`, `Decision`은 물리 삭제하지 않는다.
- 나간 Participant의 Response는 과거 데이터로 보존하지만, 새 계산의 입력에는 포함하지 않는다.
- Participant 변경으로 최신 `COMPLETED` ScoreResult의 계산 대상 집합이 달라지면 해당 결과를 `STALE`로 만든다. `latestScoreResultId`는 과거 최신 결과를 가리키는 이력 참조로 유지한다.
- `FAILED` 결과는 성공 결과로 바꾸거나 삭제하지 않는다. 새 계산이 필요하면 별도의 ScoreResult를 만든다.

### 7. Decision 보존

- `CONFIRMED` Room에서 Participant 변경을 차단하므로 현재 확정 Decision은 나가기·강퇴 요청으로 직접 변경되지 않는다.
- 재검토 후 `OPEN`인 Room에서 Participant가 변경되면 기존 `REOPENED` Decision과 `currentDecisionId`를 그대로 보존한다.
- 새 계산 후 새 Decision이 확정될 때만 기존 `REOPENED` Decision을 `SUPERSEDED`로 바꾸고 `replacedDecisionId`로 연결한다.
- 과거 Decision이 참조하는 Candidate, ScoreResult, 근거 projection은 현재 Participant 목록이나 최신 계산으로 덮어쓰지 않는다.

### 8. Room 조회의 참가자 목록

- Room 조회의 `participants`는 현재 활성 Participant 목록을 의미한다.
- `LEFT`·`REMOVED` Participant는 현재 참가자 목록과 현재 인원 수에 포함하지 않는다.
- 비활성 Participant의 이력 목록을 별도로 공개하는 API는 이번 범위에 추가하지 않는다.
- 현재 인증 Participant는 유효한 Bearer token에서 서버가 확인한 Participant이며, Client가 sessionStorage의 Participant ID나 displayName을 권한·표시의 근거로 삼지 않는다.

### 9. 오류와 동시성

- 인증·token 오류는 기존 `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`와 공통 오류 envelope를 재사용한다.
- MEMBER의 강퇴 요청은 기존 `HOST_ONLY` 권한 오류를 재사용한다.
- 다른 Room의 Participant를 대상으로 한 요청은 상세 정보를 노출하지 않고 기존 `RESOURCE_NOT_FOUND` 정책을 재사용한다.
- Room 상태 충돌, 계산 중 변경, 이미 `LEFT`·`REMOVED`인 대상의 중복 변경은 기존 `ROOM_STATE_CONFLICT`를 재사용한다.
- leave/kick 구현은 짧은 DB transaction 안에서 Room row lock 후 actor·target의 Room 소속, 역할, 현재 상태를 다시 확인해야 한다.
- Participant 상태 변경, token 폐기, 최신 ScoreResult의 `STALE` 처리, Room 상태 변경은 하나의 transaction에서 함께 성공하거나 함께 rollback되어야 한다.
- 동시에 같은 Participant를 변경하면 먼저 Room lock을 얻은 요청만 성공하고, 나머지는 최신 상태를 재확인한 뒤 상태 충돌로 거부한다.

## 결정 이유

- Participant와 응답을 논리적으로 보존하면 과거 계산 snapshot과 Decision의 근거를 재현할 수 있다.
- 활성 Participant 집합을 계산 입력과 동일하게 정의하면 Participant 변경 뒤 coverage와 Participant count가 과거 결과에 남아 있는 문제를 피할 수 있다.
- `CONFIRMED` 상태에서 직접 변경을 금지하면 확정 결과가 사용자 모르게 현재 참가자 집합으로 바뀌는 일을 막을 수 있다.
- HOST 승계와 계정 기반 영구 차단은 별도의 권한·복구·UI 정책이 필요하므로 익명 토큰 MVP에 포함하지 않는다.
- 기존 오류 코드와 token 폐기 방식을 재사용하면 새로운 정책 때문에 인증·오류 envelope가 불필요하게 늘어나지 않는다.

## 상태·데이터 보존 영향

```text
JOINED/RESPONDED
  ├─ MEMBER self leave ─→ LEFT + token revoked
  └─ HOST kick         ─→ REMOVED + token revoked

OPEN 또는 REOPENED OPEN
  └─ Participant 변경 ─→ 최신 COMPLETED ScoreResult STALE → 재계산 필요

CONFIRMED
  └─ Participant 변경 요청 차단
     └─ HOST reopen 후 OPEN에서만 변경 가능
```

`LEFT`·`REMOVED`는 현재 활성 집합에서만 제외되며 과거 응답·ScoreResult·Decision의 참조 자체는 삭제하지 않는다.

## Server 구현 영향

- leave와 kick은 Server가 소유하는 Room-scoped mutation이다.
- Controller는 token과 입력을 전달하고, 실제 권한·Room 상태·Participant 상태·transaction 검증은 Server service가 담당한다.
- `room-access`의 기존 token 폐기 검증과 공통 오류 envelope를 재사용한다.
- 계산 snapshot과 Decision 확정 검증은 활성 Participant 기준을 계속 사용한다.
- 구현된 API 경로와 공개 응답은 `docs/04-api-contract.md`에 기록한다. 두 action은 요청 본문을 사용하지 않으므로 별도 입력 DTO를 만들지 않는다. 기존 오류 코드와 공통 envelope를 재사용한다.

## Client 구현 영향

- MEMBER에게 자기 방 나가기 UI를 제공하고, HOST에게 활성 MEMBER별 강퇴 UI를 제공한다.
- 나가기·강퇴 전에 실제 `button`과 확인 절차를 사용하고 성공·실패를 `aria-live`로 알린다.
- mutation 성공 후 중앙 Room session을 즉시 재조회하여 활성 참가자 목록과 Room 상태를 갱신한다.
- polling은 온라인 상태를 새로 정의하지 않으며, Server가 저장한 Participant 상태만 표시한다.
- token 폐기 후에는 기존 Room 오류 안내 흐름을 재사용하고, MEMBER leave 성공 시 Client는 방 세션 값을 정리한 뒤 Room 화면을 종료한다. HOST kick 성공 시 중앙 Room session을 즉시 재조회한다.

## 계산·Decision 영향

- Participant 변경은 Solver의 점수 계산 규칙을 바꾸지 않고 snapshot의 Participant 집합만 바꾼다.
- Client나 GPT가 이탈 Participant의 응답을 추정하거나 `AVAILABLE`로 채우지 않는다.
- 기존 확정 결과는 재검토·재확정 흐름 없이 바꾸지 않는다.
- 새 계산의 coverage와 expected responses는 새 활성 Participant × 활성 Candidate 집합으로 계산한다.

## 이번 범위에서 제외하는 항목

- HOST 승계와 HOST 방 폐쇄
- 계정 기반 영구 ban, IP·브라우저 식별을 이용한 재입장 차단
- 비활성 Participant 이력 조회·감사 화면
- 알림, 실시간 WebSocket/SSE, 온라인 상태
- 새 오류 코드와 계정 기반 권한 체계
- ParticipantCondition과 Candidate lifecycle

## 향후 재검토 조건

- 사용자 계정이나 초대 관리가 도입되면 `REMOVED`를 계정 단위 영구 차단으로 확장할지 검토한다.
- HOST 승계·방 폐쇄가 필요해지면 HOST leave와 `hostParticipantId` 전이를 별도 결정한다.
- 비활성 Participant의 감사·복구 요구가 생기면 이력 조회 권한과 보존 기간을 별도 결정한다.
