# 식단·수면·건강 기록 고유 지침

이 파일은 health-log에만 해당하는 규칙이다. 공통 지침은 [AGENTS.md](AGENTS.md)이며, 중앙 표준(`sirloinbh/project-standards`) 동기화 후에는 중앙 관리 파일이 된다. 두 파일이 다르면 이 파일이 우선한다.

## 작업 절차 (공통 절차에 더해)

- **PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거친다.** 리뷰에서 보완점이 나오면 추가 커밋으로 반영하고, 1차 보완 후에는 2차 리뷰를 한 번 더 받는다. 2차 보완 커밋 뒤에는 더 리뷰하지 않는다. 보완점이 없으면 바로 다음 단계로 간다. 이 PR에서 고치기에 큰 수정은 새 이슈카드로 분리한다. 상세 절차는 health-log-implementation 스킬을 따른다.
- **그 뒤 최종 head의 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트·로컬 워커)가 묻지 않고 PR을 병합한다.** 래퍼로 `pr merge <url> --merge --match-head-commit <확인한 head SHA>`(병합 커밋)를 실행하고 연결 이슈(`Closes #N`)가 닫혔는지 확인한다. 연속 PR은 순서대로 병합하며, 앞 PR 병합 후 다음 브랜치에 `origin/main`을 병합해 충돌을 풀고 관련 테스트를 다시 실행한 뒤 일반 푸시하고 CI 통과 후 병합한다. 실패·실행 중 검사 상태의 병합, `--admin` 등 브랜치 보호 우회, 리뷰 대신 자기 PR 승인, `main` 직접 푸시·커밋, force push는 금지한다. 현재 `main` 병합은 배포를 실행하지 않는다(CI는 검증·Docker 빌드만 수행).

## 고유 스킬

- [health-log-implementation](skills/health-log-implementation/SKILL.md), [health-log-testing](skills/health-log-testing/SKILL.md), [health-log-foundation](skills/health-log-foundation/SKILL.md): 이 프로젝트의 리뷰·병합 절차가 들어 있어 공통 스킬(std-*)이 들어온 뒤에도 유지한다.

## 서비스 규칙

- 아직 없다. 이 프로젝트에만 해당하는 도메인 규칙이 생기면 여기에 적는다.
