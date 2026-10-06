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
| 계산 | 완료 | 조건-aware snapshot·결과 저장과 PostgreSQL outbox·lease·제한 재시도로 재시작 및 장애를 복구한다. |
| Decision | 완료 | HOST의 최신 완료 결과 선택, 이슈 확인, 확정·재검토와 이력 보존을 제공한다. |
| Client 화면 | 구현·자동 검증 완료 | 생성·입장·조건·후보 lifecycle·응답·계산·확정·재검토·leave/kick·개인 접근 복구 및 Node/Chromium 테스트가 있다. 실제 사용자 검증은 남아 있다. |
| 계약·문서 | 완료(P0-2 범위) | 조건 API, Candidate lifecycle, Room의 `myCondition`, condition-aware Solver snapshot·결과와 현재 구현을 정렬했다. |
| 검증 | 자동 검증 구성 완료 | Client Node·격리 Chromium E2E, Server 단위·HTTP·격리 PostgreSQL/실제 Solver 통합, Solver 단위·HTTP 테스트와 GitHub Actions가 있다. 원격 CI 실행 성공과 운영 환경 검증은 별도 확인한다. |

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

현재 상태: 구현된 핵심 route는 `docs/04-api-contract.md`, HTTP/controller 테스트와 PostgreSQL 통합 테스트로 관리한다. OpenAPI는 도입하지 않았으며 계약 문서를 유지한다. 이번 정렬은 기능 상태와 배포 절차를 갱신하며 새로운 API나 계산 정책 버전을 추가하지 않는다.

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

상태: 완료. `calculation_jobs` outbox table에 Solver snapshot과 시도 횟수·lease·마지막 오류를 저장한다. 요청 transaction은 Room·ScoreResult·Job을 함께 `REQUESTED`로 만들고, Server worker는 PostgreSQL row lock/lease로 하나의 job만 `RUNNING`으로 claim한다. lease가 만료된 작업은 Server 시작과 polling에서 다시 claim하며, 재시도 가능한 Solver 장애는 제한 횟수까지 재요청하고 영구 오류 또는 한도 초과만 `FAILED`로 확정한다.

claim·완료·실패 상태 저장의 DB 오류는 Solver 오류와 분리한다. 실패한 transaction은 rollback하고 drain을 종료해 즉시 반복하지 않는다. 다음 polling에서 claim을 재시도하며, 이미 claim된 작업은 lease 만료 후 재처리한다. 로그에는 단계·안전한 오류 코드와 가능한 job/결과 ID만 남긴다. 일시적 오류는 경고, 그 밖의 오류는 오류로 기록하며 지속되는 장애는 원인 조치가 필요하다.

완료 transaction은 Room·ScoreResult·Job을 함께 반영하며 잠금 시각과 시도 횟수로 오래된 claim을 차단한다. 시도 횟수는 DB 장애 뒤 재claim에도 증가한다. 같은 snapshot의 Solver 재호출은 가능하므로 외부 호출의 exactly-once를 보장하지 않는다. SIGINT/SIGTERM 또는 모듈 종료 시 polling과 새 drain/claim을 중지한다. 진행 중 작업의 완료를 기다리는 별도 종료 대기는 없으며, 저장하지 못한 작업은 기존 lease로 복구한다. 단위 fault injection과 격리 PostgreSQL transaction 오류 주입 테스트로 rollback·재처리·오래된 claim 차단을 검증한다.

완료 조건: Server 재시작과 Solver 장애 뒤에도 계산이 유실되거나 중복 확정되지
않으며, Client가 기존 polling API로 `REQUESTED`·`RUNNING`·최종 상태를 확인할 수 있다.

#### 5. 남용 방지 — 후속 구현

