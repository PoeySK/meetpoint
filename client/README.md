# MeetPoint Client

Next.js 기반 프론트엔드 프로젝트입니다.

## 실행 방법

```bash
pnpm install
pnpm dev
```

브라우저에서 http://localhost:10081 으로 접속합니다.

## 검증

Node 24.12.0, pnpm 11.21.0을 사용합니다. 저장소 루트 [README](../README.md#자동-검증)에 전체 서비스와 CI 실행 방법이 있습니다.

```bash
pnpm install --frozen-lockfile
pnpm test          # 기존 의견 입력 16개 + 접근 복구 13개 (Node 직접 실행)
pnpm lint
pnpm typecheck
pnpm build
```

실제 Chromium E2E에는 Docker Compose v2, Rust 1.95.0, Server 의존성도 필요합니다.

```bash
pnpm --dir ../services/server install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux에서는 브라우저 시스템 라이브러리 설치를 위해 `pnpm exec playwright install --with-deps chromium`을 사용합니다.

`test:e2e`는 개발 앱을 재사용하지 않습니다. 자유 포트와 고유 Compose project를 할당하고, 메모리 기반 PostgreSQL의 임시 DB에 실제 migration을 적용합니다. 실제 Solver와 Server를 빌드·실행하고, `.env`와 `node_modules`를 제외한 Client 소스를 임시 디렉터리에 복사해 production build를 만듭니다. 의존성만 원래 `node_modules`에 연결합니다. 이 복사본은 Windows/Linux 의존성 링크 호환성을 위해 Webpack으로 빌드합니다. 일반 `pnpm build`의 Turbopack 검증은 별도로 유지합니다. 개발 `.next`, `.env`, DB 데이터와 서비스 프로세스를 변경하지 않습니다. Server는 개발 환경 파일을 읽지 않는 임시 디렉터리에서 테스트 변수를 주입받아 실행합니다.

DB·Solver·Server·Client readiness 이후 한 worker, 재시도 0회로 테스트합니다. 정상 종료·실패·SIGINT/SIGTERM·20분 제한에서 소유 프로세스·임시 DB·컨테이너·Client 복사본을 정리합니다. 강제 OS 종료/정전으로 정리가 불가능하면 `meetpoint-browser-test-<실행 ID>` project만 확인해 `docker compose -f ../infra/docker-compose.test.yml -p <해당 project> down --volumes --remove-orphans`으로 정리하세요. 개발 project `meetpoint`를 정리 대상으로 쓰지 마세요.

검증 시나리오:

- HOST와 MEMBER 두 명의 독립 context에서 생성·초대 입장·두 미래 후보·개인 조건 저장.
- 시간 기반 가능/보류 초안·이유·예산/필수/회피 경고, 미제출·API 미호출, 수동 선택 보존, 이동 부담 검증, 명시적 저장과 새로고침.
- 빠른 의견 저장, 실제 Solver 결과·coverage·근거·충돌 표시, HOST 전용 UI, 확정·재검토·후보 수정·STALE·재계산·재확정. 후보 수정은 기존 응답을 유지하는 현재 계약을 검증합니다.
- CALCULATED HOST와 CONFIRMED MEMBER의 탭 종료 후 실제 HttpOnly 쿠키 복구, 임시 참가자만 만료시킨 HOST 토큰 복구, 별도 context의 개인 파일 복구·잘못된 코드 거부. 권한·참가자 수·조건·응답·결과·Decision 이력을 전후 비교합니다.
- 모든 context의 pageerror와 예상한 401/403 리소스 오류를 제외한 console error 검사.

진단 자료는 `test-results/safe-summary.json`의 시나리오명·상태·시간·실패 코드 줄 번호뿐입니다. 해당 줄의 locator/기대값과 기존 Node/API 테스트를 확인한 뒤 `pnpm test:e2e`를 다시 실행하세요. 토큰을 포함할 수 있는 원본 오류·DOM·service 로그·trace/HAR·영상·storageState는 출력하거나 CI에 올리지 않습니다. 자동 스크린샷도 끕니다. Playwright의 임시 출력과 개인 파일 다운로드는 정리하며 복구 원문은 테스트 메모리에서만 사용합니다.

현재 Chromium 데스크톱과 localhost HTTP의 개발 쿠키(SameSite=Strict, HttpOnly, Secure=false)를 검증합니다. HTTPS production Secure 쿠키, 실제 배포의 CORS/프록시, 모바일·Firefox·WebKit은 별도 검증 범위입니다. 접근 복구 정책이나 점수 정책을 변경하지 않습니다.
