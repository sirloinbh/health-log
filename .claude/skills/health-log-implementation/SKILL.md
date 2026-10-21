---
name: health-log-implementation
description: Follow the user's issue, numbered branch, implementation with docs, tests, and PR workflow for changes to the sirloinbh health-log project. Use for code, configuration, documentation, and skill edits; exclude read-only questions and recommendations. Merge the PR with a merge commit once all required CI checks pass.
---

# 식단·수면·건강 기록 구현 절차

이 스킬은 `sirloinbh/health-log` 변경 작업에 적용한다. 다른 프로젝트에 이 계정·저장소·정책을 적용하지 않는다. 프로젝트 루트의 `AGENTS.md`와 관련 문서를 먼저 읽는다. 아래 순서를 지키고 필수 CI가 통과한 PR을 병합까지 마친 결과를 제공한다.

## 1. 이슈카드 등록

- GitHub 원격 주소와 `gh api user --jq .login`을 확인한다. 기대 계정은 `sirloinbh`이며, 다른 계정이면 인증을 바로잡기 전 원격 변경을 진행하지 않는다.
- 사용자가 지정한 이슈 또는 같은 요청으로 이미 등록한 이슈를 재사용한다. 재시도 전에 기존 결과를 확인해 중복 이슈를 만들지 않는다.
- 새 이슈에는 문제·목적, 요청한 범위, 완료 기준과 검증 방법을 적는다. 이 프로젝트에서 이슈카드는 GitHub Issue를 의미한다. 별도 Projects 보드를 지정하지 않았다면 보드를 만들거나 연결하지 않는다.
- 본문은 UTF-8 임시 파일로 작성해 `gh issue create --repo sirloinbh/health-log --title ... --body-file ...`로 등록한다. 토큰과 비밀값을 본문에 넣지 않는다.
- 발급된 실제 이슈 번호와 URL을 보관한다. 이슈 등록이 실패하면 번호를 임의로 만들거나 코드 변경을 먼저 시작하지 않는다.

## 2. 이슈 번호로 브랜치 생성

- 작업 트리와 현재 브랜치를 확인한다. 다른 작업의 변경이 있으면 보존하고 작업 간 섞임을 피한다.
- 기본 대상 브랜치는 `main`이다. 관련 없는 미병합 작업 브랜치에서 새 작업을 시작하지 않는다. 깨끗한 작업 트리에서 원격 main을 fetch하고 그 기준으로 분기한다. 사용자 변경이 있으면 보존 가능한 작업 공간을 준비한다.
- 브랜치 이름: `<type>/<number>-<short-slug>`. 예: `feat/12-first-feature`, `fix/13-goal-date`, `docs/14-project-skills`, `chore/15-ci`.
- 같은 이슈 브랜치가 이미 있으면 상태를 확인하고 이어서 사용한다.
- 변경과 커밋은 이 브랜치에서 수행한다. `main`에 직접 커밋하거나 푸시하지 않는다.

## 3. 구현과 커밋별 docs 기록

- 구현·수정 시 프로젝트의 `skills/health-log-testing/SKILL.md`를 읽고 관련 테스트를 함께 작성·수정한다. 버그 수정은 회귀 테스트를 추가한다. 구현·테스트·docs는 같은 작업 커밋에 포함하며 커밋 전에 관련 테스트를 실행한다.
- 요청한 범위만 구현한다. 개발 기반 정리 작업은 `health-log-foundation`을 함께 읽는다.
- `docs/changes/<number>-<slug>.md`를 만들고 이슈 링크, 목적, 변경 내용, 검증, 제한·후속 작업을 기록한다.
- **각 작업 커밋에 그 커밋에서 수행한 변경과 검증을 docs에 함께 기록한다.** 하나의 이슈 문서에 항목을 누적해도 된다. 문서만 수정한 커밋도 해당 작업 기록을 갱신한다.
- 기록에는 변경 이유와 관찰된 결과를 남긴다. 실행하지 않은 검사나 배포를 완료했다고 쓰지 않는다. 커밋 자신을 가리키는 SHA를 미리 만들 필요는 없다. 커밋 제목 또는 작업 단위로 구분한다.
- 커밋 제목은 `feat: ... (#12)`, `fix: ... (#13)`, `docs: ... (#14)`처럼 유형과 이슈 번호를 포함한다.
- stage 전에 diff와 비밀정보 포함 여부를 확인하고 관련 파일만 명시해서 stage한다. 다른 사용자의 변경을 포함하지 않는다.

