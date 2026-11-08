# #74 compose 배포 계약 (이 저장소 부분)

- 이슈: [#74](https://github.com/sirloinbh/health-log/issues/74) (이 PR은 `Refs #74`)
- 브랜치: `chore/74-compose-contract`

## 목적

공유 서버에 health-log를 올릴 때 중앙 배포 스크립트(`deploy/remote-deploy.sh`)가 기대하는 `compose.yaml` 계약을 지킨다. 서버 `.env` 값과 방화벽에서 열 포트를 문서로 정한다.

방화벽 변경(`sirloinbh/shared-aws-infrastructure`의 `main.tf`), `terraform plan`·`apply`, 서버 `.env`, 첫 배포와 그 확인은 사용자가 한다. 그래서 #74는 이 PR로 닫지 않는다.

## 정한 것

- **들어올 길:** 새 포트. 이슈의 할 일이 방화벽 `port_info` 추가다. 80은 workout-memo 웹이 쓰므로, 80을 나눠 쓰려면 호스트 프록시를 새로 두어야 한다.
- **웹 포트:** 중앙 레지스트리의 health-log 웹 포트 `8103`을 서버에서도 쓴다. 로컬과 서버 포트가 같아 SSH 터널 안내(`-L 18103:127.0.0.1:8103`)도 그대로다.
- **서버 `.env`:** `WEB_BIND=0.0.0.0`, `WEB_PORT=8103`. `IMAGE_TAG`는 배포 스크립트가 넣는다.

## 변경 — 2026-11-08

- **`compose.yaml`**
  - api: `image: health-backend:${IMAGE_TAG:-local}`
  - web: `image: health-frontend:${IMAGE_TAG:-local}`
  - web 포트: `'${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8103}:80'`. 값이 없으면 예전과 같은 `127.0.0.1:8103`이다.
  - workout-memo의 `compose.yaml`과 같은 모양이다(그 저장소는 고치지 않았다).
- **`.env.example`:** 서버에서만 `WEB_BIND`, `WEB_PORT`를 적는다는 주석을 더했다.
- **`docs/access-protection.md`:** "지금 상태"를 고치고 "서버 설정" 절을 더했다. 서버 `.env` 값, 열 포트, 접속 주소를 적었다. 실제 IP는 적지 않았다.
- **#74 댓글:** `main.tf`의 `aws_lightsail_instance_public_ports`에 넣을 `port_info` 초안을 남겼다. 그 저장소는 고치지 않았고 이슈도 만들지 않았다.

## 검증

- Docker 데몬은 이 PC에서 실행되지 않는다(`dockerDesktopLinuxEngine` 파이프 없음). 그러나 `docker compose config`는 데몬 없이 동작해 그대로 확인했다. `.env` 대신 `--env-file /dev/null`과 임시 값(`POSTGRES_PASSWORD=x`, `NODE_AUTH_TOKEN=x`)을 썼다.
  - 기본값: web `127.0.0.1:8103`, 이미지 `health-frontend:local`, `health-backend:local`. DB는 `127.0.0.1:15403` 그대로다.
  - 서버 값(`WEB_BIND=0.0.0.0`, `WEB_PORT=8103`, `IMAGE_TAG=0123abc`): web `0.0.0.0:8103`, 이미지 `health-*:0123abc`. DB는 `127.0.0.1:15403` 그대로다.
- `npm run check`(DB 없이): 아래 PR 기록 참고.
