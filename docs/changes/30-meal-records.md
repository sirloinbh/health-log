# #30 식사 기록과 하루 영양 합계

- 이슈: [#30](https://github.com/sirloinbh/health-log/issues/30)
- 브랜치: `feat/30-meal-records`

## 목적

끼니별로 먹은 음식과 양을 기록하면 하루 칼로리와 영양성분 합계가 나오게 한다. 정크푸드 집계(#38)가 이 기록을 쓴다.

## 변경 — 2026-11-01

- **DB:** `database/migrations/004_meal_entries.sql`. 기록할 때 음식의 이름, 브랜드, 제공량, 영양성분을 1회분 값으로 복사한다. 그래서 음식을 나중에 고쳐도 과거 합계가 바뀌지 않는다.
- **API:** `backend/src/meals.ts`. `GET /api/meals/:date`, `POST /api/meals/:date`, `DELETE /api/meals/:date/entries/:id`. 모두 그날의 기록과 합계 전체를 돌려줘 목록과 합계가 어긋나지 않는다. 요청 횟수 제한은 다른 API와 같다.
- **계산:** 수량 곱하기와 합산은 DB의 `numeric`으로 해서 부동소수 오차가 없다. 합계는 소수 둘째 자리로 반올림한다.
- **값 없음:** 값을 모르는 영양성분은 0으로 세지 않는다. 합계에 영양소별로 빠진 항목 수를 함께 돌려주고, 화면에 "일부가 빠진 합계"로 표시한다.
- **화면:** `frontend/src/meals.tsx`. 하루 기록의 식단 칸을 합계, 끼니별 목록, 추가 영역으로 바꿨다. 불러오기에 실패하면 추가 영역을 숨긴다.
- **정리:** 경로의 날짜 판정을 `backend/src/dates.ts`의 `parseDate`로 모아 수면 API와 함께 쓴다.
- **문서:** `docs/next-steps/README.md`를 갱신했다.

## 정한 것

이슈에 없던 규칙이고, 사용자 확인 없이 #30 댓글에 기록하고 진행했다.

- **수량 단위:** 1회 제공량의 배수다. 1.5는 1회 제공량의 1.5배다. 그램으로 직접 입력하지 않는다.
- **끼니:** 아침, 점심, 저녁, 간식 네 가지다. 선택 상자 대신 한 번에 누를 수 있는 버튼으로 뒀다.
- **빠른 입력:** 저장소에 없는 음식은 이름과 1회 칼로리만 적는다. 음식 저장소에는 추가하지 않고 그날 기록에만 남는다.
- **수정 없음:** 잘못 적은 기록은 지우고 다시 넣는다. 이슈의 범위가 조회·저장·삭제이기 때문이다.

## 검증

- 추가한 테스트: `backend/test/meals.test.ts`, `backend/test/meals.integration.test.ts`, `frontend/src/meals.test.tsx`, `frontend/src/daily.test.tsx`(지난 날짜의 늦은 응답)
- 완료 기준 대응:
  - 1.5인분 반영: 통합 테스트 `1.5 servings count exactly in calories and every nutrient`
  - 음식 수정 뒤 과거 합계 유지: 통합 테스트 `editing a food later leaves past days as they were`
  - 일부 누락 안내: 통합 테스트 `an unknown nutrient is counted as missing, and a known zero is not`, 화면 테스트 `the totals say when an unknown value leaves them incomplete`

- `npm run check`(임시 DB 사용): 통과. 백엔드 74개 통과, 건너뜀 0개. 프런트엔드 141개 통과, 2개 건너뜀(다크 전용 앱용 조건, 이 변경과 무관). 스킬 검사 4개 통과
- `npm run knip`, `npm run standards:check`: 통과

### DB 통합 테스트

이 PC의 DB 계정은 `health_test`를 만들 수 없어, `initdb`로 임시 폴더에 PostgreSQL 17 클러스터를 따로 띄워 `health_test`를 만들었다. 기존 DB는 건드리지 않았다. 마이그레이션 4개를 적용했고 `004` 재실행도 통과했다.

### 브라우저 확인

헤드리스 Chrome을 CDP로 움직였다. API는 실제 서버, DB는 위 임시 클러스터다. 입력은 키보드가 아니라 값을 넣고 입력 이벤트를 발생시키는 방식이다.

| 항목                                  | 390×844 | 1440×900 |
| ------------------------------------- | ------- | -------- |
| 기록 없는 날의 안내                   | 통과    | 통과     |
| 검색한 음식을 점심에 1.5회분 기록     | 통과    | 통과     |
| 합계 185.18kcal, 단백질 15g           | 통과    | 통과     |
| 일부 누락 안내                        | 통과    | 통과     |
| 이름과 칼로리만으로 기록              | 통과    | 통과     |
| 음식을 고친 뒤 새로고침해도 합계 유지 | 통과    | 통과     |
| 삭제 확인, 합계 갱신, 포커스 이동     | 통과    | 통과     |
| 다른 날에 기록이 보이지 않음          | 통과    | 통과     |
| 가로 넘침, 콘솔 오류                  | 없음    | 없음     |

3회 반복해 모두 통과했다. 처음 두 번의 실행에서 나온 실패는 확인 스크립트의 문제였다. 하나는 고른 날짜가 앞선 크기에서 기록을 넣은 날의 다음 날이었고, 다른 하나는 임시 DB를 비우는 명령의 한글이 깨져 음식이 남아 있었다.

실제 휴대폰, 다크 모드, 화면 읽기 프로그램은 확인하지 않았다.
