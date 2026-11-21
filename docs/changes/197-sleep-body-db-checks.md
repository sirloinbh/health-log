# #197 Add database checks for sleep duration and body memo

- Issue: [#197](https://github.com/sirloinbh/health-log/issues/197)
- Branch: `fix/197-sleep-body-db-checks`

## Purpose

`sleep_records` accepted any `duration_minutes` from 1 to 1440 even when it contradicted `wake_at - bed_at`, and `body_records.memo` had no length or blank check, while the API enforces both. Imports may write to these tables without the API (`003_sleep_records.sql`), so the database must hold the same rules. `body_records` also allowed a row with every value empty.

## Change — 2026-11-22

New migration `database/migrations/019_sleep_body_checks.sql` (018 is the audit log) with three named constraints:

| Constraint                             | Rule                                                                                                | Same rule in the API                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sleep_records_duration_matches_times` | `duration_minutes = round(extract(epoch FROM wake_at - bed_at) / 60)`                               | `sleepMinutes` in `backend/src/sleep.ts` (`Math.round` of the span in minutes; both round a half minute up for positive spans) |
| `body_records_memo_length`             | `memo` is NULL or 1 to 500 characters (`char_length`, so one emoji is one) and not only white space | `bodyInput.memo` in `backend/src/body.ts` (trimmed, at most 500, empty becomes NULL)                                           |
| `body_records_not_empty`               | at least one of weight, body fat, waist, systolic pressure or memo is set                           | `bodyInput`'s "Enter at least one value to save"                                                                               |

- A memo alone counts as a value, because the API saves a memo-only record; refusing it in the database would turn that save into a 500. The issue said "at least one measured value"; matching the API was chosen so both layers agree. Diastolic pressure needs no term: `body_records_pressure_pair` already ties it to systolic.
- Each constraint is dropped with `IF EXISTS` before it is added, so the file is safe to run again (the CI applies every file with psql first, then with the runner).
- Existing rows are not changed. A row that breaks a rule stops the migration with the constraint's name, and the runner rolls the file back, so a deploy stops instead of rewriting data whose meaning is unknown.

Tests (DB integration):

- `backend/test/sleep.integration.test.ts`: a direct INSERT whose duration is 449, 451 or 1 for a 7 h 29 min 30 s span fails with `sleep_records_duration_matches_times`; 450 (rounded up, as the API rounds) is stored.
- `backend/test/body.integration.test.ts`: an all-empty row fails with `body_records_not_empty`; a memo of `''`, only white space, or 501 characters fails with `body_records_memo_length`; a memo-only row of exactly 500 characters, ending in an emoji, is stored.

## Checking existing data

The rows this repository can see were all written through the API, which already follows these rules. Before deploying, the user can list rows that would stop the migration on a copy of the real data:

```sql
SELECT sleep_date FROM sleep_records
WHERE duration_minutes <> round(extract(epoch FROM wake_at - bed_at) / 60);
SELECT record_date FROM body_records
WHERE (memo IS NOT NULL AND (char_length(memo) NOT BETWEEN 1 AND 500 OR memo !~ '[^[:space:]]'))
   OR (weight_kg IS NULL AND body_fat_percent IS NULL AND waist_cm IS NULL AND systolic_mmhg IS NULL AND memo IS NULL);
```

## Verification

- On a scratch database built from migrations 001 to 018 with valid sleep and body rows: `psql -1 -f 019_sleep_body_checks.sql` applied, and a second run applied again without error. After inserting a sleep row with a wrong duration, the file stopped with `check constraint "sleep_records_duration_matches_times" ... is violated by some row`.
- `npm run db:migrate` on the temporary `health_test`: `Applied: 019_sleep_body_checks.sql`.
- `node --import tsx --test test/sleep.integration.test.ts test/body.integration.test.ts` with `TEST_DATABASE_URL` on that database: 17 passed.
- `npm run check` with `TEST_DATABASE_URL` pointing at the temporary PostgreSQL 17 cluster (`health_test`), first run: backend 279 passed, 0 skipped (DB integration tests ran); frontend 655 passed, 3 skipped, 1 failed. The failure was `frontend/src/daily.test.tsx` "the main menu opens the day the server counts as today" (an element not found within the time limit while the machine was loaded); this PR changes no frontend file, and the same file passed alone (`vitest run src/daily.test.tsx`: 28 passed). Contract 3 and skills 4 passed.
- A second full `npm run check` was stopped by Claude Code because the machine ran low on memory; it has not been run again yet.
- Not done here: applying 019 to a copy of the real production data (the issue's done criterion). Only the user can reach that data; see the queries above.
