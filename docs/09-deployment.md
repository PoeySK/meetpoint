# 최소 배포와 운영 절차

## 범위와 전제

전체 서비스는 `infra/docker-compose.deploy.yml`로 실행한다. 기존 PostgreSQL 전용 개발 Compose, 개발 DB·환경 파일·프로세스는 그대로 둔다. 이 구성은 단일 호스트의 최소 구성이며 HA를 제공하지 않는다. Client/Server/Solver 이미지는 non-root로 실행한다. DB와 Solver는 internal network에서만 접근하며 호스트 포트를 공개하지 않는다. Client/Server는 호스트 loopback에만 바인딩한다.

호스팅 업체, 도메인, HTTPS 인증서/프록시 운영 주체, secret 주입 방법, backup 저장소·보존 기간·RPO/RTO는 배포 전에 결정해야 한다. 임의의 외부 계정이나 업체 설정은 포함하지 않는다.

## 설정 → DB → migration → 기동

아래는 저장소 루트에서 Bash로 실행하는 예다. 운영자는 실제 secret을 보호된 외부 파일/환경으로 주입한다. 예시 파일의 비밀번호는 실제 배포에 사용하지 않는다. `infra/.env.example`은 이름과 안전한 예시만 제공하며, 기존 `.env`를 덮어쓰지 않는다.

```bash
# 새로운 파일에서 설정한다. 파일 권한을 운영자만 읽을 수 있게 제한한다.
cp infra/.env.example /secure/meetpoint-release.env
chmod 600 /secure/meetpoint-release.env
# 편집 후: 실제 secret, 공개 HTTPS origin, 고유 RELEASE_TAG, 빈 loopback 포트 지정
export DEPLOY_ENV=/secure/meetpoint-release.env
export DEPLOY_PROJECT=meetpoint-production
dc() { docker compose --env-file "$DEPLOY_ENV" -f infra/docker-compose.deploy.yml -p "$DEPLOY_PROJECT" "$@"; }
dc config --quiet
dc build client server solver
dc up -d --wait postgres
dc run --rm migrate
# migration 성공을 확인한 뒤에만 기동한다.
dc up -d --wait solver server client
dc ps
dc exec server node -e 'Promise.all([fetch("http://localhost:3001/live"),fetch("http://localhost:3001/ready")]).then(async rs=>{for(const r of rs){if(!r.ok)process.exit(1);console.log(await r.json())}}).catch(()=>process.exit(1))'
dc exec solver curl --fail --silent http://localhost:4000/health
```

`migrate`는 tools profile의 일회성 명령이다. 일반 `up`은 migration을 실행하지 않는다. 빌드한 Server image의 compiled DataSource를 사용하며 `synchronize=false`, `migrationsRun=false`를 유지한다. DB health → 명시적 migration → Solver health → Server live/ready → Client 순서다. `/ready`는 DB `SELECT 1`만 확인하므로 migration 성공 기록을 별도로 확인한다. Solver readiness는 `/health`로 따로 확인한다. `/live`는 DB 장애에도 200이어야 한다. Compose의 healthcheck는 컨테이너 재시작 정책이나 트래픽 차단을 대신하지 않는다.

DB 식별자에는 영문·숫자·밑줄을, 이 Compose의 비밀번호에는 충분히 긴 URL-safe 임의 문자열을 사용한다. `DATABASE_URL`은 내부 `postgres:5432`, `SOLVER_BASE_URL`은 `http://solver:4000`이다. DB password를 URL에 포함하므로 예약 문자가 있는 비밀번호는 이 템플릿에 그대로 넣지 않는다. secret 포함 `compose config` 출력·로그 공유를 피하고 `--quiet`를 쓴다.

Server production은 `DATABASE_URL`, `SOLVER_BASE_URL`, 단일 HTTPS `CLIENT_ORIGIN`을 필수로 검증한다. 명시한 port·timeout·job poll/lease/retry/max attempts가 양의 정수 범위를 벗어나면 시작을 거부하며 값 원문은 출력하지 않는다. 로컬 미설정 기본값은 유지한다. Solver는 포트를 u16으로 파싱하며 잘못된 값은 시작 실패한다. 배포 Compose에서는 4000으로 고정한다.

