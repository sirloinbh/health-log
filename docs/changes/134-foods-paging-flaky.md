# #134 음식 목록 페이지 통합 테스트의 경합 실패

- 이슈: [#134](https://github.com/sirloinbh/health-log/issues/134)
- 브랜치: `fix/134-foods-paging-flaky`

## 목적

`backend/test/foods.integration.test.ts`의 "with 150 matching foods, paging reaches every one exactly once"가 가끔 `451 !== 450`으로 실패했다. 다시 돌리면 통과했다. 이 PR은 다른 테스트 파일이 무엇을 쓰든 같은 결과가 나오게 한다. 테스트 파일만 고치고 앱 코드는 고치지 않는다.

## 원인

- 이 테스트의 끝부분은 검색어 없이 전체 음식 목록을 API로 끝까지 넘기고, 그 수를 바로 전에 센 `SELECT count(*) FROM foods`와 비교했다.
- `tsx --test`는 테스트 파일을 동시에 돌린다. 그래서 그사이 다른 파일이 음식을 넣거나 지우면 수가 어긋났다. 음식을 넣는 파일은 combos, junk, meals, meal-copy, recent-foods, text다.
- 넣은 음식이 읽는 위치보다 앞에 정렬되면 페이지 경계가 밀린다. 그러면 같은 음식이 두 번 나오거나 빠질 수도 있었다.

## 정한 것

- 전체 목록 확인은 지켜야 하는 동작이다(#67: 검색어 없이도 끝까지 볼 수 있음). 그래서 지우지 않고, **한 시점의 DB 상태로 읽게** 했다.
- 직렬 실행이나 재시도로 덮지 않았다. 검색어로 범위를 좁히는 방식은 이 부분에 맞지 않는다. 확인하려는 것이 검색어가 없을 때의 동작이기 때문이다. 검색어가 있는 앞부분은 이미 이 테스트만의 이름 접두어(`integration-test-paging-`)로 좁혀져 있다.

## 변경 — 2026-11-08

- `backend/test/foods.integration.test.ts`
  - 전체 목록 확인을 연결 하나의 `REPEATABLE READ` 트랜잭션 안에서 한다. API(`withApi`)에도 그 연결을 풀 대신 넘긴다. 그래서 API가 읽는 목록과 비교 기준이 같은 스냅숏을 본다. 끝나면 `ROLLBACK`한다.
  - 개수만 비교하던 것을 **id 목록 전체를 정렬 순서까지** 비교하도록 바꿨다(`ORDER BY name, brand NULLS FIRST, id`). 중복이나 누락이 생기면 바로 드러난다.

## 같은 패턴 점검

- `count(*)`를 쓰는 다른 통합 테스트는 모두 범위가 좁혀져 있어 경합하지 않는다.
  - `foods.integration.test.ts`의 공공·프랜차이즈·비비고 데이터 확인은 출처 URL이나 브랜드로 좁혀져 있다. 다른 테스트 파일은 이런 음식을 넣지 않는다.
  - `habits.integration.test.ts`는 자기 날짜로, `visits.integration.test.ts`는 자기 방문 id로 좁혀져 있다.
- 목록 API를 쓰는 다른 테스트도 범위가 좁혀져 있다.
  - combos, medications, reminders, visits는 자기 태그로 찾거나 거른다.
  - visits의 페이지 테스트는 태그 검색어로 좁혀져 있다.
- **남은 위험(이 PR에서 고치지 않음):** `recent-foods.integration.test.ts`가 읽는 `/api/foods/recent`는 범위 인자가 없는 전역 "최근 10개" 목록이다.
  - 이 파일이 기록한 뒤 다른 파일이 서로 다른 음식 8개 이상을 먼저 기록하면, 자기 음식이 목록 밖으로 밀려 실패할 수 있다. 지금 다른 파일이 기록하는 음식 수로는 드물다.
  - 고치려면 API에 범위 인자를 더하는 등 앱 코드를 바꿔야 해서 이 PR의 경계(테스트 파일만) 밖이다.

## 확인

- **고치기 전·후 재현:** 다른 프로세스가 앞쪽에 정렬되는 음식(`aaa-noise-N`)을 계속 넣고 지우게 했다. 그 상태에서 이 테스트만 3번씩 돌렸다.
  - 고치기 전(`origin/main`의 테스트): 3번 모두 실패했다.
  - 고친 뒤: 3번 모두 통과했다.
  - 임시 스크립트와 옛 테스트 사본은 지웠다.
- **`npm run check` 6회 연속:** `TEST_DATABASE_URL=<임시 PG17 health_test>`로 돌렸다. 6회 모두 통과했다. 매번 백엔드 263개 통과(실패 0, 건너뜀 0), 프런트 513개 통과(2개 건너뜀).
- `npm run knip`: 통과.
- 확인 뒤 임시 DB를 껐다.
