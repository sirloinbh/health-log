# #137 Prevent the race in the recent foods integration test

- Issue: [#137](https://github.com/sirloinbh/health-log/issues/137)
- Branch: `fix/137-recent-foods-race`

## Purpose

`GET /api/foods/recent`, which `backend/test/recent-foods.integration.test.ts` reads, is the "latest 10" list of the whole DB. `tsx --test` runs test files at the same time. So if, after this file records, another file records several different foods before it reads, the foods of this file can be pushed out of the list and it can fail. This is the problem written under "remaining risk" in the change record of #134. The app code and the screen behavior (global latest 10) are not changed.

## Reproduction

- Another process was made to keep inserting meal records with 20 foods from the store and to delete them periodically (date 1983-07-07). In that state only this file was run 3 times.
- Before the fix (`origin/main` 6ce385a): **it failed all 3 times.** Each time 2 of 3 failed.
  - "each food shows once…": none of this file's foods is in the list (`actual: []`).
  - "a food removed from the store no longer shows": the food that was kept is not in the list.
- "typed-in food takes none of the ten places" passed because it only checked that the list had 10 items. It could not confirm that those 10 were this file's foods.

## Decisions

- **Only the test is fixed.** As in #134 (PR #136), it is done inside a `REPEATABLE READ` transaction on one connection. But #134 only read, and this time both recording (the API's `POST /api/meals`) and reading are done inside it. It does `ROLLBACK` at the end.
  - The snapshot is fixed at the first statement of the transaction. Records that another file commits after that are not visible.
  - Records inserted in this transaction get a sequence value after the snapshot. So their ids are larger than any record the snapshot sees. The list is in `max(id)` order, so this file's foods are always at the front.
- **The API's transaction is changed to SAVEPOINT.** The meal record API uses `BEGIN`/`COMMIT` after `pool.connect()`. The test pool returns the same connection. A statement that starts with `BEGIN` (including `snapshotRead`) is changed to `SAVEPOINT`, `COMMIT` to `RELEASE SAVEPOINT`, and `ROLLBACK` to `ROLLBACK TO SAVEPOINT` followed by `RELEASE SAVEPOINT` (widened after the first review). The app's recording path runs as it is.
  - The options of `BEGIN` are dropped. The isolation level is that of the snapshot, and `READ ONLY` is not enforced. A mistake of writing on a read-only path is not exposed inside this helper.
  - This handling was put together as `inSnapshot` in `backend/test/helpers.ts`. There is one connection, so requests must be sent one at a time. This file waits for every request in turn.
- **The checks were made strict.** Now it is guaranteed that the front of the list is this file's foods. So checks that picked out only this file's foods now compare the order directly.
  - It checks that the first 3 are in the expected order.
  - The 10-item test checks that the 10 are exactly the foods this file recorded, in recent order.
  - The deleted-food test checks that the food that was kept is at the front.
- **Serial execution and retries were not used.**
- Fixed along with it: all records are rolled back, so the cleanup in `after()` was removed. The cleanup in `before()` was kept to delete data left by an old version.

## Change — 2026-11-08

| File                                            | Content                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/test/helpers.ts`                       | `inSnapshot`: a `REPEATABLE READ` transaction on one connection, the app's transactions as SAVEPOINT, rolled back at the end and the connection returned |
| `backend/test/recent-foods.integration.test.ts` | Runs the three tests inside `inSnapshot`, and makes the checks strict based on the front of the list                                                     |

## Check

- **Reproducing the race (same method as above):**
  - Before the fix: failed all 3 times
  - After the fix: passed all 3 times (3 passed, 0 failed). The recording process inserted and deleted more than 120,000 records meanwhile.
- It also passed when run without the race.
- After the tests ended, no `recent-test-` foods were left in the DB (rollback confirmed).
- **`npm run check` 5 times in a row:** run with `TEST_DATABASE_URL=<temporary PG17 health_test>`. It passed all 5 times. Each time backend 263 passed (0 failed, 0 skipped), frontend 526 passed (2 skipped).
  - In a batch of 5 run once before that, runs 2 to 5 failed. This was because of the format check (`prettier --check`) of this change record file that was written during the run, not a test failure. After fixing the format, the 5 runs were redone from the start.
- After the 5 runs too, no `recent-test-` foods were left in the DB.
- After merging `origin/main` (7e24e08), `npm run check`: passed (backend 263 passed, 0 skipped, frontend 534 passed, 2 skipped). `npm run knip`: passed.

## Review

### First (independent read-only review)

- **[medium] The `BEGIN …` form was not changed to SAVEPOINT:** the first version changed only a statement that was exactly `'BEGIN'`.
  - The daily record read API starts with `snapshotRead` (`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`). If such an API is called inside `inSnapshot`, only `COMMIT` is changed without a SAVEPOINT, and the outer transaction breaks.
  - It was fixed to change every statement that starts with `BEGIN` or `START` to SAVEPOINT.
  - Each SAVEPOINT gets its own name and is closed in the order it was opened. It never closes a remaining SAVEPOINT on someone else's behalf.
  - A `COMMIT` or `ROLLBACK` with no match is reported as an error.
  - The app's `ROLLBACK` is changed to `ROLLBACK TO SAVEPOINT` followed by `RELEASE SAVEPOINT`.
- **[low] A broken connection returned to the pool:** if the final `ROLLBACK` fails, it is passed as `release(error)` so the pool discards that connection.
- **[low] Document error:** this file already used `testDatabaseSkip` on `origin/main`. The sentence that said it was changed was removed. The #134/#136 numbering was also corrected.
- **New test `backend/test/snapshot.integration.test.ts`:** inside `inSnapshot` it runs the following in order and checks that all are normal.
  1. A daily read (`snapshotRead`), when no SAVEPOINT is open yet.
  2. A meal record (`BEGIN`/`COMMIT`)
  3. Recording a food that does not exist (404, `ROLLBACK`)
  4. Read again, record again, read again
  - It also checks that no record of that day is left in the DB after it ends.
  - Run with the first helper, step 1 fails with 500. At first the read was placed after the 404, but then a SAVEPOINT with the same name left by the 404 hid the problem and it passed even with the first helper. So the read was moved to the front.
- **To be aware of (not fixed):** the snapshot transaction holds a ROW EXCLUSIVE lock on `meal_entries` until each test ends.
  - Meanwhile the `CREATE/DROP TRIGGER` of the combos and meal-copy tests waits, and other records after that also queue.
  - One test takes under a second, so there is only a delay and no deadlock or failure (confirmed by the review).
- What the review confirmed has no problem: the premise that this file's record ids are always the largest inside the snapshot, that no serialization error or deadlock happens, and that the checks of the three tests are exact.
- After the first-review changes, `npm run check`: passed (backend 264 passed, 0 skipped, frontend 534 passed, 2 skipped). `npm run knip`: passed.

### Second (independent read-only review)

- There was no blocking problem. Two low-severity items were fixed.
  - **An error from the helper could hide the app's original error:** for an unmatched `COMMIT` or `ROLLBACK`, the helper threw an exception right away. The app's `query('ROLLBACK').catch(...)` could not catch it and the original error could be overwritten. `query` was made async so that such a mistake also comes back as a rejected promise, like a failed query.
  - **A failed BEGIN left its name:** the name is now put into the open list only after `SAVEPOINT` has succeeded.
- That `READ ONLY` is not enforced was written in the helper comment and in this record.
- After the second-review changes:
  - `npm run check`: passed (backend 264 passed, 0 skipped, frontend 534 passed, 2 skipped)
  - `npm run knip`: passed
  - The same race reproduction was run 3 times. While the recording process inserted 68,000 records, it passed all 3 times (4 passed, 0 failed).