`NEXT_PUBLIC_API_BASE_URL`은 브라우저에서 접근할 **공개 HTTPS API origin**이며 Client build에서 검증·고정된다. Docker DNS를 넣지 않는다. 공개 주소 변경 시 Client image를 다시 빌드한다. `RELEASE_TAG`는 세 이미지의 버전 표식이다. 운영에서는 변경 불가능한 태그/이미지 digest를 기록하고 동일 태그를 덮어쓰지 않는다.

## HTTPS와 복구 쿠키

### rate limit과 신뢰 프록시

Server는 기본적으로 forwarding header를 신뢰하지 않는다. `TRUSTED_PROXY_IPS`는 비워 두거나 **직접 TCP 연결하는 proxy의 실제 IPv4/IPv6 주소만** 쉼표로 명시한다. `true`, wildcard, 전체 subnet/CIDR, hop 수, hostname은 허용하지 않으며 잘못된 값은 시작 실패한다. 신뢰 목록에 있는 바로 첫 hop만 허용하고 더 먼 chain은 신뢰하지 않는다. IP 표현은 IPv4-mapped IPv6 및 IPv6 축약을 정규화한다.

Docker의 published loopback port로 호스트 proxy가 연결하면 Server가 보는 TCP peer는 loopback이 아니라 Docker bridge gateway일 수 있다. 해당 배포 network의 실제 연결 주소를 확인해 정확한 주소를 설정한다. network 재생성으로 주소가 바뀌면 설정과 위조 테스트를 다시 확인한다. 임의의 private subnet 전체를 신뢰하지 않는다. 빈 설정은 안전한 기본값이지만 proxy 뒤에서는 모든 사용자가 proxy IP quota를 공유하므로 실제 외부 공개 전 반드시 올바른 설정을 확인한다.

프록시는 외부에서 받은 X-Forwarded-For를 그대로 전달하지 않고 실제 직접 연결한 client 주소로 **덮어쓴다**. 예를 들어 기존 Nginx API proxy의 location 안에서는 다음 설정을 적용한다(업체/TLS 설정 선택과 무관한 forwarding 예시).

```nginx
proxy_pass http://127.0.0.1:13001;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

Server published port는 계속 loopback에만 열어 proxy를 우회한 외부 접근을 막는다. 추가 CDN/proxy가 앞에 생기면 이 신뢰 모델을 먼저 재설계한다. 사용자 입력 header나 hop 개수만으로 실제 IP를 판정하지 않는다. 429의 Retry-After·Cache-Control·오류 본문을 proxy가 유지하도록 하고 cache하지 않는다. CORS는 Retry-After를 expose하므로 공개 API origin이 다른 Client도 대기 시간을 읽는다.

정책은 [API 계약](04-api-contract.md)을 따른다. 메모리 제한은 **한 Node 프로세스** 기준이다. 재시작·새 release 기동 시 quota가 초기화되고 cluster/여러 replica는 횟수를 공유하지 않는다. 단일 호스트라도 worker가 여러 개면 이 한계가 적용된다. 최대 10,000개의 HMAC bucket과 만료 정리로 메모리를 제한하며 포화 시 새 identity를 429로 거부한다. IP/token/복구 코드/입력 원문을 로그나 key 출력에 기록하지 않는다. 정상 5초 polling은 제외하며 일반 조회 보호나 네트워크 DDoS 방어를 대신하지 않는다.

예: 웹 `https://meet.example.com`, API `https://api.meet.example.com`. 두 주소는 HTTPS와 동일한 registrable domain을 사용해 같은 site여야 한다. 다른 site에서는 `SameSite=Strict` 쿠키가 전달되지 않는다. API CORS `CLIENT_ORIGIN`은 정확한 웹 origin이며 wildcard는 사용하지 않는다. Client는 credentials를 포함하고 복구 API는 Origin을 검증한다.

