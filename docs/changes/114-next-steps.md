# #114 다음 작업 문서 정리, npm audit 분석, 다크 모드·320px 점검

- 이슈: [#114](https://github.com/sirloinbh/health-log/issues/114)
- 브랜치: `docs/114-next-steps`

## 목적

다음 작업 문서(`docs/next-steps/README.md`)를 현재 상태에 맞게 고친다. "아직 정리하지 못한 것"에 남아 있던 `npm audit`를 분석한다. #43 이후 새로 생긴 화면을 다크 모드와 좁은 폭(320px)에서 점검한다.

## 변경 — 2026-11-08

`docs/next-steps/README.md`

- #31, #32(음식 데이터)와 #104, #107(목표 후속)이 끝났다고 반영했다.
- "진행 중" 절을 더했다.
  - agent2: #34 조사, 그 뒤 #35
  - agent3: #39, #40, 이어서 #48
  - agent1: 이 문서(1차 리뷰 반영 때 뺐다. 병합되면 #114가 닫히기 때문)
- `npm audit` 항목을 아래 분석 결과와 후속 이슈 #115로 바꿨다.
- 최종 갱신일은 오늘(2026-11-08)이라 그대로다.

## npm audit 분석

`main`(c40895c)의 잠금 파일로 `npm audit --json`과 `npm audit --omit=dev`를 실행했다. 설치·업데이트·`npm audit fix`는 실행하지 않았다.

- **결과:** moderate 12건, low·high·critical 0건(의존성 615개 중 운영 177개).
- **원인은 한 건:** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) "minimatch has potential denial of service via globparts amplification".
  - 취약 범위는 minimatch 7.0.0 이상 11.0.1 미만이고, 첫 수정 버전은 11.0.1이다. 이 리포는 minimatch@10.2.6을 쓴다.
  - 나머지 11건은 이 패키지를 거쳐 표시된 것이다. `@eslint/config-array`, `@eslint/js`, `@sirloinbh/eslint-config`, `@typescript-eslint/*` 5개, `eslint`, `eslint-plugin-jsx-a11y-x`, `typescript-eslint`가 해당한다.
- **경로:** `npm ls minimatch --all`로 확인했다. `eslint`, `@eslint/config-array`, `typescript-eslint`의 `@typescript-eslint/typescript-estree`, `eslint-plugin-jsx-a11y-x` → minimatch@10.2.6이다. 모두 개발 의존성이다.
- **운영 영향:** 없다.
  - `npm audit --omit=dev`는 0건이다.
  - 공격하려면 공격자가 glob 패턴을 정할 수 있어야 한다. 여기서는 개발자 PC와 CI에서 이 리포의 ESLint·TypeScript 설정에 적힌 패턴만 들어간다.
- **지금 고칠 방법:** 없다.
  - 2026-11-08 기준 상위 패키지 최신판이 모두 `minimatch ^10`을 요구한다.
    - eslint 10.14.0 `^10.2.6`
    - @eslint/config-array 0.23.5 `^10.2.4`
    - @typescript-eslint/typescript-estree 8.72.1 `^10.2.2`
    - eslint-plugin-jsx-a11y-x 0.2.0 `^10.2.5`
  - 10.x에는 수정 버전이 없다(마지막 10.2.6).
  - `npm audit fix --force`는 eslint-plugin-jsx-a11y-x를 0.1.1로 내리라고 제안한다. 0.1.1은 minimatch `^3.1.2`를 써서 이 경로 하나는 빠진다. 하지만 eslint·@eslint/config-array·typescript-eslint 경로가 남아 경고는 그대로이고, 플러그인 규칙만 바뀔 수 있다.
  - `overrides`로 minimatch 11을 강제하는 것은 상위가 검증하지 않은 메이저 변경이라 권하지 않는다.
- **후속:** [#115](https://github.com/sirloinbh/health-log/issues/115)(P4, 사용자)를 [#88](https://github.com/sirloinbh/health-log/issues/88) 아래에 연결했다. 상위 패키지가 `minimatch >=11.0.1`을 받아들이면 사용자가 업데이트한다. 확인 명령과 업데이트 명령 예시는 이슈에 적었다.

## 다크 모드·320px 화면 점검

코드를 바꾸지 않았다. 문제가 없어 결과만 기록한다.

- 임시 PostgreSQL 17(5471, `health_test`, 마이그레이션 014까지)에 실제 API(127.0.0.1:3971)와 Vite(5271)를 띄웠다.
- 헤드리스 Chrome(디버깅 9671)에서 CDP `Emulation.setEmulatedMedia`로 `prefers-color-scheme: dark`를 켰다. 저장된 테마 선택이 없어 시스템 설정을 따른다.
- 확인용으로 11-06에 정크푸드 표시가 된 간식 1개를 API로 넣었다.

| 화면                                                                        | 320 다크 | 390 다크 | 1440 다크 | 320 라이트 |
| --------------------------------------------------------------------------- | -------- | -------- | --------- | ---------- |
| 설정의 목표 카드(#45, #107)                                                 | 통과     | 통과     | 통과      | 통과       |
| 하루 기록의 목표 달성 카드(#45, #104)와 식단 카드의 정크푸드 집계·표시(#38) | 통과     | 통과     | 통과      | 통과       |
| 범위 밖 날짜 `/daily/2100-01-01`의 범위 안내(#50)                           | 통과     | 통과     | 통과      | —          |
| 범위 끝 날짜 `/daily/2099-12-31`(#50)                                       | 통과     | 통과     | 통과      | —          |

- **가로 넘침:** 문서 너비가 화면 폭과 같았다. 화면 오른쪽 밖으로 나가는 요소도 없었다. 모든 칸에서 그랬다(1440은 스크롤 막대를 뺀 1425).
- **글자 대비:** 하루 기록 화면의 배지 6개와 판정 줄의 회색 글자를 실제 계산값으로 쟀다. 모두 WCAG AA 4.5:1 이상이었다.
  - 다크: 배지 8.71~17.18, 회색 판정 줄 6.94
  - 라이트: 가장 낮은 것이 "달성" 배지 4.95, 회색 판정 줄 4.74
- **#104를 320 라이트에서:** 식단 카드의 "바로 기록"으로 1,300kcal를 더했다. 버튼을 누르지 않아도 목표 카드 칼로리가 2,870kcal에서 4,170kcal로 바로 바뀌었다.
- 다크 모드 화면도 눈으로 확인했다(320 목표 카드, 정크푸드 배지). 글자가 배경에 묻히거나 테두리가 사라진 곳은 없었다.
- 확인 뒤 Chrome, Vite, API, 임시 DB를 모두 껐다.

## 변경 — 2026-11-08 (1차 리뷰 반영)

PR #116의 1차 리뷰(작성 문맥과 분리된 읽기 전용 리뷰)는 `npm audit`, `npm ls`, `npm view`, 이슈 상태, 하위 이슈 연결, 링크를 직접 다시 확인했다. 사실 오류는 없었고 낮음 4개가 나왔다. 모두 반영했다.

- `npm audit fix --force` 문장에 이유를 더했다. 0.1.1은 minimatch `^3.1.2`라 그 경로 하나는 빠지지만 나머지 경로가 남는다. #115 본문도 같이 고쳤다.
- @eslint/config-array에 버전(0.23.5)을 적었다. #115의 확인 명령에 `npm view @eslint/config-array dependencies.minimatch`를 더했다.
- README의 "#40 약(진행 중)"을 "(둘 다 진행 중)"으로 고쳤다. 진행 중 표시가 #40에만 붙은 것처럼 읽혔다.
- README "진행 중"의 agent1 줄을 뺐다. 이 PR이 병합되면 #114가 닫혀 맞지 않게 된다. 분석 기록 링크는 `npm audit` 항목으로 옮겼다.

## 변경 — 2026-11-08 (2차 리뷰 반영)

2차 리뷰(마지막)는 1차 반영 4건이 맞다고 확인했다. `npm view`로 0.1.1의 minimatch `^3.1.2`와 @eslint/config-array 0.23.5도 다시 봤다. 낮음 2개가 나왔고 모두 반영했다.

- 첫 변경 절의 "agent1: 이 문서" 줄에, 1차 리뷰 때 README에서 뺐다는 것을 덧붙였다.
- #115 본문의 @eslint/config-array에도 버전 0.23.5를 적었다.

## 검증

- `npm run format:check`: 통과.
- 문서 링크: 새로 쓴 상대 링크 `../changes/114-next-steps.md`가 있는 파일을 가리키는지 확인했다.
- README의 이슈 상태는 `gh issue view`로 대조했다. #32 닫힘, #34·#35·#39·#40·#48 열림.
- 앱 코드는 바꾸지 않아 앱 테스트를 더하지 않았다.
