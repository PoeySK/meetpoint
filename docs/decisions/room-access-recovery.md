# 익명 참가자의 방 접근 복구

## 자격 증명과 수명

접근 토큰은 기존처럼 24시간 유효하며 방별 sessionStorage에 저장한다. 별도로
서버가 32바이트 난수 개인 복구 코드를 발급하고, 용도를 구분한 SHA-256 해시와
만료 시각만 저장한다. 개인 코드는 **발급 후 30일 고정 만료**하며 복구로 수명을
연장하지 않는다. Room 데이터는 자동 만료·삭제되지 않는다. 데이터 보존·삭제
정책은 복구 코드의 수명과 별개의 미결정 사항이다.

방 코드, 표시 이름, participantId, 기록한 방 주소는 본인 확인 수단이 아니다.
유효한 접근 토큰 또는 개인 복구 정보가 전혀 없으면 기존 권한 복구는 불가능하다.

## 보관과 배포

- 기본은 API origin의 방별 HttpOnly / SameSite=Strict / host-only 지속 쿠키다.
  path는 `/api/v1/rooms/{roomId}/recovery`, expires는 고정 만료 시각이다.
  NODE_ENV=production에서 Secure를 사용한다. 운영은 HTTPS와 같은 site의
  Client/API(예: app.example.com/api.example.com)를 전제로 한다. 로컬은
  localhost의 다른 포트를 사용한다. localhost와 127.0.0.1을 혼용하지 않는다.
- 기존 CLIENT_ORIGIN 허용 목록과 CORS credentials를 사용한다. Client fetch는
  credentials=include를 사용한다. 복구·등록 요청에 Origin이 있으면 허용 목록을
  검증한다. 쿠키 인증 복구는 허용 Origin을 필수로 요구하여 CSRF를 막는다.
  서로 다른 site 배포를 위해 SameSite=None이나 제3자 쿠키에 의존하지 않는다.
- 쿠키는 JS에서 읽을 수 없다. 쿠키 삭제·다른 기기에 대비해 개인 복구 파일을
  다운로드할 수 있다. 원문은 발급 응답 및 현재 탭의 sessionStorage에만 보관한다.
  탭 종료 후 서버에서 원문을 다시 읽을 수 없다. 파일은 사용자가 안전하게
  보관하고, 초대 코드/링크와 함께 공유하지 않는다. 코드가 들어간 복구 URL은 만들지 않는다.
- localStorage에는 재방문 링크용 방 코드→방 ID만 저장한다. 자격 증명을 넣지 않는다.
  이 링크는 주소만 알려주며, 서버가 쿠키/개인 코드로 다시 인증해야 접근 가능하다.
- 장기 localStorage 자격 증명은 XSS 노출 때문에 선택하지 않았다. 수동 코드만
  쓰면 브라우저 정책에 덜 의존하지만 보관·입력 부담이 있어 쿠키의 보완 수단으로
  선택했다. HttpOnly도 XSS가 인증된 요청을 실행하는 것을 막지는 못한다.

## 복구·재사용·폐기

- 생성/일반 입장은 접근 토큰과 개인 복구 코드를 응답하고 쿠키를 설정한다.
  같은 브라우저에서 같은 방에 새 MEMBER로 입장하면 방별 쿠키가 새 MEMBER의
  정보로 교체된다. HOST의 복구를 위해 일반 입장을 사용해서는 안 된다.
- 복구는 새 참가자 생성과 별개의 행동이다. 서버가 해당 방의 복구 해시로 기존
  활성 참가자를 찾아 접근 토큰만 교체한다. Client의 participantId/role을
  신뢰하지 않는다. 조건·응답·Room 상태·ScoreResult·Decision은 유지된다.
- 모든 Room 상태에서 활성 참가자의 복구를 허용한다. CALCULATED/CONFIRMED와
  CLOSED에서도 기존 조회가 가능하다. CLOSED는 예약 상태이며 닫기 API나 자동
  종결은 없다. 후보/응답/확정/재검토 등의 기존 권한·상태 제한을 그대로 적용한다.