호스트 reverse proxy는 웹 요청을 `127.0.0.1:10081`, API 요청을 `127.0.0.1:13001`로 전달한다(설정한 bind port에 맞춘다). API `/api/v1` 경로와 Origin, Cookie/Set-Cookie를 보존하고 인증 응답을 cache하지 않는다. TLS는 프록시에서 종료하되 외부 HTTP는 HTTPS로 redirect한다. 쿠키는 API 호스트의 HttpOnly, Secure, SameSite=Strict, room별 recovery path로 발급된다. `NODE_ENV=production`은 내부 HTTP 프록시 구간과 관계없이 Secure를 설정한다. 프록시를 다른 컨테이너로 실행한다면 loopback 대신 edge network 연결 설계가 필요하다. 이 문서는 호스트 프록시를 전제로 한다.

실제 HTTPS에서 생성·입장 뒤 쿠키 속성, 새 탭/새로고침 복구, 만료 token 복구, 별도 브라우저의 복구 파일, 잘못된 origin 거부를 확인한다. 자동 HTTP localhost 테스트는 이 검증을 대신하지 않는다.

## backup과 복원

업그레이드 전에 쓰기 트래픽을 중지하고 Server worker를 멈춰 진행 중 transaction이 끝났는지 확인한다. PostgreSQL volume 파일을 실행 중 직접 복사하지 않는다. 암호화·접근 제한·호스트 외부 저장과 보존 정책을 정하고 주기적으로 별도 DB에서 복원 연습한다. dump에는 개인 입력과 credential hash가 포함된다.

```bash
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/meetpoint-backup.dump'
dc cp postgres:/tmp/meetpoint-backup.dump /secure/meetpoint-backup.dump
dc exec -T postgres rm /tmp/meetpoint-backup.dump
```

PowerShell에서 binary redirect를 쓰지 않고 `docker compose cp`로 복사한다. backup 시간, application image digest/tag, migration 목록을 함께 보관하고 checksum을 확인한다.

복원은 **새 project의 빈 DB/volume**을 준비한 뒤 수행한다. 기존 개발/운영 DB를 덮어쓰지 않는다. 대상 project/env가 새 자원인지 확인하고 `dc`의 대상도 변경한다. 원본 dump를 안전하게 보관한다.

```bash
dc up -d --wait postgres
dc cp /secure/meetpoint-backup.dump postgres:/tmp/meetpoint-backup.dump
dc exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/meetpoint-backup.dump'
dc exec -T postgres rm /tmp/meetpoint-backup.dump
```

복원 시 dump의 migration table도 복원된다. 해당 schema와 호환되는 image로 검증하고 필요한 forward migration만 명시적으로 실행한다. 전체 사용자 흐름을 확인한 뒤 트래픽 전환한다. backup 이후 쓰기 손실과 outbox 재실행 가능성을 판단해 운영자가 전환을 결정한다.

## application rollback

업데이트 전 이전 image digest/tag와 설정, migration 목록, backup을 기록한다. migration은 먼저 staging 복원 DB에서 호환성을 확인하고 실행한다. 실패하면 쓰기 트래픽을 막고 Server를 중지하며 부분 적용 여부와 transaction 결과를 확인한다.

이전 application이 현재 schema·저장 payload·계산 정책과 호환되면 이전 `RELEASE_TAG`/digest를 선택해 `dc up -d --no-build --wait solver server client`로 교체한다. 이전 Client의 빌드 시 API 주소도 확인한다. migration을 무조건 revert하지 않는다. 호환되지 않으면 forward fix 또는 새 DB로 backup 복원 후 트래픽 전환을 선택한다. rollback 후 live/ready/Solver health와 핵심 흐름을 다시 확인한다. migration의 down은 삭제·정보 손실을 검토한 별도 승인 작업이다.

## 격리 검증과 정리

검증용 project는 `meetpoint-deploy-test-<고유ID>`, DB는 `meetpoint_deploy_test_<고유ID>`, release tag도 고유하게 지정하고 비어 있는 loopback port를 사용한다. 예시 env에서 만든 **새 임시 파일**에만 test credential을 넣는다. 개발 `.env`·DB·실행 중 서비스를 재사용하지 않는다. 위 설정/build/migration/readiness 순서로 확인한다.

`node infra/test-deployment.cjs`는 이 과정을 자동화한다. Docker Engine 접근 권한이 필요하며 frozen image build, compiled migration, live/ready, Client HTTP, API 생성·입장·조건·응답·실제 Solver 계산·확정·개인 복구와 production 쿠키 속성을 확인한다. custom dump를 별도 소유 DB에 복원해 Room 보존도 확인한다. 성공·실패 후 소유 project/volume/image와 임시 설정을 정리하며 민감한 응답·원본 로그는 출력하지 않는다. 실제 HTTPS 브라우저 쿠키 전송 검증은 별도다.