익명 token 만료·폐기, MEMBER leave/HOST kick, 개인 접근 복구는 구현되어 있다.
복구 credential의 hash 저장·token 교체·복구 origin 검사·HttpOnly/Secure(운영)/SameSite=Strict 쿠키와 관련 HTTP·DB·Client 테스트가 있다.
방 코드 추측, 생성·입장·응답·계산·복구 endpoint별 rate limit과 안전한 감사 로그는 후속 작업이다.
완료 기준: 제한 단위·임계값·오탐 복구 정책을 결정하고 정상 흐름 및 남용 시나리오를 테스트한다. 원문 인증 정보는 기록하지 않는다.

#### 6. 사용자 검증 — 후속 검증

Node 테스트, 격리 Chromium E2E와 CI job은 구현되어 있다. 로컬 자동 검증과 실제 사용자의 이해도 검증을 구분한다.
완료 기준: 실제 사용자와 모바일에서 생성부터 확정·재검토·접근 복구까지 실행하고, 실패·동시 변경·접근성 문제를 기록·해결한다. Firefox/WebKit과 실제 HTTPS·CORS·쿠키도 확인한다.

#### 7. 배포 — 최소 구성 추가, 운영 검증 필요

`infra/docker-compose.deploy.yml`과 각 서비스 Dockerfile, 환경 예시 및 [운영 절차](09-deployment.md)를 제공한다.
개발 Compose는 PostgreSQL 전용으로 유지한다. 자동 migration/synchronize는 사용하지 않는다.
완료 기준: 격리 project에서 이미지 build → DB 준비 → 명시적 migration → 서비스 readiness → 생성·입장·조건·응답·계산·확정·복구가 통과한다.
실제 배포의 완료 기준은 도메인·HTTPS 프록시·secret 주입·백업 위치 결정과 실제 HTTPS 브라우저 검증이다. 이 작업은 실제 배포를 수행하지 않는다.

#### 8. 데이터 lifecycle — 후속 정책·구현

Room 자동 종결, Participant/조건/응답/계산 snapshot/Decision/복구 credential 보존 기간, 삭제 요청과 backup 만료 정책을 결정한다.
완료 기준: 보존과 삭제 대상·예외·복구 가능 기간을 명시하고, 식별 가능한 테스트 데이터로 cleanup과 참조 정합성을 검증한다. 이번에는 방 삭제나 cleanup 배치를 추가하지 않는다.

#### 9. 운영 관측 — 후속 구현

Server `/live`·DB 기반 `/ready`, Solver `/health`, 안전한 계산 job 오류 로그는 구현되어 있다. readiness는 migration 완료나 Solver 정상 여부를 증명하지 않는다.
완료 기준: requestId 추적, 계산 지연·실패·lease 재처리, DB 용량·backup 성공·migration 상태를 확인하는 지표와 경보·대응 절차를 마련한다. 관측 시스템은 이번 범위 밖이다.

### P2 — 제품 확장

아래 항목은 P0·P1의 데이터 계약과 운영 기반이 안정된 뒤 각각 별도 요구사항과
결정 문서를 만든다.

- 지도·주소 정규화·실제 이동시간 provider 연동과 자기 기입 이동 부담의 우선순위
- 사용자 계정, 방 목록, 계정 기반 복구와 권한 모델 확장(현재 익명 개인 접근 복구는 구현됨)
- 이메일·푸시 알림 및 계산 완료 이벤트
- WebSocket/SSE 기반 실시간 상태 반영
- 식사 외 카페·운동·여행·행사 모임 유형과 유형별 Solver 정책
- 자연어 조건 입력 보조. 자연어 해석은 Server에서 구조화하고 최종 점수는 규칙
  기반 Solver가 계산한다.

## 작업 순서의 기준

1. 최소 배포 구성을 격리 환경에서 검증하고 HTTPS·backup·rollback 결정을 마무리한다.
2. 남용 방지와 실제 사용자 검증을 진행한다.
3. 데이터 lifecycle과 운영 관측을 정책·테스트와 함께 구현한다.
4. 확장 기능은 별도 요구사항과 결정 문서를 만든 뒤 진행한다.

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
