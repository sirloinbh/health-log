# #37 Daily checks for diet adherence and sleep satisfaction

- Issue: [#37](https://github.com/sirloinbh/health-log/issues/37)
- Branch: `feat/37-daily-checks`

## Purpose

Numbers alone do not show at a glance whether the day went as planned. Check by day whether the diet was kept and whether sleep was good. Also see the achievement rates of the week and month that contain that day.

## Decisions

The recommendation in the issue was followed and decided without asking the user. The same content was left as an issue comment.

- **Judgment:** The user checks yes or no directly. Automatic judgment will be considered when the goals feature (#45) exists.
- **Questions:** "식단을 지켰나요?" (Did you keep your diet?) (kept / not kept), "잠을 잘 잤나요?" (Did you sleep well?) (slept well / did not).
  - Each question can be left as "체크 안 함" (not checked).
  - A question that is not checked is not counted as "no".
- **Memo:** Up to 200 characters. A day with only a memo is also saved. The unit for counting length is decided in #92.
- **Achievement rate:** The denominator is the number of days on which that question was answered. The periods are the same as #36 (week Monday to Sunday, month 1st to the last day, Asia/Seoul calendar dates).
  - A period with no answered day is "기록 없음" (no record), not 0%.
  - The percentage is rounded.

## Change — 2026-11-05

- **DB** `database/migrations/009_day_checks.sql`: Creates `day_checks` (date, diet kept, sleep satisfied, memo).
  - For the two checks, `NULL` means not checked.
  - The DB rejects a row with no values, an empty memo, and a memo over 200 characters.
- **API** `backend/src/checks.ts`, `backend/src/app.ts`
  - `GET /api/checks/:date`: Gives that day's checks and the week and month achievement rates (the number of answered days and the number of "yes") from one snapshot.
  - `PUT /api/checks/:date`: Replaces the whole day, and in the same transaction reads the achievement rates again and returns them.
  - `DELETE /api/checks/:date`: 404 if there is no record.
  - A request rate limit is applied. Error messages are in Korean.
- **Shared** `backend/src/day-records.ts`: The transaction function and the week and month calculation of #36 were moved here so both features share them. `habits.ts` was changed to use this file with no behavior change. The period calculation tests were also moved to `backend/test/day-records.test.ts`.
- **Screen** `frontend/src/checks.tsx`, `frontend/src/check-text.ts`, `frontend/src/daily.tsx`
  - Replaced the "하루 체크" (daily check) placeholder in the daily record with a real card.
  - Each question has three buttons (`aria-pressed`) and a memo field. It supports view, edit, and delete through a confirmation.
  - The "이 주" (this week) and "이 달" (this month) achievement rates are shown like `1/2일 지킴 (50%)` (kept 1 of 2 days (50%)).

## Checks

- Tests
  - `backend/test/checks.test.ts`
    - Rejects values that are not yes or no (`'true'`, `1`, `0`, `'yes'`).
    - Rejects the 200-character memo limit, the NUL character (U+0000, added after the first review), and an empty request.
    - Checks the 404 for a date that does not exist and for deleting a day with no record.
    - A rejected request does not reach the DB.
  - `backend/test/checks.integration.test.ts`
    - A day that is not checked is not counted.
    - A day with only one question answered goes only into the denominator of that question, and a day with only a memo goes into no denominator.
    - Saving again also clears the fields that were emptied.
    - Totals break at the week boundary (1990-04-01 Sunday / 04-02 Monday) and the month boundary (04-30 / 05-01).
    - Checks delete and the 404 of a second delete.
    - Checks the DB constraints.
  - `backend/test/day-records.test.ts`: The 2 period calculation tests moved from #36.
  - `frontend/src/check-text.test.ts`: Checks the text for not checked, yes, and no, the achievement rate text, "기록 없음" when there is no answered day, and rounding.
  - `frontend/src/checks.test.tsx` (9 at first, 12 after the first review, 13 after the second review)
    - Checks the defaults for an empty day.
    - If only one question is answered, the other is sent as `null`.
    - Saving two "no" answers and a memo trims the whitespace around the memo.
    - If there is nothing, it is rejected before sending.
    - When editing, it fills the existing answers, an answer can be set back to "체크 안 함", and focus moves.
    - Checks cancelling, delete after confirmation with the re-read of achievement rates, a server rejection, and retry after a load failure.
  - `frontend/src/daily.test.tsx`: The fake server now also answers the requests of the new card.
- On a temporary PostgreSQL 17 cluster (port 5467), the 9 migrations were applied twice to `health_test`. The second time had no errors either.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5467/health_test npm run check`: passed.
  - Backend: 151 passed, 0 skipped.
  - Frontend: 301 passed, 2 skipped. The 2 skipped are condition tests for the dark-only app, unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

### Browser check

A real API (3993) and Vite (5203) were started on the temporary DB, and headless Chrome was driven over CDP. Buttons were pressed with mouse events and the memo was entered by key input.

| Item                                                                                                                  | 320×700 | 390×844 | 1440×900 |
| --------------------------------------------------------------------------------------------------------------------- | ------- | ------- | -------- |
| "기록 없음" (no record) on an empty day; after saving diet kept and a memo, sleep stays as "체크 안 함" (not checked) | Pass    | Pass    | Pass     |
| Three days of the same week (kept + not checked, both no, only slept well) gives diet 1/2 days, sleep 1/2 days        | Pass    | Pass    | Pass     |
| Existing answers filled when editing; setting diet "no" back to "체크 안 함" gives diet 1/1 days                      | Pass    | Pass    | Pass     |
| Rates recalculated after deleting through the confirmation dialog                                                     | Pass    | Pass    | Pass     |
| No horizontal overflow, no console errors                                                                             | Pass    | Pass    | Pass     |

## First review — 2026-11-05

The independent review had no high or medium points. What was confirmed: the aggregation SQL (`count(column)` and `FILTER`), the overwrite save, the snapshot read, memo trimming, rounding, the migration, unchanged behavior after moving `habits.ts`, accessibility, and the document content. 7 low points came up.

- **There was no test for the 200-character memo boundary.**
  - Applied: An integration test checks that a memo of exactly 200 characters with whitespace around it is trimmed and saved. It checks that 201 characters gives 400.
  - Applied: It is checked that the DB accepts 200 characters.
- **The memo field did not tell about the limit.**
  - Applied: Added the guidance "200자까지 쓸 수 있습니다." (You can write up to 200 characters.) and linked it with `aria-describedby`. A test was added.
- **The notice for a save that failed after moving to another date had no test.**
  - Applied: The card is closed during saving and made to fail, and the notice text is checked.
- **While saving, the answer buttons and the memo could be changed.** The changed values did not go into the save already sent.
  - Applied: Both are blocked while saving. After the second review, the memo field was changed from `disabled` to `readOnly`. It is checked that they are released again on failure.
- **A NUL character in the memo gave 500.**
  - Applied: The daily check memo is rejected with 400 "메모에 쓸 수 없는 문자가 있습니다" (the memo has a character that cannot be used). A test was added.
  - Other fields such as the body memo were split into [#92](https://github.com/sirloinbh/health-log/issues/92).
- **The memo length unit (UTF-16 versus character count) differs.** The body record is the same and it spans several features, so it was split into [#92](https://github.com/sirloinbh/health-log/issues/92).
- **A slow "retry" response can overwrite a new response.** The body and alcohol/tobacco cards are the same, so it was split into [#92](https://github.com/sirloinbh/health-log/issues/92).

### First round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 152 passed, 0 skipped.
  - Frontend: 304 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Second review — 2026-11-05

The 5 fixes of the first round were confirmed to be correct, and reverting each makes its test fail. Moving `habits.ts` also did not change behavior. There was no defect that blocks merging, and all 3 low points were applied. Reviews are limited to two rounds, so no more are done.

- **If saving with Enter in the memo failed, focus fell to `body`.** This was because the memo field was `disabled` during saving.
  - Applied: The memo field was changed to `readOnly`.
  - Test: It is checked that the memo field is `readonly` during saving. If reverted, this test fails.
  - Test: A focus test after failure was also added. However, jsdom does not remove focus from a field that became `disabled`, so this test alone does not catch a revert.
  - Confirmed: In real Chrome (390×844), a memo was typed by keys and Enter was pressed, and then the server was made to answer 500. Focus stayed on the memo field both during saving and after the failure.
- **The NUL notation in the #92 body was broken.**
  - Applied: Fixed to `U+0000`. Writing `\u0000` broke again as it passed through the GitHub CLI, so it was written without escape notation.
- **The "Checks" list above was missing the NUL test.**
  - Applied: Added it to the list.

### Second round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 152 passed, 0 skipped.
  - Frontend: 305 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Limits and follow-ups

- The check items are fixed at two. A feature for the user to define the items is out of scope.
- Automatic judgment (diet target calories, sleep time, and so on) is handled in the #45 goals feature.
- Dark mode, a real phone, Firefox, and Safari were not checked.
- `day_checks` must be added to the row count comparison list of backup restore in PR #68.
