# #3 CI 통과 PR을 에이전트가 병합하도록 정책 변경

- 이슈: https://github.com/sirloinbh/health-log/issues/3
- 브랜치: `chore/3-agent-auto-merge`

## 목적

저장소 소유자가 2026-10-21에 PR 병합 정책 변경을 명시적으로 지시했다. "PR 병합은 사용자만 수행한다" 규칙 때문에 프로젝트마다 병합을 반복 요청해야 했다.

## 변경

- 새 정책: 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트·로컬 워커)가 묻지 않고 프로젝트 래퍼로 `pr merge <url> --merge --match-head-commit <확인한 head SHA>`(병합 커밋)를 실행하고 연결 이슈가 닫혔는지 확인한다.
- 연속 PR은 순서대로 병합한다. 앞 PR 병합 후 다음 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시하고 CI 통과 후 병합한다.
- 계속 금지: 실패·실행 중 검사 상태의 병합, `--admin` 등 브랜치 보호 우회, 리뷰 대신 자기 PR 승인, `main` 직접 푸시·커밋, force push.
- 현재 `main` 병합은 배포를 실행하지 않는다(CI `verify`·`docker-build`만 수행)는 사실을 명시했다.
- 수정 파일: `AGENTS.md`, `README.md`, `docs/project-setup.md`(절대 규칙·Git 전략·파일 역할 표·AGENTS 템플릿), `skills/health-log-{implementation,foundation,testing}/SKILL.md`(implementation frontmatter description 포함), `npm run skills:sync`로 갱신한 `.claude/skills/` 복제본.
- 과거 기록(`docs/changes/bootstrap.md`)은 바꾸지 않았다. 정책 문장을 검사하는 테스트·워커 코드는 저장소에 없다.

## 검증

앱 동작 변경이 없어 앱 테스트는 추가하지 않았다. `node_modules`가 없어 `npm ci --ignore-scripts`로 잠금 파일 그대로 설치했다(0 vulnerabilities).

| 명령                                                                    | 결과                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run skills:sync` → `npm run skills:check`                          | pass (`.claude/skills matches skills/.`)                               |
| `npm run test:skills`                                                   | pass 4/4                                                               |
| `PYTHONUTF8=1 py -3 quick_validate.py skills/<각 스킬>` (skill-creator) | pass 3/3 (`Skill is valid!`)                                           |
| `npm run check` (포맷 → lint → 타입 → 테스트 → 스킬 → 빌드)             | pass. 백엔드 테스트 7 pass, 1 skip(`TEST_DATABASE_URL` 미설정 DB 통합) |

DB 통합 테스트는 로컬에서 건너뛰었으므로 DB 검증 완료로 보지 않는다. CI는 테스트 DB로 실행한다.

## 제한·후속

- 이 PR은 이번 작업 지시에 따라 에이전트가 병합하지 않고 사용자가 병합하도록 열어 둔다. 새 정책은 다음 PR부터 적용한다.

## 2026-10-21 — PR 후 자동 리뷰(최대 2회)

### 변경

- PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거치는 단계를 병합 앞에 추가했다. 리뷰 → 보완 커밋 → 2차 리뷰 → 보완 커밋 순서이며, 2차 보완 커밋 뒤에는 더 리뷰하지 않는다. 보완점이 없으면 바로 CI 확인과 병합으로 간다.
- 이 PR에서 고치기에 큰 수정(범위 밖 기능, 설계·데이터 구조 변경, 여러 모듈 수정, 별도 검증이 필요한 작업)은 새 이슈카드로 분리한다. 분리하면 main이 깨지거나 보안·데이터 손상 위험이 남는 결함은 병합을 보류하고 사용자에게 알린다.
- 각 리뷰 차수의 결과(지적, 반영 커밋, 분리 이슈, 보완점 없음)는 PR 코멘트와 docs 작업 기록에 남긴다. 리뷰 중 새 커밋이 생기면 이전 CI 결과로 병합하지 않고 최종 head의 필수 CI 통과 후 병합한다.
- `skills/health-log-implementation/SKILL.md`: 새 "5. PR 후 자동 코드 리뷰(최대 2회)" 단계를 추가하고 병합 단계를 "6. CI 통과 후 병합"으로 바꿨다. frontmatter description도 갱신했다.
- 짧은 요약 반영: `AGENTS.md` 절차(5 리뷰, 6 병합), `README.md`, `docs/project-setup.md`(절대 규칙·Git 전략·파일 역할 표·AGENTS 템플릿), `skills/health-log-{foundation,testing}/SKILL.md`. `.claude/skills/`는 `npm run skills:sync`로 갱신했다.
- 기존 금지 사항(실패·실행 중 검사 상태 병합, `--admin`, 자기 PR 승인, `main` 직접 푸시, force push)과 연속 PR 처리는 유지했다.

### 이유

사용자가 PR 후 자동 리뷰 깊이를 최대 2회로 제한하고, 큰 수정은 새 이슈로 분리한 뒤, CI 통과 후 병합하도록 요청했다.

### 검증

| 명령                                                                    | 결과                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run skills:sync` → `npm run skills:check`                          | pass (`.claude/skills matches skills/.`)                               |
| `PYTHONUTF8=1 py -3 quick_validate.py skills/<각 스킬>` (skill-creator) | pass 3/3 (`Skill is valid!`)                                           |
| `npm run check` (포맷 → lint → 타입 → 테스트 → 스킬 → 빌드)             | pass. 백엔드 테스트 7 pass, 1 skip(`TEST_DATABASE_URL` 미설정 DB 통합) |
| `npm run test:skills` (`npm run check` 포함)                            | pass 4/4                                                               |

앱 동작 변경이 없어 앱 테스트는 추가하지 않았다. DB 통합 테스트는 로컬에서 건너뛰었으므로 DB 검증 완료로 보지 않는다.
