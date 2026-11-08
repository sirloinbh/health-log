# 외부 접속 보호

이 앱에는 로그인이 없다. 그래서 **지정한 IP(회사, 집)에서만 접속을 허용한다.** 결정과 비교는 [#41 결정 댓글](https://github.com/sirloinbh/health-log/issues/41#issuecomment-6620534558)에 있다.

## 어떻게 막는가

| 층          | 설정                                                                                                                                                                     | 관리 위치                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 서버 방화벽 | Lightsail 방화벽이 SSH(22)와 웹(80)을 `allowed_cidrs`의 IP에만 연다. 전체 공개(`/0`)는 변수 검증이 거부한다                                                              | `sirloinbh/shared-aws-infrastructure`의 `main.tf`, `variables.tf`, `terraform.tfvars` |
| 앱 포트     | DB는 `127.0.0.1:15403`에만 바인딩한다. 웹은 로컬에서 `127.0.0.1:8103`, 서버에서 `0.0.0.0:8103`이다(아래 "서버 설정"). API는 호스트에 포트를 내지 않고 웹(nginx)을 거친다 | 이 저장소의 `compose.yaml`, 서버의 `/opt/health-log/.env`                             |

- 실제 IP는 이 공개 저장소에 쓰지 않는다. `shared-aws-infrastructure`의 `terraform.tfvars`(git 제외)에만 둔다.
- 방화벽은 공유 서버 전체에 걸린다. 같은 서버의 다른 앱도 같은 IP 목록을 쓴다.
- 서버는 IPv4만 쓴다. IPv6로 들어오는 길은 없다.

## 지금 상태 (2026-11-08)

- **배포 계약:** `compose.yaml`이 중앙 배포 스크립트(`deploy/remote-deploy.sh`)의 계약을 따른다(#74).
  - 웹 포트: `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8103}`. 로컬 기본값은 예전과 같은 `127.0.0.1:8103`이다.
  - 이미지 태그: `health-frontend:${IMAGE_TAG:-local}`, `health-backend:${IMAGE_TAG:-local}`. 서버에서는 커밋 태그가 붙어 되돌리기와 옛 이미지 정리가 동작한다.
- **아직 외부에서 닿지 않음:** health-log는 아직 서버에 배포되지 않았다. 방화벽도 아직 22와 80만 연다. 80은 workout-memo가 쓴다.
- **남은 일:** 아래 "서버 설정"의 방화벽 포트 추가와 서버 `.env`, 첫 배포 뒤 확인이다. 사용자가 진행한다(#74).

## 서버 설정

외부에서 들어올 길은 **새 포트**로 정했다. 웹 포트는 중앙 레지스트리의 health-log 웹 포트 `8103`을 그대로 쓴다. 이슈의 할 일이 방화벽 `port_info` 추가이고, 80은 workout-memo 웹이 쓰므로 나눠 쓰려면 호스트 프록시를 새로 두어야 하기 때문이다.

| 항목                     | 값                                        | 설정 위치                                                                      |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------ |
| 서버 `.env`의 `WEB_BIND` | `0.0.0.0`                                 | `/opt/health-log/.env`                                                         |
| 서버 `.env`의 `WEB_PORT` | `8103`                                    | `/opt/health-log/.env`                                                         |
| 방화벽에서 열 포트       | TCP `8103`, `cidrs = var.allowed_cidrs`만 | `shared-aws-infrastructure`의 `main.tf`, `aws_lightsail_instance_public_ports` |
| 접속 주소                | `http://<static_ip>:8103`                 | 허용한 IP에서만                                                                |

- `IMAGE_TAG`는 `.env`에 적지 않는다. 배포 스크립트가 커밋으로 넣는다.
- `.env`를 바꾸면 다음 배포(또는 `/opt/health-log`에서 `docker compose up -d`) 때 반영된다.
- **로컬 주의:** 이미지 이름이 `health-*:local`로 정해졌다. 한 PC의 여러 worktree가 같은 이름을 쓰므로, 한 곳에서 빌드하면 다른 worktree도 다음 `up` 때 그 이미지로 뜬다. worktree마다 따로 두려면 그 worktree의 `.env`에 `IMAGE_TAG=<worktree 이름>`을 적는다.
- 웹을 `0.0.0.0`에 열면, 서버 밖에서 닿을지는 방화벽이 정한다. 그래서 **실제 경계는 방화벽**이다. `.env`를 먼저 바꾸고 방화벽을 나중에 열어도 그 사이에 밖에서 닿지 않는다.
- DB(`127.0.0.1:15403`)와 API(호스트 포트 없음)는 그대로다.
- 방화벽 변경안(`port_info`) 초안은 [#74 댓글](https://github.com/sirloinbh/health-log/issues/74)에 있다. plan과 apply는 사용자가 `shared-aws-infrastructure`의 [운영 문서](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md)대로 실행한다.

## 지켜야 할 것

- DB와 API 포트는 서버 밖으로 내지 않는다.
- 웹 포트를 외부에 열 때(지금은 새 포트 8103, 나중에 호스트 프록시로 바꿔도 같다)는 방화벽 규칙의 `cidrs`에 `allowed_cidrs`만 쓴다.
- 사설 접속을 대신할 로그인을 만들기 전까지는 `allowed_cidrs`에 넓은 대역을 넣지 않는다.

## IP 추가·변경

1. 그 장소에서 공인 IP를 확인한다: `https://checkip.amazonaws.com`
2. `shared-aws-infrastructure`의 `terraform.tfvars`의 `allowed_cidrs`에 `"<IP>/32"`로 넣거나 고친다.
3. 그 저장소의 [운영 문서](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) 7절대로 plan과 apply를 실행한다. 방화벽 규칙만 바뀌고 서버는 그대로다.

## 배포 뒤 확인

첫 배포 뒤와 IP를 바꾼 뒤에 확인하고, 결과를 변경 기록에 남긴다. 위 "서버 설정"이 끝나야 첫 항목을 통과할 수 있다.

- 허용한 IP에서 앱과 `/api/health`가 열린다.
- 허용하지 않은 네트워크(예: 휴대폰 데이터)에서는 웹과 기록 API(`/api/sleep/<날짜>` 등)가 응답하지 않는다(연결 시간 초과).
- 서버 방화벽 규칙에서 모든 포트의 `cidrs`에 `/0`이 없고, `ipv6Cidrs`는 비어 있다. 조회 명령(`aws lightsail get-instance-port-states`, 인스턴스 이름과 프로필 포함)은 `shared-aws-infrastructure`의 [운영 문서](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md)에 있다.

## 한계

- **집 IP 변경:** 가정용 회선의 공인 IP는 바뀔 수 있다. 바뀌면 접속이 막히므로 위 절차로 고친다.
- **바깥 접속:** 휴대폰 데이터나 다른 장소에서는 열리지 않는다. 필요해지면 VPN이나 로그인을 다시 검토한다.
- **암호화 없음:** 지금은 HTTP라 전송 내용이 암호화되지 않는다. 회사 네트워크를 지날 때 내용이 보일 수 있다.
  - 걱정되면 SSH 터널로 접속한다: `ssh -i ~/.ssh/workout-memo-lightsail -L 18103:127.0.0.1:8103 ubuntu@<static_ip>`를 실행한 뒤 `http://localhost:18103`을 연다.
  - 왼쪽은 일부러 `8103`이 아니다. 로컬 개발 환경이 `8103`을 쓰고 있으면 터널이 아닌 로컬 앱이 열려, 기록이 엉뚱한 DB에 들어갈 수 있다.
  - 서버의 웹 포트를 바꿨다면 오른쪽 `8103`을 그 포트로 바꾼다.
