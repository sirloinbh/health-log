# #41 외부 접속 보호: 지정 IP만 허용

- 이슈: [#41](https://github.com/sirloinbh/health-log/issues/41)
- 브랜치: `docs/41-ip-allowlist-access`

## 목적

이 앱은 로그인이 없고 건강·의료 기록을 저장한다. 서버에 올리기 전에 본인만 접속할 수 있는 방식을 정해 둔다.

## 결정 — 2026-11-04

사용자가 "우선은 지정된 IP에서만 접속 허용(회사, 집)"으로 정했다. 비교와 한계는 [#41 댓글](https://github.com/sirloinbh/health-log/issues/41#issuecomment-6620534558)에 적었다.

## 변경 — 2026-11-04

- **`docs/access-protection.md` 추가:** 어떤 층이 막는지, 지켜야 할 것, IP 추가·변경 절차, 배포 뒤 확인 방법, 한계를 적었다.
  - 실제 경계는 공유 서버 방화벽 `allowed_cidrs`다. 배포하려면 웹을 서버 밖에 열어야 하므로, `127.0.0.1` 바인딩만으로 막는다고 쓰지 않았다.
- **`AGENTS.project.md` 서비스 규칙:** DB·API 포트를 밖으로 내지 않고, 방화벽에는 `allowed_cidrs`만 쓰도록 규칙으로 적었다.
- **`docs/project-setup.md`, `docs/next-steps/README.md`:** 새 문서를 연결하고 #41의 다음 행동을 바꿨다.

코드는 바꾸지 않았다. 지정 IP 허용은 `sirloinbh/shared-aws-infrastructure`의 방화벽 규칙이 이미 하고 있다. 그래서 이 저장소에서 할 일은 규칙을 문서로 고정하는 것이다.

## 검증

- **공유 인프라:** `shared-aws-infrastructure`의 `main.tf`에서 확인했다. `aws_lightsail_instance_public_ports`가 22와 80만 열고, 둘 다 `cidrs = var.allowed_cidrs`다. `variables.tf`는 `/0`을 거부한다.
- **`compose.yaml`:** DB는 `127.0.0.1:15403`, 웹은 `127.0.0.1:8103`이고 API는 호스트 포트가 없다.
- **`npm run check`:** 통과. 문서만 바뀌었다. 백엔드 60개 통과, 37개 건너뜀(`TEST_DATABASE_URL` 없음, 성공으로 세지 않음). 프런트엔드 208개 통과, 2개 건너뜀. 스킬 검사 4개 통과.
- **`npm run standards:check`:** 통과. `backend/src/body.ts`의 `req.query` 경고 2건은 이 변경 전부터 있었다.

## 1차 리뷰 — 2026-11-04

지적 5건을 모두 반영했다. 그중 배포 준비 작업은 [#74](https://github.com/sirloinbh/health-log/issues/74)로 분리했다.

- **배포 계약(중간):** 처음에는 "중앙 배포 스크립트가 `WEB_BIND`, `WEB_PORT`로 웹 포트를 연다"고 썼다. 이는 틀렸다.
  - `remote-deploy.sh`는 `compose.yaml`이 지켜야 할 계약을 적어 둘 뿐이다. `WEB_PORT`는 상태 확인에만 읽는다.
  - health-log의 `compose.yaml`은 웹을 `127.0.0.1:8103`으로 고정하고, `${IMAGE_TAG}` 태그도 없다.
  - 문서에 "지금 상태"를 따로 적었다. `compose.yaml`을 계약에 맞추는 일은 #74로 분리했다.
- **열린 포트 없음(높음):** 방화벽은 80만 열고 80은 workout-memo가 쓴다. 그래서 "허용한 IP에서 앱이 열린다"는 확인을 통과할 길이 없었다. 방화벽 `port_info` 추가와 서버 `.env` 설정 순서를 "외부에 열기"로 적고, 실제 작업은 #74로 분리했다.
- **SSH 터널(낮음):** health-log용 명령(`-L 8103:127.0.0.1:8103`)을 적었다.
- **IPv6(낮음):** 확인 항목에 `ipv6Cidrs`가 비어 있는지 더했다. 서버는 지금 IPv4만 쓴다(`main.tf`).
- **링크(낮음):** 이슈가 아니라 결정 댓글로 바꿨다.
- 이슈 완료 기준의 `npm run check`도 실행했다. 결과는 아래에 적었다.

### 확인하지 못한 것

- 실제 방화벽 규칙(`aws lightsail get-instance-port-states`): 이 PC에 AWS CLI가 없어 조회하지 못했다.
- 허용하지 않은 네트워크에서 기록 API가 응답하지 않는지: health-log가 아직 서버에 배포되지 않아 확인할 수 없다. 배포 뒤 `docs/access-protection.md`의 "배포 뒤 확인"대로 하고, 이 기록에 결과를 더한다.

## 남은 일

이 PR은 #41을 닫지 않는다. 다음 세 가지가 남아 있다.

- [사용자] 회사·집 공인 IP를 `allowed_cidrs`에 넣고 plan/apply한다.
- 웹을 허용 IP에만 연다(#74).
- 첫 배포 뒤 차단을 확인한다.
