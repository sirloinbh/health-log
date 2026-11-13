# #134 Race failure in the food list paging integration test

- Issue: [#134](https://github.com/sirloinbh/health-log/issues/134)
- Branch: `fix/134-foods-paging-flaky`

## Purpose

"with 150 matching foods, paging reaches every one exactly once" in `backend/test/foods.integration.test.ts` sometimes failed with `451 !== 450`. It passed on rerun. This PR makes the result the same whatever other test files write. Only the test file is fixed, not the app code.

## Cause

- The end of this test paged through the whole food list through the API without a search term, and compared that count with the `SELECT count(*) FROM foods` counted just before.
- `tsx --test` runs test files at the same time. So if another file added or deleted foods in between, the count went out of step. The files that add foods are combos, junk, meals, meal-copy, recent-foods, and text.
- If an added food sorts before the position being read, the page boundary shifts. Then the same food could appear twice or be missed.

## Decisions

- The whole-list check is behavior that must be kept (#67: you can see it to the end even without a search term). So it was not removed, and it was made to **read from the DB state of a single point in time**.
- It was not covered up with serial execution or retries. Narrowing the range with a search term does not fit this part, because what is being checked is the behavior without a search term. The earlier part with a search term is already narrowed with a name prefix used only by this test (`integration-test-paging-`).

## Change — 2026-11-08

- `backend/test/foods.integration.test.ts`
  - The whole-list check is done inside a `REPEATABLE READ` transaction on one connection. That connection is also passed to the API (`withApi`) instead of the pool. So the list the API reads and the comparison reference see the same snapshot. It does `ROLLBACK` at the end.
  - What compared only counts was changed to compare **the whole list of ids, including the sort order** (`ORDER BY name, brand NULLS FIRST, id`). A duplicate or a miss shows up right away.

## Check of the same pattern

- The other integration tests that use `count(*)` are all narrowed in range, so they do not race.
  - The checks of public, franchise, and Bibigo data in `foods.integration.test.ts` are narrowed by source URL or brand. Other test files do not add such foods.
  - `habits.integration.test.ts` is narrowed by its own dates, and `visits.integration.test.ts` by its own visit ids.
- The other tests that use list APIs are also narrowed in range.
  - combos, medications, reminders, and visits find or filter by their own tag.
  - The paging test of visits is narrowed with a tag search term.
- **Remaining risk (not fixed in this PR):** `/api/foods/recent`, which `recent-foods.integration.test.ts` reads, is a global "latest 10" list with no range argument.
  - If, after this file records, another file first records 8 or more different foods, its own foods can be pushed out of the list and it can fail. With the number of foods other files record now, this is rare.
  - Fixing it would need app code changes such as adding a range argument to the API, so it is outside the boundary of this PR (test files only).

## Check

- **Reproduction before and after the fix:** another process was made to keep adding and deleting foods that sort first (`aaa-noise-N`). In that state this test alone was run 3 times each.
  - Before the fix (the test on `origin/main`): it failed all 3 times.
  - After the fix: it passed all 3 times.
  - The temporary script and the copy of the old test were deleted.
- **`npm run check` 6 times in a row:** run with `TEST_DATABASE_URL=<temporary PG17 health_test>`. It passed all 6 times. Each time backend 263 passed (0 failed, 0 skipped), frontend 513 passed (2 skipped).
- `npm run knip`: passed.
- After checking, the temporary DB was shut down.

## Review

### First (independent read-only review)

- **[low] If `ROLLBACK` fails in the cleanup step, the connection is not returned:** if the connection is broken, `ROLLBACK` fails too. Then the original error is hidden and `release()` does not run, so `pool.end()` in `after()` could keep waiting. Like the transaction handling in the app code, it was changed to swallow the `ROLLBACK` failure and always `release()`.
- What the review confirmed has no problem
  - The `GET /api/foods` path uses only `pool.query`.
  - `REPEATABLE READ` keeps the snapshot of the time of the first statement.
  - The test and the API have the same sort criteria, and ids are unique, so the order is fully determined.
  - The name prefix of the earlier part is used only by this test.
  - The result of the check of other files is also correct (the whole reads of `/api/combos` and `/api/goals` do not race either).
- After the changes, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (including the latest main, backend 263 passed, 0 skipped, frontend 526 passed, 2 skipped). `npm run knip`: passed.
- No second review was done. Only one line of cleanup changed, and the first review confirmed everything else.
