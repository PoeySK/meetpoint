# MeetPoint 첫 배포 · Oracle Always Free

Windows PC에서 파일을 보내고, Oracle의 Ubuntu ARM64 서버 한 대에서 Docker Compose를 실행합니다. 지인에게는 Tailscale Funnel이 만든 `https://…ts.net` 주소 하나만 보내면 됩니다. 방문자는 Tailscale 가입이나 앱 설치 없이 접속할 수 있습니다. [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)

```text
브라우저 → 공개 HTTPS(Funnel) → VM의 127.0.0.1:10081 → NGINX → Next.js
                                                              ↓ /api/v1 요청
                                                      비공개 NestJS
                                                       ↙          ↘
                                               PostgreSQL       Rust Solver
```

브라우저의 `/api/v1` 요청은 같은 웹 주소로 들어옵니다. Next.js가 Docker 내부에서 NestJS로 전달합니다. NestJS, Solver, PostgreSQL은 외부 주소와 호스트 포트가 없습니다. SSH는 본인 IP로 제한해서 VM 관리에 사용합니다. NestJS의 계산 작업 확인 주기와 브라우저의 상태 확인 방식은 그대로입니다.

## 1. 0원으로 사용할 조건 확인

- Oracle 계정을 **Free Tier에 유지**하고 **Upgrade to paid**를 선택하지 않습니다. 가입 시 결제 수단 확인이나 소액 승인 보류가 표시될 수 있습니다. 리소스 생성 시 `Always Free Eligible`을 확인하고 체험 크레딧으로만 생성할 수 있는 항목은 선택하지 않습니다. [Oracle Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- 홈 리전에서 `VM.Standard.A1.Flex` **1 OCPU, 6 GB RAM, 50 GB 부팅 볼륨** 한 대를 사용합니다. 31일 내내 실행하면 744 OCPU-시간과 4,464 GB-시간입니다. Oracle의 월 무료량은 계정 전체 기준 1,500 OCPU-시간, 9,000 GB-시간이며 홈 리전 블록·부팅 볼륨 무료량은 합계 200 GB입니다. 기존 자원이 있다면 합산합니다. A1을 쓰려면 홈 리전으로 춘천을 피합니다. [Oracle Always Free 제공량과 A1 리전 제한](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- Oracle은 월 아웃바운드 전송 처음 10 TB를 무료로 제공합니다. Tailscale은 **Personal**을 선택합니다. Funnel도 무료 플랜에서 사용할 수 있지만 베타이며 별도 대역폭 제한이 있습니다. 별도 도메인, 인증서, 로드 밸런서, 관리형 DB는 구입할 필요가 없습니다. [Oracle 무료 네트워크 전송](https://www.oracle.com/cloud/free/) · [Tailscale 요금제](https://tailscale.com/pricing) · [Funnel 제한](https://tailscale.com/docs/features/tailscale-funnel#limitations)
- `Out of host capacity`가 나오면 홈 리전의 다른 가용 도메인을 시도하거나 나중에 다시 시도합니다. Oracle은 7일 동안 유휴 기준에 해당한 무료 VM을 회수할 수 있습니다. 링크가 끊길 수 있으므로 8단계에서 DB를 PC에 백업합니다. [Oracle 용량 및 유휴 VM 정책](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## 2. Oracle에서 VM 만들기

Windows PowerShell에서 SSH 키를 만듭니다. 해당 경로에 기존 키가 있다는 메시지가 나오면 덮어쓰지 말고 기존 키를 사용하거나 새 이름을 고릅니다. `.pub`는 공개 키이고 확장자 없는 파일은 본인 PC에 보관하는 개인 키입니다.

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\meetpoint_oci"
Get-Content "$env:USERPROFILE\.ssh\meetpoint_oci.pub"
```

1. Oracle Console의 **Compute → Instances → Create instance**를 엽니다. 이름은 `meetpoint`, 이미지는 **Canonical Ubuntu 24.04 ARM64/aarch64**를 고릅니다.
2. **Change shape**에서 Ampere **VM.Standard.A1.Flex**를 선택합니다. 1 OCPU, 6 GB로 지정하고 `Always Free Eligible` 표시를 확인합니다.
3. **Networking**에서 인터넷 게이트웨이로 나가는 공용 서브넷과 **자동 할당 공인 IPv4**를 선택합니다. 기본 VCN 만들기를 선택했다면 생성 뒤 연결된 서브넷의 보안 목록을 확인합니다. Ubuntu에 Docker와 Tailscale을 설치하려면 인터넷으로 나가는 연결이 필요합니다.
4. **Add SSH keys**에는 PowerShell에서 확인한 `.pub` 한 줄을 붙여넣습니다. Boot volume이 기본 50 GB로 표시되면 기본값을 사용하고 자동 백업 정책은 선택하지 않습니다. 설정 요약을 확인하고 **Create**를 누릅니다. [Oracle 인스턴스 생성 문서](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm)
5. VM 상태가 `Running`이 되면 공인 IPv4를 기록합니다. 서브넷의 **Security Lists**와 VNIC에 연결된 **Network Security Groups**에서 인바운드 규칙을 확인합니다. SSH는 `TCP` 목적지 `22`, 출발지 `내 PC의 공인 IPv4/32`만 허용합니다. 기본 `0.0.0.0/0 → 22`가 있으면 해당 규칙의 출발지를 바꿉니다. `80`, `443`, `10081`, `13001`, `3001`, `4000`, `5432`의 인바운드 허용 규칙은 추가하지 않습니다. HTTPS는 Funnel이 받아 VM으로 전달합니다. 집의 공인 IP가 바뀌면 Oracle Console에서 SSH 출발지를 먼저 갱신합니다. [Oracle 가상 네트워크 보안 규칙](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)

Windows PowerShell에서 `OCI_PUBLIC_IP`에 실제 값만 넣고 접속합니다.

```powershell
$vm = 'OCI_PUBLIC_IP'
$key = "$env:USERPROFILE\.ssh\meetpoint_oci"
ssh -i $key "ubuntu@$vm"
```

## 3. Ubuntu에 Docker와 Tailscale 설치

이 단계의 명령은 SSH로 연결된 Ubuntu 터미널에서 실행합니다. `uname -m` 출력은 `aarch64`여야 합니다. Docker 공식 저장소에서 현재 엔진과 Compose 플러그인을 설치합니다. 게시 포트의 루프백 격리를 위해 최소 Docker Engine 28 이상을 사용합니다. [Docker Ubuntu 설치](https://docs.docker.com/engine/install/ubuntu/) · [Docker 루프백 포트 공개 규칙](https://docs.docker.com/engine/network/port-publishing/)

```bash
uname -m
sudo apt-get update
sudo apt-get install -y ca-certificates curl unzip openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version --format '{{.Server.Version}}'
sudo docker compose version
```

Tailscale을 설치하고 로그인합니다. `tailscale up`이 URL을 출력하면 PC 브라우저에서 그 URL을 열어 본인 Tailscale Personal 계정으로 승인합니다. [Tailscale Linux 설치](https://tailscale.com/docs/install/linux)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Tailscale Admin Console의 **DNS**에서 MagicDNS와 HTTPS Certificates를 켭니다. 아래 명령이 브라우저 승인 URL을 출력하면 열어서 Funnel을 허용하고 명령을 다시 실행합니다. `status`에 표시되는 `.ts.net` 이름 뒤에 `https://`를 붙인 주소를 기록합니다. `tcp://…:443`이라고 표시되어도 브라우저에는 `https://…ts.net`으로 입력합니다. 앱을 아직 실행하지 않았으므로 이때 브라우저 접속은 실패할 수 있습니다. [Funnel 설정 조건](https://tailscale.com/docs/features/tailscale-funnel) · [TLS 종료 및 PROXY protocol 옵션](https://tailscale.com/docs/reference/tailscale-cli/funnel)

```bash
sudo tailscale funnel --bg --tls-terminated-tcp=443 --proxy-protocol=2 tcp://127.0.0.1:10081
sudo tailscale funnel status
```

`--bg` 설정은 서버 재부팅 뒤에도 적용됩니다. Tailscale 관리 화면의 **Machines**에서 VM의 키 만료 예정일을 확인합니다. 만료되면 재인증할 때까지 공개 링크가 끊길 수 있습니다. [Funnel 재시작 동작](https://tailscale.com/docs/reference/tailscale-cli/funnel#effects-of-rebooting-and-restarting) · [Tailscale 장치 키 만료](https://tailscale.com/docs/features/access-control/key-expiry)

## 4. 앱 소스 보내기

**Windows PowerShell**의 MeetPoint 저장소 루트에서 실행합니다. `REVIEWED_COMMIT_SHA`를 PR에서 검토를 마친 배포 대상 커밋의 SHA로 바꿉니다. 커밋이 PC에 아직 없으면 `git fetch origin`으로 가져옵니다. 지정한 커밋에 들어 있는 `client`, `services`, `infra`만 ZIP으로 보냅니다. PC의 실제 운영 환경 파일, 개인 키와 데이터 덤프는 Git 밖에 보관합니다.

```powershell
$vm = 'OCI_PUBLIC_IP'
$key = "$env:USERPROFILE\.ssh\meetpoint_oci"
$commit = 'REVIEWED_COMMIT_SHA'
$archive = Join-Path $env:TEMP "meetpoint-$([guid]::NewGuid()).zip"
git archive --format=zip --output $archive $commit -- client services infra
if ($LASTEXITCODE -ne 0) { throw '배포 ZIP 생성에 실패했습니다. 커밋 SHA를 확인해 주세요.' }
scp -i $key $archive "ubuntu@${vm}:meetpoint-release.zip"
```

**Ubuntu SSH 터미널**로 돌아와 압축을 풉니다.

```bash
mkdir -p "$HOME/meetpoint"
unzip -q "$HOME/meetpoint-release.zip" -d "$HOME/meetpoint"
cd "$HOME/meetpoint"
test -f infra/docker-compose.oracle.yml && test -f infra/nginx.oracle.conf && echo 'Oracle 설정 확인 완료'
```

## 5. 운영 환경 파일 만들고 실행

**Ubuntu SSH 터미널**에서 첫 번째 줄의 예시 주소를 3단계에서 확인한 실제 주소로 바꿉니다. 끝의 `/`는 빼고 주소만 넣습니다. 아래 블록은 **최초 배포에서 한 번만** 실행합니다. DB 비밀번호와 내부 API 전달 키는 서로 다른 난수로 만들어 파일에만 저장합니다. 기존 환경 파일이 있으면 블록을 중단하고 그 파일을 계속 사용합니다.

```bash
public_origin='https://meetpoint.example-tailnet.ts.net'
mkdir -p -m 700 "$HOME/.config/meetpoint"
release_env="$HOME/.config/meetpoint/release.env"
(
  umask 077
  set -o noclobber
  cat > "$release_env" <<EOF
POSTGRES_DB=meetpoint
POSTGRES_USER=meetpoint
POSTGRES_PASSWORD=$(openssl rand -hex 32)
CLIENT_ORIGIN=$public_origin
NEXT_PUBLIC_API_BASE_URL=/
API_PROXY_SHARED_SECRET=$(openssl rand -hex 32)
RELEASE_TAG=first
EOF
)
```

같은 Ubuntu 터미널에서 `dc`라는 단축 명령을 등록합니다. SSH를 새로 열었을 때는 함수 정의 부분을 다시 실행하면 됩니다. 두 Compose 파일을 순서대로 사용해야 호스트 포트가 올바르게 제한됩니다.

```bash
cd "$HOME/meetpoint"
dc() {
  sudo docker compose --env-file "$HOME/.config/meetpoint/release.env" \
    -f infra/docker-compose.deploy.yml -f infra/docker-compose.oracle.yml \
    -p meetpoint-production "$@"
}

dc config --quiet &&
dc build client server solver &&
dc up -d --wait postgres &&
dc run --rm migrate &&
dc up -d --wait solver server client ingress &&
dc ps
```

첫 빌드는 작은 ARM VM에서 시간이 걸릴 수 있습니다. 이 명령은 앞 단계가 성공한 경우에만 다음 단계를 실행합니다. `dc ps`에서 `postgres`, `solver`, `server`, `client`는 `healthy`, `ingress`는 `Up`이면 됩니다. 호스트로 게시되는 포트는 `ingress`의 `127.0.0.1:10081->8080/tcp` 한 개입니다. 다른 컨테이너에 `3001/tcp`처럼 포트만 표시되는 건 이미지 내부 포트 표기입니다. `IP:포트->`가 있는 행이 호스트에 게시된 포트입니다.

## 6. PC와 휴대폰으로 공개 확인

1. **Windows PowerShell**에서 실제 `https://…ts.net` 주소로 바꿔 다음을 실행합니다. 첫 명령은 `200`, 빈 입력으로 모임 생성을 시도하는 두 번째 명령은 `400`이 정상입니다. `400`은 공개 HTTPS와 내부 API 왕복이 정상이며 입력 검증까지 도달했다는 뜻입니다.

   ```powershell
   $site = 'https://meetpoint.example-tailnet.ts.net'
   curl.exe -sS -o NUL -w '%{http_code}' "$site/"
   curl.exe -sS -o NUL -w '%{http_code}' -H "Origin: $site" -H 'Content-Type: application/json' --data '{}' "$site/api/v1/rooms"
   ```

2. PC에서 모임을 만들고 휴대폰에서는 Wi-Fi를 끈 채 LTE/5G에서 같은 HTTPS 링크를 엽니다. 공유 코드로 들어가서 **조건 입력 → 후보별 응답 저장 → PC에서 계산 시작 → 결과 완료 확인 → 확정** 순으로 확인합니다.
3. 두 기기에서 새로고침해 접속 상태가 복구되는지 확인합니다. PC 개발자 도구의 **Network → 모임 생성 요청 → Cookies**에서 복구 쿠키의 `Secure`, `HttpOnly`, `SameSite=Strict`도 확인합니다. 쿠키 값이나 복구 코드는 공유하지 않습니다.
4. `dc ps`와 Oracle의 인바운드 규칙을 마지막으로 재확인합니다. 공개 주소 `https://…ts.net`에는 웹과 그 웹이 쓰는 `/api/v1`만 도달합니다. NestJS·Solver·PostgreSQL에 접속하는 외부 호스트 포트는 없습니다.

## 7. 접속이나 계산이 안 될 때

- **휴대폰과 PC 모두 주소가 안 열림** · VM에서 `sudo tailscale funnel status`를 먼저 확인합니다. `.ts.net` 이름, `443`, TLS 종료, PROXY v2, `127.0.0.1:10081`이 맞아야 합니다. 인증서나 DNS 변경의 전파를 기다린 뒤 PC와 휴대폰에서 HTTPS로 재시도합니다.
- **502 또는 앱 화면 없이 오류** · VM에서 `dc ps`와 `dc logs --tail=80 ingress client server`를 확인합니다. `ingress`와 Next.js가 떠 있는지 확인합니다. VM에서 `curl http://127.0.0.1:10081/`을 하면 Funnel의 PROXY 헤더가 없어서 실패할 수 있습니다. 확인에는 공개 HTTPS 주소를 사용합니다.
- **페이지는 열리지만 생성·복구 실패** · `$HOME/.config/meetpoint/release.env`의 `CLIENT_ORIGIN`을 현재 주소와 대조합니다. 주소만 바꿨다면 `dc up -d --wait server client ingress`를 실행합니다. 화면과 API는 같은 출처를 사용하므로 웹 이미지를 다시 빌드할 필요는 없습니다.
- **계산이 오래 대기하거나 실패** · `dc ps`와 `dc logs --tail=80 server solver`를 확인합니다. 두 서비스 상태를 확인하고 기존 테스트 모임에서 한 번 다시 계산합니다. 로그를 공유할 때 키, 쿠키, 개인 입력은 제거합니다.

## 8. 백업과 공개 중지

DB 데이터는 Docker 볼륨에 남습니다. VM 회수·디스크 장애에 대비해 Ubuntu에서 덤프를 만든 뒤 PC의 접근 제한된 폴더로 내려받습니다. 백업에는 지인의 입력 데이터가 포함되므로 암호화된 저장소에 보관하고 공유 링크로 올리지 않습니다.

```bash
# Ubuntu
mkdir -p -m 700 "$HOME/meetpoint-backups"
umask 077
backup="$HOME/meetpoint-backups/meetpoint-$(date +%Y%m%d-%H%M%S).dump"
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup" && ls -lh "$backup"
```

```powershell
# Windows · FILENAME은 위에서 출력된 파일명으로 바꿉니다.
$vm = 'OCI_PUBLIC_IP'
$key = "$env:USERPROFILE\.ssh\meetpoint_oci"
$backupFolder = Join-Path $env:LOCALAPPDATA 'MeetPoint\Backups'
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
scp -i $key "ubuntu@${vm}:meetpoint-backups/FILENAME.dump" $backupFolder
```

공개만 멈추려면 VM에서 `sudo tailscale funnel --tls-terminated-tcp=443 off`를 실행합니다. 앱도 멈추려면 `dc stop`을 실행합니다. 다시 켜려면 5단계에서 `dc up -d --wait solver server client ingress`와 3단계 Funnel 명령을 실행합니다. `down --volumes`는 운영 DB 볼륨을 삭제하므로 실행하지 않습니다.

## 9. 다음 버전 배포와 복원

업데이트 전 8단계로 백업합니다. 새 소스 ZIP은 새 디렉터리에 풀고 그 디렉터리에서 5단계의 `dc` 함수를 사용합니다. 기존 환경 파일에서 `RELEASE_TAG`만 새 버전으로 바꿉니다. 빌드를 먼저 완료한 뒤 Funnel을 끄고 `dc stop server`로 계산 워커를 멈춥니다. `dc run --rm migrate`와 `dc up -d --wait solver server client ingress`가 성공하면 Funnel을 다시 켜고 6단계로 확인합니다. 운영 프로젝트 이름 `meetpoint-production`과 기존 비밀번호를 유지하면 같은 DB 볼륨을 사용합니다.

DB 복원이 필요하면 새 프로젝트의 **빈 DB**에 먼저 복원하고 데이터를 확인합니다. 장애 대응과 이전 버전으로 돌아가는 절차는 [공통 운영 절차](09-deployment.md)를 참고하세요.
