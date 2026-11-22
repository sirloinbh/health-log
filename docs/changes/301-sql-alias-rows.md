# #301 Return API-shaped rows with SQL aliases and drop rename-only row mappers

- Issue: [#301](https://github.com/sirloinbh/health-log/issues/301)
- Branch: `refactor/301-sql-alias-rows`
- Parent: #188 Consistent backend data layer (reopened for this work)
- Source: architecture review 2026-11-18, finding H8 and refactoring plan step 3

## Purpose

Most backend reads declared a `Row` type in database column names and a `toX` mapper that copied each `snake_case` column to its `camelCase` API name. Several row types also declared `count(*)` results as strings and wrapped them in `Number(...)`, although `setInt8Parser` (managed `backend/src/standard/db.ts`) already returns int8 as a number. The queries now name their columns as the API does (`weight_kg AS "weightKg"`), so a row is already the response.

The NUMERIC rule stays as it is: `standard/db.ts` keeps NUMERIC (type 1700) as a string on purpose, and no NUMERIC type parser is added. The one real conversion left, NUMERIC string to number, goes through one shared helper.

## Change 1 – shared helper and record routes (2026-11-22)

- `backend/src/numbers.ts`: adds `withNumbers(row, keys)`, which converts only the named NUMERIC columns of an aliased row (null stays null) and types them as `number` or `number | null`. `optionalNumber` stays for single values.
- `checks.ts`: `CheckRow` and `toRecord` are gone; the record query aliases its columns. The rate counts are typed as numbers and lose their `Number(...)`.
- `sleep.ts`: `SleepRow` and `toRecord` are gone. `bed_at` and `wake_at` come back as `Date`, and `res.json` writes a `Date` with `toJSON`, which is `toISOString`, so the response text is unchanged (`2026-03-14T14:30:00.000Z`).
- `body.ts`: the query aliases its columns; the mapper is now `withNumbers` on the three NUMERIC measures.
- `goals.ts`: `GoalRow` and `toGoal` are gone (`effective_from AS "from"`). The day's meal sums, sober-week counts, sleep minutes and checks come back under their API names; counts lose `Number(...)`; the two NUMERIC sums still use `optionalNumber`.
- `reminders.ts`: each query selects its `kind` and aliased columns, so the two row lists are merged and sorted with no mapping.
- `visits.ts`: `VisitRow` and `toVisit` are gone.
- `medications.ts`: `MedicationRow` and `toMedication` are gone. The linked visit is built in SQL with `json_build_object` (null when there is no visit); PostgreSQL writes its date as `YYYY-MM-DD` and its id as a JSON number, and pg parses the json.
- `backend/test/sleep.test.ts`: the fake pool now returns the aliased row the query returns, and the test also checks that `bedAt` and `wakeAt` are still ISO strings.
- `backend/test/numbers.test.ts` (new): `withNumbers` converts only the named columns, keeps NULL as null, and does not change the row it was given.

## Verification

- Backend tests against a throwaway PostgreSQL 17 (`initdb` in a temp folder, port 5473, `health_test` migrated with `backend/src/migrate.ts`): 300 tests, 300 passed, 0 failed, 0 skipped. This includes the DB integration tests for checks, sleep, body, goals, reminders, visits and medications, which compare the whole API responses.
- Before the fixture update, `sleep.test.ts` failed (`undefined !== 480`), which showed the fake row still in column names.
- `TEST_DATABASE_URL= npm run check`: passed. Backend: 295 tests, 158 passed, 0 failed, 137 skipped (the DB tests, which ran in the throwaway run above; CI runs them too). Frontend: 76 files, 786 passed, 3 skipped. Format, lint, contract, typecheck, skill tests and build passed. (The throwaway run with a database counted 300 tests, this one 295.)

## Fix – knip unused export (2026-11-22)

- CI `verify` failed in `npm run knip` (not part of `npm run check`): "Unused exported types (1) WithNumbers backend/src/numbers.ts". The type is only used inside `numbers.ts`, so it is no longer exported.
- `npm run knip` (with `TEST_DATABASE_URL` set to the throwaway DB, which `playwright.config.ts` needs to load): exit 0; only the three configuration hints that main already prints remain.

## Limits and follow-up

- Food and meal routes (`foods.ts`, `meals.ts`, `combos.ts`, `habits.ts`, `report.ts`) are the next PR under the same issue.
