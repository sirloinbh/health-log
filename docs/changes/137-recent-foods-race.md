# #137 최근 음식 통합 테스트의 경합 막기

- 이슈: [#137](https://github.com/sirloinbh/health-log/issues/137)
- 브랜치: `fix/137-recent-foods-race`

## 목적

`backend/test/recent-foods.integration.test.ts`가 읽는 `GET /api/foods/recent`는 DB 전체의 "최근 10개" 목록이다. `tsx --test`는 테스트 파일을 동시에 돌린다. 그래서 이 파일이 기록한 뒤 읽기 전에 다른 파일이 서로 다른 음식을 여러 개 기록하면, 이 파일의 음식이 목록 밖으로 밀려 실패할 수 있었다. #134 변경 기록의 "남은 위험"에 적혀 있던 문제다. 앱 코드와 화면 동작(전역 최근 10개)은 바꾸지 않는다.

## 재현

- 다른 프로세스가 저장소 음식 20개로 식사 기록을 쉬지 않고 넣고, 주기적으로 지우게 했다(날짜 1983-07-07). 그 상태에서 이 파일만 3번 돌렸다.
- 고치기 전(`origin/main` 6ce385a): **3번 모두 실패.** 매번 3개 중 2개가 실패했다.
  - "each food shows once…": 이 파일의 음식이 목록에 하나도 없다(`actual: []`).
  - "a food removed from the store no longer shows": 남긴 음식이 목록에 없다.
- "typed-in food takes none of the ten places"는 목록이 10개인지만 봐서 통과했다. 그 10개가 이 파일의 음식인지는 확인하지 못했다.

## 정한 것

- **테스트만 고친다.** #134(PR #136)처럼 연결 하나의 `REPEATABLE READ` 트랜잭션 안에서 한다. 다만 #134는 읽기만 했고, 이번에는 기록(API의 `POST /api/meals`)과 읽기를 모두 그 안에서 한다. 끝나면 `ROLLBACK`한다.
  - 스냅숏은 트랜잭션의 첫 문장 때 정해진다. 그 뒤 다른 파일이 커밋한 기록은 보이지 않는다.
  - 이 트랜잭션에서 넣는 기록은 스냅숏보다 뒤에 시퀀스 값을 받는다. 그래서 스냅숏이 보는 어떤 기록보다 id가 크다. 목록은 `max(id)` 순서라 이 파일의 음식이 늘 맨 앞에 온다.
- **API의 트랜잭션은 SAVEPOINT로 바꾼다.** 식사 기록 API는 `pool.connect()` 뒤 `BEGIN`/`COMMIT`을 쓴다. 테스트용 풀은 같은 연결을 돌려주고, 이 세 문장을 `SAVEPOINT`/`RELEASE SAVEPOINT`/`ROLLBACK TO SAVEPOINT`로 바꾼다. 앱의 기록 경로는 그대로 실행된다.
  - 이 처리는 `backend/test/helpers.ts`의 `inSnapshot`으로 묶었다. 연결이 하나라 요청은 하나씩 보내야 한다. 이 파일은 모든 요청을 차례로 기다린다.
- **확인을 엄격하게 바꿨다.** 이제 목록 맨 앞이 이 파일의 음식이라고 보장된다. 그래서 이 파일 음식만 골라 보던 확인을 순서까지 직접 비교하게 했다.
  - 처음 3개가 기대한 순서인지 본다.
  - 10개 테스트는 10개가 정확히 이 파일이 기록한 음식인지, 최근 순서인지 본다.
  - 지운 음식 테스트는 남긴 음식이 맨 앞인지 본다.
- **직렬 실행이나 재시도는 쓰지 않았다.**
- 함께 고친 것: 기록은 모두 롤백되므로 `after()`의 정리는 뺐다. `before()`의 정리는 옛 버전이 남긴 데이터를 지우려고 남겼다.

## 변경 — 2026-11-08

| 파일                                            | 내용                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `backend/test/helpers.ts`                       | `inSnapshot`: 한 연결의 `REPEATABLE READ` 트랜잭션, 앱 트랜잭션은 SAVEPOINT로, 끝나면 롤백하고 연결 반환 |
| `backend/test/recent-foods.integration.test.ts` | 세 테스트를 `inSnapshot` 안에서 실행하고, 확인을 목록 맨 앞 기준으로 엄격하게 바꿈                       |

## 확인

- **경합 상태 재현(위와 같은 방법):**
  - 고치기 전: 3번 모두 실패
  - 고친 뒤: 3번 모두 통과(3개 통과, 실패 0). 기록 프로세스는 이 동안 12만 건 넘게 넣고 지웠다.
- 경합 없이 돌려도 통과했다.
- 테스트가 끝난 뒤 `recent-test-` 음식이 DB에 남지 않았다(롤백 확인).
- **`npm run check` 5회 연속:** `TEST_DATABASE_URL=<임시 PG17 health_test>`로 돌렸다. 5회 모두 통과했다. 매번 백엔드 263개 통과(실패 0, 건너뜀 0), 프런트 526개 통과(2개 건너뜀).
  - 그 전에 한 번 돌린 5회 묶음에서는 2~5회째가 실패했다. 실행 중에 쓴 이 변경 기록 파일의 서식 검사(`prettier --check`) 때문이었고, 테스트 실패는 아니었다. 서식을 고친 뒤 5회를 처음부터 다시 돌렸다.
- 5회 뒤에도 `recent-test-` 음식이 DB에 남지 않았다.
- `origin/main`(7e24e08)을 병합한 뒤 `npm run check`: 통과(백엔드 263개 통과·건너뜀 0, 프런트 534개 통과·2개 건너뜀). `npm run knip`: 통과.

## 리뷰

### 1차 (독립 읽기 전용 리뷰)

- **[중간] `BEGIN …` 형태를 SAVEPOINT로 바꾸지 못함:** 처음 버전은 정확히 `'BEGIN'`인 문장만 바꿨다.
  - 하루 기록 읽기 API는 `snapshotRead`(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`)로 시작한다. 이런 API를 `inSnapshot` 안에서 부르면 SAVEPOINT 없이 `COMMIT`만 바뀌어 바깥 트랜잭션이 깨진다.
  - `BEGIN`·`START`로 시작하는 문장은 모두 SAVEPOINT로 바꾸도록 고쳤다.
  - SAVEPOINT마다 이름을 따로 붙이고 열린 순서대로 닫는다. 남은 SAVEPOINT를 대신 닫는 일이 없다.
  - 짝이 없는 `COMMIT`·`ROLLBACK`은 오류로 알린다.
  - 앱의 `ROLLBACK`은 `ROLLBACK TO SAVEPOINT` 뒤 `RELEASE SAVEPOINT`로 바꾼다.
- **[낮음] 끊긴 연결이 풀로 돌아감:** 끝의 `ROLLBACK`이 실패하면 `release(error)`로 넘겨 풀이 그 연결을 버리게 했다.
- **[낮음] 문서 오류:** 이 파일은 이미 `origin/main`에서 `testDatabaseSkip`을 쓰고 있었다. 바꿨다고 적은 문장을 지웠다. #134/#136 번호 표기도 맞췄다.
- **새 테스트 `backend/test/snapshot.integration.test.ts`:** `inSnapshot` 안에서 아래를 차례로 실행하고, 모두 정상인지 본다.
  1. 하루 읽기(`snapshotRead`). 아직 열린 SAVEPOINT가 없을 때다.
  2. 식사 기록(`BEGIN`/`COMMIT`)
  3. 없는 음식 기록(404, `ROLLBACK`)
  4. 다시 읽기, 다시 기록, 다시 읽기
  - 끝난 뒤 그날 기록이 DB에 남지 않는지도 본다.
  - 처음 helper로 돌리면 1단계가 500으로 실패한다. 처음에는 읽기를 404 뒤에 두었는데, 그때는 404가 남긴 같은 이름의 SAVEPOINT가 문제를 가려 처음 helper로도 통과했다. 그래서 읽기를 맨 앞으로 옮겼다.
- **알려 둘 것(고치지 않음):** 스냅숏 트랜잭션은 각 테스트가 끝날 때까지 `meal_entries`에 ROW EXCLUSIVE 잠금을 잡고 있다.
  - 그동안 combos·meal-copy 테스트의 `CREATE/DROP TRIGGER`는 기다리고, 그 뒤의 다른 기록도 줄을 선다.
  - 테스트 하나가 1초 안쪽이라 지연만 생기고 교착이나 실패는 없다(리뷰 확인).
- 리뷰가 문제없다고 확인한 것: 스냅숏 안에서 이 파일의 기록 id가 늘 가장 크다는 전제, 직렬화 오류나 교착이 생기지 않는 점, 세 테스트 확인의 정확성.
- 1차 리뷰 반영 뒤 `npm run check`: 통과(백엔드 264개 통과·건너뜀 0, 프런트 534개 통과·2개 건너뜀). `npm run knip`: 통과.