- 개인 코드는 만료 전 재사용한다. Room row lock으로 복구·등록·leave/kick을
  직렬화하며 같은 트랜잭션에서 접근 토큰을 교체한다. 이전 토큰은 즉시 무효다.
  동시 복구는 모두 성공할 수 있으나 **마지막 커밋의 접근 토큰만 유효**하다.
  응답 도착 순서와 커밋 순서는 다를 수 있다. 다른 탭/기기의 복구는 현재 탭의
  토큰도 무효화할 수 있다. Client는 방 세션당 자동 복구를 한 번 시도하고
  중복 요청을 합치며, 인증 복구 실패 후 polling을 중단한다. 사용자가 누르는
  명시적 재시도는 한 번의 새 시도를 허용하며 자동 반복으로 이어지지 않는다.
- 응답 유실 시 같은 개인 코드로 다시 복구할 수 있다. 매번 회전하면 응답 유실로
  새 코드를 잃을 수 있어 자동 회전을 선택하지 않았다.
- 유효한 접근 토큰으로 개인 복구 파일을 명시적으로 재발급하면 새 30일 코드와
  쿠키를 만들고 이전 코드 및 다른 브라우저의 복구 쿠키를 서버에서 무효화한다.
  UI 확인을 거친다. 현재 접근 토큰은 유지한다. 분실/유출 대응은 재발급을 사용한다.
- leave/kick은 복구 해시·만료를 지우고 접근 토큰을 폐기한다. LEFT/REMOVED는
  활성화하지 않는다. 브라우저에 남은 쿠키/파일도 서버에서 거부한다.
- 원문/해시는 공개 Room·Participant 응답과 오류에 넣지 않는다. 발급/등록/복구
  성공 응답은 Cache-Control: no-store다. 거부는 정보 유무·만료·폐기·다른 방을
  구분하지 않는 RECOVERY_UNAVAILABLE로 통합한다.

## 기존 데이터와 완전 분실

Migration은 nullable recoveryHash/recoveryExpiresAt만 추가한다. 기존 참가자는
자동으로 코드를 받지 않는다. 유효한 접근 토큰이 있는 활성 참가자는 Room 진입 시
복구 수단을 등록한다. 기존 코드가 유효하면 자동 등록은 교체하지 않는다.
모든 자격 증명을 잃은 기존 HOST도 방 코드/이름만으로 복구하지 않는다.

쿠키가 없으면 보관한 방 주소에서 개인 코드를 입력한다. 모든 정보가 없거나
만료·폐기되면 원래 권한은 복구 불가다. MEMBER는 DRAFT/OPEN에 정원이 있을 때
새 참가자로 입장할 수 있으나 기존 조건·응답을 승계하지 않는다. HOST는 새 방
생성으로 안내한다. 복구 실패 때문에 기존 조건·응답·이력을 삭제하지 않는다.

## 검증 방법

- 서버 HTTP 테스트: 테스트 clock으로 만료, 모든 상태·권한, 조건·응답 보존,
  비활성/잘못된/다른 방/만료/폐기 코드, 재사용·동시 복구·rollback,
  기존 데이터 등록·재발급, 쿠키·Origin·민감 정보 미노출 검증.
- PostgreSQL: 결과·Decision 이력 보존, 실제 row lock 동시 요청, UPDATE 이후
  실패 rollback. 결과는 fixture로 넣어 Solver 없이 복구 자체를 검증한다.
- RUN_CALCULATION_E2E=true 실행에서는 실제 Rust 계산 후 CALCULATED HOST 복구와
  CONFIRMED MEMBER 복구, 조건·응답·결과·Decision 보존 및 복구 후 확정·재검토를 검증한다.
  계산 시작 응답은 현행 outbox 계약인 REQUESTED이고 polling은 REQUESTED/RUNNING 동안 대기한다.
- `cd services/server; node test/run-isolated-e2e.cjs`: 임시 DB 생성, 모든 migration,
  `pnpm test:e2e --runInBand`, 임시 DB 제거. 기존 DB를 migration하거나 삭제하지 않는다.
  기존 RUN_CALCULATION_E2E=true는 Solver 실행 환경이 있을 때 사용한다.
- `cd client; node test/room-recovery.test.cjs`: 새로고침·탭 재접속·만료 복구,
  동시/실패 재시도 제한, SSR, 실패 안내 렌더링, credentials 전송 검증.
  실제 브라우저 Secure/SameSite 동작은 같은 site HTTPS 배포에서 확인해야 한다.
