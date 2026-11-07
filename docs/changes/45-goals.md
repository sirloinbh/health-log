# #45 목표 설정과 달성 자동 판정

- 이슈: [#45](https://github.com/sirloinbh/health-log/issues/45)
- 브랜치: `feat/45-goals`

## 목적

#37의 직접 체크만으로는 날마다 기준이 달라질 수 있다. 칼로리, 단백질, 수면 시간, 금주 일수에 숫자 목표를 정하고, 하루 기록에서 지켰는지 같은 기준으로 자동 판정한다.

## 변경 — 2026-11-06 (첫 구현)

- **DB** 마이그레이션 `goals`(항목, 적용 시작일, 목표값): 목표를 바꾸면 행을 덮어쓰지 않고 새 시작일의 행을 더한다.
- **API** `backend/src/goals.ts`: 목표 조회·저장·변경 삭제와 하루 판정.
- **화면** `frontend/src/goals.tsx`, `frontend/src/goal-text.ts`: 설정 화면의 목표 카드와 하루 기록의 "목표 달성" 카드.

## 검증

- 백엔드 단위·통합 테스트 18개 통과(임시 PostgreSQL 17, 포트 5471, `health_test`).
- `npm run check` 통과.
