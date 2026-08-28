# MeetPoint 현재 작업 계획

## 문서 목적

이 문서는 현재 저장소의 구현 상태를 기준으로 다음 작업의 우선순위와 완료
조건을 관리한다. 기간이나 작업 일수로 범위를 고정하지 않고, 각 작업이
제품 흐름·데이터 정합성·운영 안정성에 미치는 영향을 기준으로 순서를 정한다.

## 현재 시스템 구성

```text
Browser
  ↓ HTTP/JSON
Next.js Client :10081
  ↓ /api/v1 + room-scoped token
NestJS Server :3001
  ├─ PostgreSQL :5432
  └─ Rust Solver :4000
```

- Client는 화면과 입력을 담당하며 PostgreSQL이나 Solver를 직접 호출하지 않는다.
- Server는 Room, Participant, Candidate, ParticipantCondition, ParticipantResponse, ScoreResult,
  Decision의 원본 상태와 권한·transaction을 소유한다.
- Solver는 Server가 만든 snapshot을 받아 결정적인 점수와 근거를 계산한다.
- PostgreSQL 스키마는 TypeORM migration으로만 변경하며 자동 동기화와 자동
  migration 실행은 사용하지 않는다.
- `mvp-1`과 `MVP_NO_CONDITIONS`는 현재 계산 결과와 Solver 계약에 이미 저장·전달되는
  호환 식별자다. 의미 변경 없이 이름만 바꾸는 작업이 아니므로 별도의 정책 버전
  migration 작업으로 다룬다.

## 현재 구현 상태

| 영역 | 상태 | 현재 동작 |
| --- | --- | --- |
| Room 생성·조회 | 완료 | Room과 HOST Participant를 transaction으로 생성하고 room-scoped token으로 조회한다. |
| Participant 입장·lifecycle | 완료 | 방 코드 입장, MEMBER leave, HOST kick, token 폐기, 활성 목록 반영을 제공한다. |
| Candidate | 완료(P0-2 범위) | HOST의 생성·수정과 `ARCHIVED` 전환, version 조건부 저장, 활성 목록·과거 이력 분리, Client 관리 UI를 제공한다. |
| ParticipantCondition·ParticipantResponse | 완료 | 참여자 본인 조건 저장·수정, 조건 기반 응답 검증, 모든 활성 후보 응답 완료 시 `RESPONDED` 전환과 최신 결과 무효화를 제공한다. |
| 계산 | 부분 완료 | Server가 조건·응답 snapshot을 만들어 조건-aware Solver를 호출하고 결과·coverage·충돌·경고를 저장한다. 계산 실행 복구는 남아 있다. |
| Decision | 완료 | HOST의 최신 완료 결과 선택, 이슈 확인, 확정·재검토와 이력 보존을 제공한다. |
| Client 화면 | 부분 완료 | 생성·입장·방 작업공간·조건 입력·후보 생성·수정·보관·응답·계산 결과·확정·참여자 lifecycle을 제공한다. Client 자동 테스트는 남아 있다. |
| 계약·문서 | 완료(P0-2 범위) | 조건 API, Candidate lifecycle, Room의 `myCondition`, condition-aware Solver snapshot·결과와 현재 구현을 정렬했다. |
| 검증 | 부분 완료 | 조건·Candidate HTTP 계약, PostgreSQL 통합 흐름, Solver 점수·HTTP 단위 검증을 추가했다. Client 자동 테스트와 CI 고정은 남아 있다. |

## 우선순위 작업

### P0 — 핵심 사용자 흐름 완성

#### 1. ParticipantCondition 전체 흐름 구현

제품 정의에 있는 시간·예산·선호 조건을 실제 데이터와 계산 입력으로 연결한다.

- `ParticipantCondition` 테이블, Entity, migration, repository를 추가한다.
- `PUT /api/v1/rooms/{roomId}/participants/{participantId}/conditions`를
  구현한다.
- Bearer token과 participant 경로 일치, Room 상태, 시간 구간·예산·태그 형식을
  Server에서 검증한다.
- Room 조회에 현재 참여자의 조건과 제출 시각을 노출할지 계약을 확정하고,
  다른 참여자의 민감한 조건은 노출하지 않는다.
- 조건 제출과 모든 활성 Candidate 응답 충족 여부를 기준으로 `JOINED`와
  `RESPONDED` 전환을 구현한다.
- 계산 snapshot과 Solver 입력에 조건을 포함하고, 기존 `mvp-1`과 호환되는
  `condition-aware-1`/`CONDITION_AWARE` 정책을 적용한다. 예산 초과, 필수 태그 누락, 회피 태그 충돌, 시간 조건
  충돌의 점수·`eligible`·근거를 테스트로 고정한다.
