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

## 변경 — 2026-11-08 (1차 리뷰 반영)

1차 리뷰(작성 문맥과 분리된 읽기 전용 리뷰)는 막는 문제를 찾지 못했다.

- 배포 스크립트 확인 결과:
  - `deploy/remote-deploy.sh`는 `health-backend`·`health-frontend` 이미지를 커밋 태그로 붙이고 정리한다.
  - `WEB_PORT`는 `/opt/health-log/.env`에서 읽어 `127.0.0.1:$WEB_PORT/api/health` 상태 확인에만 쓴다. `WEB_BIND=0.0.0.0`이어도 동작한다.
  - `deploy/notify.sh`도 같은 방식으로 읽는다.
- **반영(낮음)** #74 댓글의 `plan` 기대 결과를 "변경 하나"에서 "교체(-/+) 하나"로 고쳤다. `aws_lightsail_instance_public_ports`는 `port_info`를 바꾸면 다시 만들어지고, apply 동안 22·80·8103이 잠깐 닫힐 수 있다.
- **반영(낮음)** `docs/access-protection.md`의 "지켜야 할 것"에서 지금 쓰는 길(새 포트 8103)을 밝혔다.
- **남김(낮음)** `AGENTS.md`의 "포트(127.0.0.1 바인딩)"는 로컬 기준이다. 서버 웹은 `0.0.0.0:8103`이다. `AGENTS.md`는 중앙 관리 파일(`sirloinbh/project-standards`의 `templates/app/`)이라 이 PR에서 고치지 않았다. 서버 값은 `docs/access-protection.md`의 "서버 설정"이 원본이다.
