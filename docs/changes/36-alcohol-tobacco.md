# #36 Alcohol and tobacco records with period totals

- Issue: [#36](https://github.com/sirloinbh/health-log/issues/36)
- Branch: `feat/36-alcohol-tobacco`

## Purpose

Alcohol and tobacco are not captured by meal records. Record them by date, and see the totals of the week and month that contain that day on the daily record screen.

## Decisions

The recommendation in the issue was followed and decided without asking the user. The same content was left as an issue comment.

- **Tobacco:** Cigarettes per day (0 to 200, an integer). Empty means not recorded, and 0 means did not smoke.
- **Alcohol:** The alcohol drunk in a day is entered as several lines of type, amount, and unit.
  - Types: soju (소주), beer (맥주), wine (와인), makgeolli (막걸리), spirits (양주), other (기타).
  - Units: glass (잔), bottle (병), can (캔).
  - Amount: more than 0 and up to 99, to two decimal places.
  - The same type and unit can be used on only one line per day. At most 20 lines per day.
- **Telling a day not recorded from 0:** For alcohol, choose among "not recorded / did not drink / drank" (기록 안 함 / 안 마심 / 마심). Tobacco and alcohol can be recorded separately.
- **Calories:** Alcohol calories are not calculated. They are not mixed into the meal totals either.
- **Periods:** A week is Monday to Sunday, and a month is the 1st to the last day. Dates are used as calendar dates in the service time zone (Asia/Seoul).
- **Totals:**
  - For tobacco, the number of days recorded and the total cigarettes are shown.
  - For alcohol, the number of days recorded, the number of days drunk, and the total amount per type and unit are shown.
  - Glasses and bottles cannot be converted into each other, so they are not added together.
  - A period with no recorded day shows "no record" (기록 없음), not 0.

## Change — 2026-11-05

- **DB** `database/migrations/008_habit_records.sql`
  - `habit_days` table: date, cigarettes, and whether alcohol was recorded. The DB rejects a row where both are empty.
  - `habit_drinks` table: the alcohol list per date. The DB also enforces the type, unit, amount range, and no duplicate of the same type and unit. When the date row is deleted, they are deleted with it.
  - The alcohol list is attached only to days when alcohol was recorded. The DB enforces this with the composite foreign key `(record_date, drinks_recorded)` and `CHECK (drinks_recorded)` (added after the first review).
- **API** `backend/src/habits.ts`, `backend/src/app.ts`
  - `GET /api/habits/:date`: Returns that day's record and the week and month totals at once.
  - `PUT /api/habits/:date`: Replaces the whole day. The date row, the replacement of the alcohol list, and the re-read of totals are in one transaction. Saves for the same day take turns with an advisory lock (added after the second review).
  - `DELETE /api/habits/:date`: 404 if there is no record.
  - A request rate limit is applied like the other routers. Error messages are in Korean.
- **Screen** `frontend/src/habits.tsx`, `frontend/src/habit-text.ts`, `frontend/src/daily.tsx`
  - Replaced the "술·담배" (alcohol and tobacco) placeholder in the daily record with a real card.
  - Input: cigarettes, three alcohol record states, and the list of alcohol drunk (add and remove). A new line starts with a type not yet used, and when all six types are used, it starts with a type and unit pair not yet used.
  - Checks before saving: number format, integer, cigarettes at most 200, an amount more than 0 and up to 99, two decimal places, duplicate of the same type and unit, and the case where nothing is recorded.
  - View: the saved values, edit, and delete through a confirmation. Below, the "이 주" (this week) and "이 달" (this month) totals are shown.
  - On a narrow screen, the alcohol amount, unit, and remove button wrap together as one group.

## Checks

- Tests
  - `backend/test/habits.test.ts`: Checks all input validation and that a rejected request does not reach the DB. It also checks the 404 for a date that does not exist and for deleting a day with no record.
    - Week and month calculation: checks Sunday, Monday, a week that crosses a year, and February of a leap year.
    - Checks that the same periods come out even when the server time zone (`TZ`) is changed to Asia/Seoul, America/Los_Angeles, Pacific/Kiritimati, and UTC.
  - `backend/test/habits.integration.test.ts`
    - A day with no record gives totals as "unknown".
    - Tobacco 0 and "did not drink" are told apart from no record. A day with only tobacco and a day with only alcohol are also checked.
    - Saving again replaces the alcohol list and keeps the order.
    - Totals break at the week boundary (1990-04-01 Sunday / 04-02 Monday) and the month boundary (04-30 / 05-01).
    - Deleting also deletes the alcohol list.
    - If saving fails at the second alcohol line, the previous record stays as it was.
    - Checks the DB constraints.
  - `frontend/src/habit-text.test.ts`: Checks the display text, the difference between the text for not recorded and 0, and the period text.
  - `frontend/src/habits.test.tsx` (15 at first, 20 after the first review): Checks an empty day, saving 0 and "did not drink", several alcohol lines with an empty tobacco field, and removing a line. It also checks the 8 rejections before saving and a duplicate made with the Select, the type and unit pair of the seventh line, filling existing values and moving focus when editing, cancelling, delete after confirmation with the re-read of totals, a server rejection, and retry after a load failure.
  - `frontend/src/daily.test.tsx`: The fake server in the daily record screen test now also answers the requests of the new card.
- On a temporary PostgreSQL 17 cluster (port 5467), the 8 migrations were applied twice to `health_test`. The second time had no errors either.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5467/health_test npm run check`: passed.
  - Backend: 138 passed, 0 skipped.
  - Frontend: 285 passed, 2 skipped. The 2 skipped are condition tests for the dark-only app, unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

### Browser check

A real API (3993) and Vite (5203) were started on the temporary DB, and headless Chrome was driven over CDP. Numbers were typed by key input, and select fields were opened with the mouse and chosen.

| Item                                                                                                                         | 320×700 | 390×844 | 1440×900 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | -------- |
| "기록 없음" (no record) on an empty day, a new alcohol line starts with beer                                                 | Pass    | Pass    | Pass     |
| Two lines of the same soju and bottle are rejected before saving                                                             | Pass    | Pass    | Pass     |
| View after saving tobacco 3 and soju 1.5 bottles and 1 glass, kept after reload                                               | Pass    | Pass    | Pass     |
| Saving 0 and "did not drink" on another day of the same week gives this week "3개비 (2일)" and "마신 날 1일 / 2일" (days drunk 1 / 2 days) | Pass    | Pass    | Pass     |
| After deleting through the confirmation dialog, this week's total goes back to 1 day                                         | Pass    | Pass    | Pass     |
| Existing values filled when editing, no horizontal overflow, no console errors                                               | Pass    | Pass    | Pass     |

## First review — 2026-11-05

The independent review had no high or medium points. It judged the period calculation, the totals SQL, the transactions, the migration, the React state, and accessibility to be correct. 8 low points came up.

- **No test for the duplicate check:** The screen check that blocks the same type and unit had no test.
  - Applied: The Radix Select is operated by keyboard to make soju and bottle twice, and it is checked that it is rejected with no request.
- **No test for aggregating a day with several lines:** There was no test that a day with several alcohol lines counts as one "day drunk".
  - Applied: `drinkingDays: 1` is checked with a day of three lines and a day of not drinking.
- **The `newDraft` comment claimed more than the behavior:**
  - Applied: When all six types are used, it picks a type and unit pair not yet used.
  - Applied: The comment was fixed to say that only the last line beyond 18 pairs can overlap.
  - Applied: It is checked that the seventh line starts with soju and glass.
- **The form did not check some server limits:**
  - Applied: 200 cigarettes, alcohol 99, and two decimal places are checked before saving.
  - Applied: Three cases were added to `test.each`.
- **Small cleanups:**
  - Applied: The backend reuses `hasTwoDecimalsAtMost` of `foods.ts`.
  - Applied: Blank lines between tests were aligned.
- **A GET response could mix two points in time:** The review recommended a separate issue, but it could be fixed in a small way, so it was put in this PR.
  - Applied: GET reads the record and both totals in a single `REPEATABLE READ READ ONLY` transaction.
- **An alcohol line could be attached to a day not recorded:** The review recommended a separate issue, but because the migration was not yet merged, it was fixed in this PR.
  - Applied: Added the composite foreign key with `ON UPDATE CASCADE`, and the child's `CHECK (drinks_recorded)`.
  - Applied: Changing a day that still has alcohol to "not recorded" is rejected by the DB.
  - Applied: To match this order, `PUT` deletes the alcohol list first and then changes the date row.
  - Test: Added to the integration test the case of recording alcohol and then saving only tobacco again.
  - Test: It is checked that the DB rejects both cases.
- **Backup restore list:** Already written in the limits below and handled in PR #68.

### First round verification

- For the changed migration, the two tables in the temporary DB were dropped and all 8 files were applied again twice. There were no errors.
- `npm run check` (same temporary DB): passed.
  - Backend: 139 passed, 0 skipped.
  - Frontend: 290 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.
- Browser: The API was started again with the new code and the items at the three screen sizes were run again, and all passed.

## Second review — 2026-11-05

It was confirmed that the first round of fixes was done correctly. The composite foreign key works correctly in all four transitions (none to alcohol, alcohol to alcohol, alcohol to not recorded, not recorded to alcohol). The cleanup of the read transaction, the Radix Select test, and the match between the form text and the server text were also confirmed. There was no defect that blocks merging, and 1 medium and 3 low points came up. Reviews are limited to two rounds, so no more are done.

- **Medium: Saving the same day concurrently gives a wrong 409.** In the first round of fixes, deleting the alcohol list was put before updating the date row. As a result, two saves deleted at the same time without a row lock, both inserted at position 0, and one got "이미 등록된 항목입니다" (this item is already registered) because of a primary key conflict. The data was not corrupted.
  - Applied: The first statement of the save transaction takes `pg_advisory_xact_lock` for that date.
  - Test: For a day that had only tobacco and a day that had alcohol, two saves are sent at the same time five times each. It checks that both return 200 and that one side's values remain whole.
  - Confirmed: Without the lock this test failed with 409, and with it the test passed.
- **Low: `UNIQUE (record_date, drinks_recorded)` overlaps with the primary key.** It is needed because it is the target of the foreign key. The possibility of a conflict when the first two saves come in at the same time is also prevented by the lock above.
- **Low: A local DB that applied the earlier version of 008:** Because it is `CREATE TABLE IF NOT EXISTS`, a DB that applied the earlier version keeps the tables without the new constraints. 008 never entered `main`, so only local DBs are affected.
  - Handling: For such a DB, drop `habit_drinks` and `habit_days` and apply again. The temporary DB of this work was handled that way too.
- **Low: The "Change" section of this document was the content from before the first round of fixes.**
  - Applied: Fixed the new line default, the checks before saving, and the number of tests.

### Second round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 140 passed, 0 skipped.
  - Frontend: 290 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Limits and follow-ups

- Alcohol calories and the alcohol amount (g) are not calculated.
- Totals are shown only for the week and month on the daily screen. A screen to view a chosen period is handled in the #43 change report.
- Dark mode, a real phone, Firefox, and Safari were not checked.
- `habit_days` and `habit_drinks` must be added to the row count comparison list of backup restore in PR #68. `meal_combos` and `meal_combo_items` are also still missing.