## 4. 테스트 후 PR 생성

- PR을 생성하거나 갱신하기 전에 최종 변경의 관련 테스트와 필수 검사를 실행한다. 추가·수정한 테스트 코드, 검증한 동작, 실제 실행 명령과 pass/fail/skip을 docs와 PR에 남긴다. 필수 명령과 DB 통합 테스트 조건은 프로젝트 `AGENTS.md`를 따른다. 단순 문서·스킬 수정에 불필요한 앱 테스트를 추가하지 않는다.
- 실패를 수정하고, 실행하지 못한 검사·건너뛴 DB 테스트·미완료 브라우저 검증을 구분해 docs와 PR에 기록한다. 필요한 검증이 막히면 PR은 draft로 만든다.
- 작업 브랜치만 푸시한다. PR 대상은 `sirloinbh/health-log`의 `main`이다. subtree 동기화 스크립트는 main과 하위 저장소를 푸시하므로 이 단계에서 사용하지 않는다.
- 같은 head 브랜치의 PR이 있으면 업데이트하고 중복 생성하지 않는다.
- PR 본문은 UTF-8 파일로 전달한다. 문제와 변경 후 동작, 주요 변경, 실제 검사 명령·결과, 화면 변경 시 가능한 증거, `Closes #<number>`를 포함한다. 이미지가 없으면 없는 이유와 검증 한계를 적는다.
- GitHub Actions 결과를 확인하고 관련 실패를 해결한다. 아직 실행 중인 검사는 실행 중이라고 알린다. PR 생성 후 코드를 수정했으면 영향받는 검사를 다시 실행하고 docs·PR 결과를 갱신한다.

## 5. CI 통과 후 병합

- **필수 CI 검사가 모두 통과하면 에이전트(주 에이전트·로컬 워커)가 묻지 않고 PR을 병합한다.** PR의 head SHA를 확인하고 래퍼로 `gh pr merge <url> --merge --match-head-commit <확인한 head SHA>`(병합 커밋)를 실행한다.
- 병합 후 연결 이슈(`Closes #<number>`)가 닫혔는지 확인한다. 닫히지 않았으면 원인을 확인해 알린다.
- 연속(stacked) PR은 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시하고, CI 통과 후 병합한다. 스택 끝까지 반복한다.
- **금지:** 실패하거나 실행 중인 검사가 있는 상태의 병합, `--admin` 등 브랜치 보호 우회, 리뷰 대신 자기 PR 승인, main 직접 푸시·커밋, force push.
- 현재 이 프로젝트의 `main` 병합은 배포를 실행하지 않는다(CI는 검증·Docker 빌드만 수행). 병합 시 배포가 연결되면 이 문서에 적고 병합 후 배포 결과를 확인한다.
- 이슈 URL, 브랜치 이름, PR URL, 검증·CI 결과, 병합 SHA와 남은 작업을 전달한다. CI를 통과시키지 못하면 PR을 열린 상태로 두고 이유를 알린다.

## 인증·실패 처리

이미 주어진 이슈·푸시·PR 권한을 불필요하게 재확인하지 않는다. 도구가 요구하는 실행 권한과 GitHub 인증은 준수한다. 실패 시 완료한 단계부터 재개하고, 원격 생성 결과가 불명확하면 조회한 뒤 재시도한다. 계정·인증 문제를 다른 계정으로 생성하는 방식으로 우회하지 않는다.