HTTPS 테스트 도메인/인증서를 가진 소유 프록시가 준비되면 별도 브라우저에서 생성 → 입장 → 조건 → 후보별 응답 → 계산 완료 → 확정 → 접근 복구를 실행한다. 기존 `pnpm --dir client test:e2e`는 자체 소유 DB·호스트 프로세스로 테스트하며 배포 이미지 E2E 결과로 간주하지 않는다.

성공·실패 후 대상 project와 volume label을 확인하고 해당 **임시 project에만** `dc down --volumes --remove-orphans`를 실행한다. 운영 project에는 volume 삭제 명령을 사용하지 않는다. 고유 테스트 image와 임시 env/backup도 자신의 산출물만 제거한다. build cache나 기존 image를 전역 prune하지 않는다.

남은 작업과 완료 기준은 [현재 작업 계획](07-implementation-plan.md)에 기록한다. rate limit은 Server 프로세스 안에서 실행하며 별도 인프라가 없다. 삭제 배치, 관측 시스템, 외부 provider는 이 구성에 추가하지 않는다.

## Rate limit 검증 기록 (2026-10-08)

- Server: `pnpm lint:check`, `pnpm test --runInBand` 14 suites/167개, 운영 코드 typecheck, `pnpm build` 통과. 격리 PostgreSQL·실제 Solver의 `pnpm test:integration` 4 suites/19개에서 429 요청의 DB 변경 및 계산 job 미생성을 확인했다.
- Client: `pnpm test` 32개, `pnpm lint`, `pnpm typecheck`, `pnpm build` 통과. `pnpm test:e2e` 격리 Chromium 3개에서 실제 제한, 대기 안내, polling 후 초안 보존, 자동 복구 미실행을 확인했다.
- Compose `config --quiet`, 세 image build와 `node infra/test-deployment.cjs` 통과. 명시적 migration, readiness, 핵심 흐름, dump/restore에 더해 production 429와 조회 유지도 확인했다. 모든 실행은 소유 임시 자원을 사용하고 정리했다.
- Server 전체 `tsc --noEmit`은 기존 테스트 타입 오류로 실패했다. 운영 코드 typecheck와 Jest는 통과했다. 실제 HTTPS·호스트 프록시의 IP 전달 및 원격 CI는 실행하지 않았으며 실제 배포도 수행하지 않았다.

## 이 변경의 검증 기록 (2026-10-06)

- Client: `pnpm test` 29개, `pnpm lint`, `pnpm typecheck`, `pnpm build` 통과. sandbox에서 build의 child process가 EPERM으로 실패한 뒤 동일 명령을 권한 조정하여 통과했다.
- Server: `pnpm lint:check`, `pnpm test --runInBand`, `pnpm build`, `node node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit` 통과. 별도 PostgreSQL/실제 Solver에서 `pnpm test:integration`이 기존 `test:e2e` 18개를 실행해 통과했다.
- Solver: `cargo fmt --check`, `cargo check --locked`, `cargo test --locked` 17개 통과.
- `pnpm --dir client test:e2e`: 격리 Chromium 2개 시나리오 통과 및 소유 자원 정리.
- Compose `config --quiet`, 세 image build와 `node infra/test-deployment.cjs`: migration, readiness, 주요 API 흐름, Secure/Strict/HttpOnly 속성, 별도 DB dump/restore 통과 및 소유 자원 정리.
- Server 전체 `tsc --noEmit`은 기존 테스트의 generic mock·enum narrowing·possibly undefined 등의 타입 오류로 실패했다. 변경하지 않은 테스트는 이번 범위에서 수정하지 않았다. 운영 코드 typecheck와 Jest는 통과했다.
- 실제 HTTPS 브라우저/CORS/프록시, 이전 release로 rollback 및 원격 GitHub Actions 실행은 검증하지 않았다. 선택한 실제 환경과 이전 image가 필요하다. 이번에는 실제 배포·git 변경을 실행하지 않았다.
