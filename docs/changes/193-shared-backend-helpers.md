# #193 Extract shared backend helpers and drop the local serviceDate

- Issue: [#193](https://github.com/sirloinbh/health-log/issues/193)
- Branch: `refactor/193-shared-backend-helpers`

## Purpose

Several backend helpers had copies: `inTransaction` in `day-records.ts`, `combos.ts` and `visits.ts`; `serviceDate` in `app.ts` next to the managed `standard/http.ts` export (the tests checked only the copy); `optionalNumber` in five files plus `toNumber` in `report.ts`; `hasTwoDecimalsAtMost` twice; `likePattern` twice; and day arithmetic four times. A fix in one copy would not reach the others.

## Change — 2026-11-22

Behavior is unchanged; each helper now exists once.

| Helper                                                                | Now in                                 | Replaced copies                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inTransaction(pool, run, { setup, mapError })`, `Db`, `snapshotRead` | new `backend/src/db.ts`                | `day-records.ts`, the local wrappers in `combos.ts` and `visits.ts`                                                                               |
| `serviceDate`                                                         | managed `backend/src/standard/http.ts` | `app.ts` (deleted); `test/health.test.ts` and `test/medications.test.ts` now test the managed export                                              |
| `shiftDay`, `daysBetween`                                             | `backend/src/dates.ts`                 | `report.ts` (`shiftDay`), `body.ts` (`daysBetween`), `reminders.ts` (`addDays`), `day-records.ts` (`periodsOf` now steps weeks with `shiftDay`)   |
| `optionalNumber`, `hasTwoDecimalsAtMost`                              | new `backend/src/numbers.ts`           | `body.ts`, `combos.ts`, `foods.ts`, `goals.ts`, `meals.ts`, `report.ts` (`toNumber`); `habits.ts` and `meals.ts` no longer import from `foods.ts` |
| `likePattern`                                                         | `backend/src/text.ts`                  | `foods.ts`, `visits.ts`                                                                                                                           |

- `inTransaction` wraps the managed `withTransaction`, so a connection whose ROLLBACK fails is still released with `release(true)` and destroyed. The combo routes pass `mapError` to turn the unique-name error into the 409 they answered before.
- `day-records.ts` keeps only `periodsOf`.

Tests:

- `backend/test/transaction.test.ts` (new): the setup statement runs right after BEGIN and the work is committed; a failure rolls back and is rethrown unchanged; `mapError` replaces the error after the rollback; a failed ROLLBACK destroys the connection.
- `backend/test/dates.test.ts`: `shiftDay` across month, year and leap-day ends and backwards; `daysBetween` including negative spans; both unchanged under `America/Los_Angeles` on its daylight-saving day.
- `backend/test/text.test.ts`: `likePattern` escapes `%`, `_` and backslash.
- Existing route tests (combos 409, visits, reports, reminders, body range limit, periods) cover the call sites.

## Verification

- `rg "const inTransaction|function serviceDate|const optionalNumber|const hasTwoDecimalsAtMost|const likePattern" backend/src`: one definition each; `serviceDate` only in `standard/http.ts`.
- `node --import tsx --test` on the dates, transaction, text, day-records, health and medications tests: 31 passed.
- `npm run check` with `TEST_DATABASE_URL` pointing at a temporary PostgreSQL 17 cluster (`health_test`, all migrations applied by `npm run db:migrate`): passed.
  - Backend: 284 passed, 0 skipped (DB integration tests ran).
  - Frontend: 651 passed, 3 skipped (existing skips, unrelated).
  - Contract check 3 passed, skills check 4 passed; format, lint, typecheck and build passed.