- Client에 조건 입력·수정·저장 상태·검증 오류 화면을 추가한다.

상태: 완료. `participant_conditions` migration, 조건 API·권한·validation, Room의
`myCondition`, `RESPONDED` 전환, condition-aware snapshot/Solver 점수·충돌,
Client 조건 입력 및 저장·수정·새로고침 상태를 구현했다.

완료 조건: 새로 입장한 참여자가 조건을 저장하고 후보별 응답을 제출하면
`RESPONDED`가 되며, Server snapshot과 Solver 결과에 조건 충돌과 점수가
동일하게 반영된다. transaction rollback, 권한 오류, 잘못된 시간 구간,
확정 차단까지 자동 테스트한다.

#### 2. Candidate lifecycle 완성

- `PATCH /api/v1/rooms/{roomId}/candidates/{candidateId}`와
  `DELETE /api/v1/rooms/{roomId}/candidates/{candidateId}`를 구현한다.
- HOST 권한, Room 상태, Candidate 소속·상태, 활성 후보 수, 날짜·장소·비용·태그
  검증을 생성 API와 같은 기준으로 적용한다.
- 물리 삭제 대신 `ARCHIVED`로 전환하고 과거 ScoreResult·Decision의 참조 payload를
  보존한다.
- 수정·보관 시 최신 완료 결과를 `STALE`로 바꾸고 필요한 경우 Room을 다시
  `OPEN`으로 전환한다.
- `version` 또는 동등한 동시성 기준을 실제 update 조건에 사용해 오래된 Client의
  덮어쓰기를 막는다.
- Client 후보 목록에 수정·보관·실패 복구 UI를 추가하고, 변경 후 중앙 Room 상태를
  재조회한다.

완료 조건: 후보 수정·보관 뒤 활성 목록, 응답 입력, coverage, 최신 결과가
  일관되게 갱신된다. 확정 결과가 과거 후보를 계속 조회할 수 있고, 동시 수정과
  Room 상태별 거부가 테스트된다.

상태: 완료. HOST 전용 Candidate 수정·보관 API, `If-Match-Version` 조건부 저장,
`ARCHIVED` 보존, 최신 결과 `STALE` 전환, Room 재오픈, 활성 응답·coverage 반영,
Client 수정·보관·실패 복구 UI와 관련 HTTP·PostgreSQL 통합 테스트를 구현했다.

#### 3. API 계약과 실제 구현 정렬

- `docs/04-api-contract.md`, DTO/validation, controller, view model, Client 타입의
  차이를 한 항목씩 정리한다.
- 구현되지 않은 조건·후보 lifecycle을 “설계”와 “구현됨”으로 구분하지 않고 현재
  상태에 맞게 표시한다.
- 공통 오류 envelope와 `requestId`, HTTP 상태, 공개 필드를 실제 응답 테스트로
  고정한다.
- OpenAPI 도입 여부와 생성·검증 방식을 정하고, 도입하지 않으면 현재 계약 문서를
  검증 기준으로 유지한다.

완료 조건: 주요 외부 route의 요청·응답·오류 예시가 실제 controller와 일치하고,
Server e2e가 계약의 성공·실패 사례를 검증한다.

### P1 — 서비스 신뢰성과 운영 기반

#### 4. 계산 실행의 내구성 확보

현재 `StartCalculationUseCase`는 계산을 NestJS 프로세스 내부의 비동기로 실행한다.
프로세스가 재시작되면 실행 중인 계산이 사라지고, 장시간 작업·재시도·운영 추적이
어렵다.

- 계산 상태 전이(`REQUESTED` → `RUNNING` → `COMPLETED`/`FAILED`)와 재시작 시
  복구 규칙을 명시한다.
- DB 기반 job/outbox를 사용할지 별도 queue를 사용할지 결정하고, 선택한 방식으로
  retry·timeout·중복 실행 방지·실패 원인 보존을 구현한다.
- Solver 연결 상태, 응답 timeout, 잘못된 결과 schema, Server 종료를 각각 재현하는
  통합 테스트를 추가한다.
- 계산 snapshot과 결과 metadata로 동일 결과를 다시 검증할 수 있게 한다.

완료 조건: Server 재시작과 Solver 장애 뒤에도 계산이 유실되거나 중복 확정되지
않으며, Client가 최종 상태와 재시도 가능 여부를 알 수 있다.

#### 5. 인증·남용 방지·데이터 lifecycle

