# #27 Saving sleep records and manual entry

- Issue: [#27](https://github.com/sirloinbh/health-log/issues/27)
- Branch: `feat/27-sleep-records`

## Purpose

Save sleep by date regardless of the Garmin integration, and enter, edit, and delete the days that are missing by hand.

## Changes: 2026-11-01

- **DB:** `database/migrations/003_sleep_records.sql`. One row per date, and the primary key is `sleep_date`. Bedtime and wake time are `timestamptz`, and the length is `duration_minutes` (the point-in-time and duration format of the central rule). The sleep stage and score columns are the items to store from #26, and are empty until #28. A missing value is `NULL`, not 0.
- **API:** `backend/src/sleep.ts`. `GET` (`{ record: null }` if there is none), `PUT` (overwrites the same day), `DELETE` (404 if there is none) on `/api/sleep/:date`. The request rate limit is applied in the same way as the food API.
- **Server validation:** times accept only ISO 8601 with an offset. The wake time must be later than the bedtime, the length must be 24 hours or less, and the wake date (in the service time zone) must equal the date in the path. The DB enforces that the wake time is later than the bedtime, that the length is 24 hours or less, and the value range of each column. The server is in charge of whether the record date and `duration_minutes` match the times.
- **Screen:** `frontend/src/sleep.tsx`. Changed the sleep area of the daily record into an entry, summary, edit, and delete card. If loading fails, the entry form is hidden, so that we do not overwrite a record we could not see.
- **Cleanup:** moved the date check `isRealDate` to `backend/src/dates.ts` and share it. Fixed the test helper `withApi` so that it can read a 204 with no body.

## What we decided

The rules that were not in the issue were decided as follows. The record date follows the recommendation of #26, and the input method follows the midnight-crossing standard of the central rule. The one-per-day rule and the manual edit rule are the agent judgement, and we recorded them in a #27 comment and went on without user confirmation. If the user says to change them, we fix them in a follow-up issue.

- **Record date:** the date you woke up (the #26 recommendation).
- **Input method:** enter only two times. If the bedtime is later on the clock than the wake time, it counts as the previous day. While you type, it shows "fell asleep at 23:30 the previous day, 7 hours 30 minutes". A nap from 13:00 to 14:00 is on this day, and you cannot enter sleep longer than 24 hours.
- **Total sleep time:** as in the issue, the whole length from bedtime to wake time. The time awake in between is not subtracted.
- **One per day:** a nap and night sleep of the same day are not stored separately.
- **Manual edit:** if you change the times of an imported record, the source becomes `manual` and the stages and the score are deleted, because they no longer fit once the times change. The form tells you in advance, and if you save without changing the times, no request is sent.
- **Future dates:** not blocked. The range is decided in #50.

## Follow-up

- **#50:** the server judges the wake date with `Asia/Seoul`, so dates in 1987-88 and before 1961 are calculated with a different offset and may be rejected. Look at it together when the date range is decided.
- **#28:** we must decide whether the import overwrites a record the user entered by hand. Showing the stages and the score is also added in #28.

## First review fixes: 2026-11-01

We fixed the findings of the independent review in this PR.

- **Focus on the edit button:** pressing it dropped focus to `body`. It now moves to the card title.
- **Loss of an imported record:** saving with no change erased the stages and the score. It now sends no request, and the form has a notice that they will be erased. The problem that a record of exactly 24 hours could not be saved again was solved too.
- **Test gap:** replaced the always-passing past-date response test with a test that goes through the whole app. Added tests for double save, the delete failure message, the request rate limit, and wake at midnight.
- **500 on a large offset:** PostgreSQL rejected a value such as `+16:00` and gave a 500. We now pass it to the DB converted to UTC.
- **A save failure after leaving the date:** it vanished silently. It is now reported with a toast together with the date.
- **Display of dates before 1989:** the input was `+09:00` and the display was `Asia/Seoul`, so the times differed. The display also uses the fixed offset now.
- **DB constraint:** added the 24-hour limit to the DB too. Fixed the "same constraint" wording in the docs to match reality.
- **Screen rules:** the save button uses the shared `Spinner`, and the `aria-live` area of the preview is always present.

## Second review fixes: 2026-11-01

- **500 on an input a few seconds over 24 hours:** the DB constraint added in the first fixes looks at the exact length, and the server looked at the rounded minutes, so 24 hours 20 seconds became a 500. The server now judges by the exact length too. A sleep shorter than 30 seconds is rejected with a "1 minute or more" message.
- **Test gap:** added tests for the `Spinner` while saving and for the preview area existing from the start.
- **Docs:** fixed the DB constraint description and the place of the skipped test. We copied the date judgement for dates before 1989 into a #50 comment.

## Verification

- Tests added: `backend/test/sleep.test.ts`, `backend/test/sleep.integration.test.ts`, `frontend/src/sleep-time.test.ts`, `frontend/src/sleep.test.tsx`, `frontend/src/daily.test.tsx` (loading by date)
- The done criterion 23:30 to 07:00 = 7 hours 30 minutes was checked on both the server and the screen.

- `npm run check` (with a temporary DB): passed. 61 backend tests passed, 0 skipped. 123 frontend tests passed, 2 skipped (the conditions for the dark-only app in `lib/theme.test.ts` and `components/layout/app-shell.test.tsx`, unrelated to this change). 4 skill checks passed
- `npm run knip`, `npm run standards:check`: passed

### DB integration tests

The DB account on this PC cannot create `health_test`, so we started a PostgreSQL 17 cluster separately in a temporary folder with `initdb` and created `health_test` there. We did not touch the existing DB, and we deleted it after the check.

- Applied 3 migrations, and running `003` again also passed
- With `TEST_DATABASE_URL` pointing to the temporary DB, `npm run test -w backend`: 61 passed, 0 skipped

### Browser check

We drove headless Chrome with CDP. The API is a real server and the DB is the temporary cluster above. Times are entered not by keyboard but by setting the value and firing the input event.

| Item                                                          | 390×844 | 1440×900 |
| ------------------------------------------------------------- | ------- | -------- |
| The entry form on a day with no record                        | pass    | pass     |
| The notice when saving an empty value                         | pass    | pass     |
| "Fell asleep at 23:30 the previous day, 7 hours 30 minutes"   | pass    | pass     |
| The server error message when saving the same time            | pass    | pass     |
| The summary after saving and the focus move                   | pass    | pass     |
| The record stays after a reload                               | pass    | pass     |
| An edit is applied, and an empty form on another day          | pass    | pass     |
| Delete confirmation, and the form and focus move after delete | pass    | pass     |
| Horizontal overflow, console errors                           | none    | none     |

After the first review fixes and the merge of `main` (zod 4.6.7), we ran it again, and all 3 runs passed the items above. Once before that, the check script failed because it did not wait for the reload to finish, and it did not happen after we fixed the script.

We also confirmed that the past-date response test fails if `key={date}` is removed.

We did not check a real phone, dark mode, or a screen reader.
