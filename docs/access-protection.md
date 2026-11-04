# 외부 접속 보호

이 앱에는 로그인이 없다. 그래서 **지정한 IP(회사, 집)에서만 접속을 허용한다.** 결정과 비교는 [#41 댓글](https://github.com/sirloinbh/health-log/issues/41)에 있다.

## 어떻게 막는가

| 층          | 설정                                                                                                             | 관리 위치                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 서버 방화벽 | Lightsail 방화벽이 SSH(22)와 웹(80)을 `allowed_cidrs`의 IP에만 연다. 전체 공개(`/0`)는 변수 검증이 거부한다      | `sirloinbh/shared-aws-infrastructure`의 `main.tf`, `variables.tf`, `terraform.tfvars` |
| 앱 포트     | DB는 `127.0.0.1:15403`, 웹은 `127.0.0.1:8103`에만 바인딩한다. API는 호스트에 포트를 내지 않고 웹(nginx)을 거친다 | 이 저장소의 `compose.yaml`                                                            |

- 실제 IP는 이 공개 저장소에 쓰지 않는다. `shared-aws-infrastructure`의 `terraform.tfvars`(git 제외)에만 둔다.
- 방화벽은 공유 서버 전체에 걸린다. 같은 서버의 다른 앱도 같은 IP 목록을 쓴다.
- 중앙 배포 스크립트(`deploy/remote-deploy.sh`)는 서버 `.env`의 `WEB_BIND`, `WEB_PORT`로 웹 포트를 연다. 웹을 `0.0.0.0`에 열어도, 서버 밖에서 닿을지는 방화벽이 정한다. 그래서 **실제 경계는 방화벽**이다.

## 지켜야 할 것

- DB와 API 포트는 서버 밖으로 내지 않는다.
- 웹 포트를 외부에 열 때(새 포트, 호스트 프록시)는 방화벽 규칙의 `cidrs`에 `allowed_cidrs`만 쓴다.
- 사설 접속을 대신할 로그인을 만들기 전까지는 `allowed_cidrs`에 넓은 대역을 넣지 않는다.

## IP 추가·변경

1. 그 장소에서 공인 IP를 확인한다: `https://checkip.amazonaws.com`
2. `shared-aws-infrastructure`의 `terraform.tfvars`의 `allowed_cidrs`에 `"<IP>/32"`로 넣거나 고친다.
3. 그 저장소의 [운영 문서](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) 7절대로 plan과 apply를 실행한다. 방화벽 규칙만 바뀌고 서버는 그대로다.

## 배포 뒤 확인

첫 배포 뒤와 IP를 바꾼 뒤에 확인하고, 결과를 변경 기록에 남긴다.

- 허용한 IP에서 앱과 `/api/health`가 열린다.
- 허용하지 않은 네트워크(예: 휴대폰 데이터)에서는 웹과 기록 API(`/api/sleep/<날짜>` 등)가 응답하지 않는다(연결 시간 초과).
- `aws lightsail get-instance-port-states`에서 모든 포트의 `cidrs`에 `/0`이 없다.

## 한계

- **집 IP 변경:** 가정용 회선의 공인 IP는 바뀔 수 있다. 바뀌면 접속이 막히므로 위 절차로 고친다.
- **바깥 접속:** 휴대폰 데이터나 다른 장소에서는 열리지 않는다. 필요해지면 VPN이나 로그인을 다시 검토한다.
- **암호화 없음:** 지금은 HTTP라 전송 내용이 암호화되지 않는다. 회사 네트워크를 지날 때 내용이 보일 수 있다. 걱정되면 SSH 터널로 접속한다.