- 익명 room-scoped token의 24시간 만료, 폐기, 재발급/복구 정책을 실제 사용자
  흐름에 맞게 확정한다.
- 방 코드 추측, 입장·응답·계산 endpoint 남용에 대한 rate limit과 감사 로그 범위를
  정한다.
- 운영 로그에서 token 원문과 민감한 입력이 노출되지 않는지 확인한다.
- Room 자동 종결, 계산·Decision·Participant 이력 보존 기간, 삭제 요청과 DB
  cleanup 정책을 정하고 migration/배치 작업으로 구현한다.
- Room·Solver·PostgreSQL health의 의미와 장애 시 HTTP 응답을 분리한다.

완료 조건: 공격·만료·삭제 시나리오가 정책과 테스트로 설명되고, 복구 가능한
운영 데이터와 삭제 대상의 경계가 명확하다.

#### 6. Client 품질과 실제 사용자 검증

- 조건 입력, 후보 lifecycle, 응답 저장, 계산 polling, 확정·재검토, leave/kick의
  성공·실패·새로고침·token 만료 시나리오를 브라우저 수준에서 검증한다.
- 현재 수동 확인에 의존하는 Client API 타입과 로딩·빈 상태·오류·접근성 메시지를
  정리한다.
- Server API 계약과 Client 타입을 같은 fixture 또는 contract test로 연결한다.
- 계산 e2e가 환경 변수에 따라 건너뛰지 않도록 테스트용 Solver 전략을 정한다.

완료 조건: 핵심 흐름을 새 브라우저 세션에서 처음부터 확정까지 재현할 수 있고,
API 오류·새로고침·동시 변경에서도 화면과 서버 상태가 어긋나지 않는다.

#### 7. 배포·관측 가능성

- Server와 Solver를 포함한 Compose 실행 구성을 실제 환경 변수·healthcheck·migration
  순서와 함께 정의한다.
- CI에서 Client lint/build, Server lint/test/e2e/build, Solver fmt/check/test를
  실행한다.
- 구조화 로그, `requestId` 추적, 계산 latency·failure metric, DB migration 상태를
  운영에서 확인할 수 있게 한다.
- secret 주입, HTTPS/reverse proxy, DB backup/restore, rollback 절차를 문서화한다.

완료 조건: 새 환경에서 같은 설정으로 서비스를 시작하고 migration·health·로그를
확인할 수 있으며, 배포 실패 시 이전 버전과 데이터를 안전하게 복구할 수 있다.

### P2 — 제품 확장

아래 항목은 P0·P1의 데이터 계약과 운영 기반이 안정된 뒤 각각 별도 요구사항과
결정 문서를 만든다.

- 지도·주소 정규화·실제 이동시간 provider 연동과 자기 기입 이동 부담의 우선순위
- 사용자 계정, 방 목록, 토큰 분실 복구와 권한 모델
- 이메일·푸시 알림 및 계산 완료 이벤트
- WebSocket/SSE 기반 실시간 상태 반영
- 식사 외 카페·운동·여행·행사 모임 유형과 유형별 Solver 정책
- 자연어 조건 입력 보조. 자연어 해석은 Server에서 구조화하고 최종 점수는 규칙
  기반 Solver가 계산한다.

## 작업 순서의 기준

1. ParticipantCondition과 Candidate lifecycle을 구현해 제품 정의와 실제 입력 흐름을
   일치시킨다.
2. 위 변경을 API 계약·migration·Solver schema·Client 타입·자동 테스트에 동시에
   반영한다.
3. 계산 실행 내구성과 token·data lifecycle을 보강한다.
4. 브라우저 검증, CI, 배포·관측 가능성을 갖춘 뒤 외부 provider와 확장 기능을
   추가한다.

각 작업은 코드 변경만으로 완료하지 않고 migration, API 계약, 자동 테스트,
Client 동작, 운영상 실패 조건을 함께 확인한다.

## 현재 관련 문서의 정리 원칙

- 제품·사용자 흐름 문서는 현재 제품의 목표와 구현 상태를 구분해 기록한다.
- 계산 문서는 현재 조건-aware 계산과 기존 결과 재현 정책을 분리한다.
- 결정 문서는 기존 선택의 이유를 보존하되, 기간·시제품을 기준으로 범위를
  설명하지 않는다.
- `mvp-1`, `MVP_NO_CONDITIONS` 같은 호환 식별자를 제거하려면 Solver, Server,
  Client, 저장 결과, API 문서, 테스트를 함께 version migration해야 한다. 그 전까지
  사용자 화면에는 내부 식별자를 노출하지 않는다.
