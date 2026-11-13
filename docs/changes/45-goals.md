# #45 Goal setting and automatic achievement judgment

- Issue: [#45](https://github.com/sirloinbh/health-log/issues/45)
- Branch: `feat/45-goals`

## Purpose

The direct checks of #37 alone can use a different standard each day. Set numeric goals for calories, protein, sleep time, and alcohol-free days, and have the daily record judge automatically, by the same standard, whether they were kept.

## Decisions

Rules the issue did not settle were decided with the defaults below, and the user was not asked. The same content was left as an issue comment.

- **Goal direction and range**
  - Calories: a daily upper limit (at most), an integer from 100 to 10000kcal.
  - Protein: a daily lower limit (at least), an integer from 1 to 1000g.
  - Sleep: a daily lower limit (at least), 1 to 24 hours. Hours and minutes are entered separately, as in the sleep card (minutes count as 0 if left empty), and it is stored in minutes.
  - Alcohol-free: N or more days per week (Monday to Sunday), 1 to 7 days.
- **Start date of application:** When a goal is changed, it is not overwritten but saved anew with a start date. Each date is judged by the most recent goal that started before that day. The start date can also be in the future and is marked "(예정)" (scheduled). Saving again with the same start date changes only that change.
- **Turning a goal off:** Save it as a change with no goal value. From that day it is not judged, and dates before that are judged as they were. If one change is deleted, the goal right before it applies again from that date.
- **Judgment states**
  - Achieved / not achieved.
  - No record: there is no record for that day. It is not counted as not achieved.
  - Judgment pending: there is a record but no conclusion can be reached.
    - Calories and protein: when there are foods with unknown values and the known values alone do not give a conclusion. If the known values alone have already exceeded the upper limit or met the lower limit, it is judged.
    - Alcohol-free: when the result depends on days not yet recorded.
- **Alcohol-free days:** Only days whose alcohol record is "안 마심" (did not drink) are counted as alcohol-free days. Days with no record are not counted. For the weekly goal, the one goal that applies on that week's Sunday is used. So if it is changed in the middle of a week, the new goal applies to that whole week.
- **Meal total:** Counted the same way as the meal card (the sum of per-serving value × quantity, rounded to two decimal places per item). It cannot be known whether the whole day's meals were recorded. So a day with only lunch recorded also comes out as "achieved" for the calorie upper limit.
- **Sleep date:** As in #27, it is judged by the record of the day of waking up.
- **Side by side with direct checks:** In the "목표 달성" (goal achieved) card, "식단 지킴" (diet kept) is shown together with the diet group and "수면 만족" (sleep satisfied) with the sleep group. Alcohol-free has no direct check.

## Change — 2026-11-06 (first implementation)

- **DB** `database/migrations/012_goals.sql`: `goals` (item, start date of application, goal value). The primary key is (item, start date). The DB also checks the range per item. A goal value of `NULL` means the goal is turned off.
- **API** `backend/src/goals.ts`, `backend/src/app.ts`
  - `GET /api/goals`: the current goals as of today and all change records.
  - `PUT /api/goals/:item`: Saves `{ from, target }` (`target: null` is turn off). The list is read again in the same transaction and returned.
  - `DELETE /api/goals/:item/:from`: Deletes one change. 404 if it does not exist.
  - `GET /api/goals/days/:date`: Gives the goal per item, the judgment, the actual value, and that day's direct checks from one snapshot.
  - An item that does not exist is 404, and an out-of-range value or a date that does not exist is 400 with a Korean message. A request rate limit is applied.
- **Screen** `frontend/src/goals.tsx`, `frontend/src/goal-text.ts`, `frontend/src/app.tsx`, `frontend/src/daily.tsx`
  - The settings screen has a goal card per item. Each card has a value input, a start date of application, save, "시작일부터 목표 끄기" (turn the goal off from the start date), a change history, and delete through a confirmation.
  - Added a "목표 달성" card to the daily record. It shows the judgment badge, the actual value and goal, the reason for a pending judgment, and the direct checks. If there is no goal at all, it shows a link to the settings.
  - Even when saved on another card, this card does not read again. Instead it has a "다시 판정" (judge again) button.

## Change — 2026-11-08 (aligned after merging main)

- Merged `origin/main`. main has `011_junk_food.sql`, and the runner (#53) rejects a new file numbered below an already applied one. So the migration was moved from `010_goals.sql` to `012_goals.sql`.
- #52: The integration tests use `testDatabaseSkip(url)`.
- #71: Goal save and delete are registered with `trackWrite('/api/goals', …)`. The settings screen reads after `writesSettled('/api/goals')`. The "목표 달성" card reads after the writes to that day's meals, sleep, and daily checks, alcohol (the whole `/api/habits/` since it is weekly), and goals have finished.
- #65: After "다시 시도" (retry) on the settings screen, focus moves to the "목표" (goals) heading. When the form is redrawn by saving or the list is redrawn by deleting, it moves to the heading of that item's card. The "다시 판정" button does not disappear, so it is not made disabled, and a press while reading is ignored.
- When the values of all foods are unknown, it shows "값을 모르는 음식 2개" (2 foods with unknown values) instead of "0g (… 제외)" (0g (… excluded)). This was found during the browser check.
- Removed an unnecessary export of `goalItems` (knip).

## Change — 2026-11-08 (first review applied)

The first review of PR #103 (a read-only review separated from the authoring context) had no high points and raised 6 points.

- **Applied 1** `docs/next-steps/README.md`: `\17` and `\b` in a Windows path were interpreted as escapes and control characters got in. Fixed to `C:\Program Files\PostgreSQL\17\bin`.
- **Applied 2** Guidance on the alcohol-free card on the settings screen: "시작일 전 날짜는 그때의 목표로 판정합니다" (dates before the start date are judged by the goal of that time) did not match the weekly judgment. The alcohol-free card shows the guidance "주 중간에 바꾸면 그 주 전체를 새 목표로 판정" (if changed in the middle of a week, that whole week is judged by the new goal).
- **Applied 3** Sleep goal input: With decimal hours only 3-minute steps could be used, so 7 hours 10 minutes could not be set. Hours and minutes are now entered separately (`toSleepTarget`, `sleepParts`).
- **Applied 5** Deleting a change: If the re-read after the delete failed, the deleted change stayed in the list. When a delete succeeds, it is removed from the screen right away, and the current goal as of today is also recalculated from the remaining changes (`withoutChange`). After that it is read from the server again. A focus move test after delete was also added.
- **Split off 4** The "목표 달성" card not judging again on its own after a save on another card: A structure that lets cards tell each other about changes is needed, so it was split into [#104](https://github.com/sirloinbh/health-log/issues/104).
- **Passed on 6** The 500 error for a date such as `9999-12-31` where the end of the week becomes the year 10000, and the difference in the allowed range of the start date: This already exists in other APIs that use `periodsOf`, so it was passed on as a [#50 comment](https://github.com/sirloinbh/health-log/issues/50#issuecomment-6714930952).
- The browser check below was done on the screen before the first review (sleep entered as one decimal-hours field). After changing to two fields for hours and minutes, it was checked only with unit tests and not viewed again in a browser.
- Tests: `frontend/src/goal-text.test.ts` (sleep hours and minutes conversion and rejection, `withoutChange`), `frontend/src/goals.test.tsx` (saving 7 hours 10 minutes and refilling the form, focus after delete, a deleted change not visible even when the re-read fails).

## Change — 2026-11-08 (second review applied)

The second review confirmed that points 1, 2, and 5 of the first round were fixed. Point 3 was fixed but had a new regression. There were 3 points. This review is the last one.

- **Applied 1 (medium)** Sleep minutes field: `parseAmount(minutes) ?? 0` also turned values that cannot be read (`3O`, `-10`, `30분`) into 0 minutes. So it was saved as 7 hours with no error. Now only an empty field is 0 minutes, and a value that cannot be read is rejected before sending.
- **Applied 2 (low)** The accessible name of the minutes field was only "분" (minutes). The field gets `aria-label="하루 수면 시간 (분)"` (daily sleep time (minutes)). The visible label stays "분".
- **Split off 3 (low)** The "current goal" on the alcohol-free card of the settings screen is as of today, while the daily judgment is as of that week's Sunday, so the numbers can differ. It was split into [#107](https://github.com/sirloinbh/health-log/issues/107).
- Tests: Added the test "읽을 수 없는 분은 거부하고 60분 이상은 범위 오류" (reject minutes that cannot be read, and 60 minutes or more is a range error) to `frontend/src/goals.test.tsx` (12 tests).
- Checks: This time only the frontend changed, so `npm run check` was run without a temporary DB and passed.
  - Backend: 104 passed, 93 skipped. The skipped ones are DB integration tests. The backend code did not change after the first review commit (202 passed with the DB).
  - Frontend: 381 passed, 2 skipped (dark-only condition).
  - Skill checks 4 passed, `npm run knip` passed.

## Change — 2026-11-08 (main merged again right before merging)

After CI passed, #50 (allowed date range) and #92 (NUL character rejection) were merged into main and the PR went into a conflict state. `origin/main` was merged again.

- `frontend/src/daily.tsx`: The date range import of #50 and this PR's `GoalsCard` import conflicted. Both were kept.
- The start date of application of a goal was aligned to the range the daily record shows (#50, 2000-01-01 to 2099-12-31). If it is outside the range, it is rejected before sending. The API uses `isRealDate` of #50 (1900 to 2999) as it is. So the 500 error of point 6 passed on in the first review was also solved by #50.
- Tests: Added a start date range rejection test to `frontend/src/goals.test.tsx` (13 tests).
- Reflected in the next-steps document that #50 and #92 are done.
- Checks: The merged migration was applied again with psql to the same temporary DB, with no errors. `npm run db:migrate` said "적용할 마이그레이션이 없습니다" (there are no migrations to apply).
  - `npm run check` (`health_test`): passed. Backend 212 passed and 0 skipped, frontend 395 passed and 2 skipped (dark-only condition), skill checks 4 passed.
  - `npm run knip`: passed.

## Checks

- Tests
  - `backend/test/goals.test.ts`
    - Judgment function: no record, the boundaries of the upper and lower limits, cases that reach a conclusion and cases that are pending when there are foods with unknown values, the sleep boundary, and pending, not achieved, and achieved for an alcohol-free week.
    - Rejection of a range, integer, or text per item, a missing start date or a date that does not exist, 404 for an item that does not exist, and a wrong path not reaching the DB.
  - `backend/test/goals.integration.test.ts` (dates of 1981)
    - Even if a goal is changed, past days are judged by the goal of that time, and the new goal is used from the start date itself.
    - A day with no record is "none" for all four items.
    - A day with no goal or a goal turned off is not judged, but the actual values are shown. Dates before turning off are judged as they were.
    - The total with the quantity multiplied, and pending for a day with foods with unknown values.
    - Sleep judgment by the date of waking up.
    - Monday to Sunday alcohol-free counting, a change in the middle of a week, and a day with no alcohol record not being counted as alcohol-free.
    - Direct checks returned together.
    - The current goal, a future start date, overwriting with the same start date, deleting a change and the 404.
    - DB constraints.
  - `frontend/src/goal-text.test.ts`: goal text, sleep hours to minutes conversion and rejection, range and integer checks, actual value text.
  - `frontend/src/goals.test.tsx` (10 at first, 11 after the first review)
    - The judgment and direct checks are shown side by side, and no record is not not achieved.
    - The reason for pending, the settings link when there is no goal, judge again, and retry after a load failure.
    - It reads after saving on the same day finishes.
    - Sleep 7 hours 10 minutes is sent as 430 minutes (at first it was 7.5 hours), the form is refilled, and focus moves to the card heading.
    - A wrong value is rejected before sending.
    - Turning a goal off and the change history, the scheduled mark and deleting a change.
  - `frontend/src/app.test.tsx`, `frontend/src/daily.test.tsx`: The fake server now also answers goal requests. Checks that the "목표" heading is shown on the settings screen.
- `health_test` of a temporary PostgreSQL 17 cluster (port 5471)
  - The 11 migrations were applied twice with psql and the second time had no errors either.
  - Then `npm run db:migrate` was run twice. The first recorded 11 files and the second said "적용할 마이그레이션이 없습니다".
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5471/health_test npm run check`: passed.
  - Backend: 202 passed, 0 skipped (the same when run again after the first review).
  - Frontend: 378 passed (380 after the first review), 2 skipped. The 2 skipped are condition tests for the dark-only app, unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.
- In the first run, one integration test failed. The sleep goal of 2026 put into the same DB for the browser check got mixed into the change history. The test was fixed to look only at the changes of 1981, and the data for the check was also deleted.

### Browser check

A real API (3971) and Vite (5271) were started on a temporary DB, and headless Chrome (debugging 9671) was driven over CDP. Data was put in through the API: 4 goals from 11-01, calories 1800kcal from 11-05, on 11-06 2 meals (with only calories), sleep 7 hours 10 minutes, alcohol 3 days (1 day of drinking), and direct checks.

| Item                                                                                                                                                                       | 390×844 | 1440×900 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| Settings: the four goal cards, the current goals and start dates, and the change history are shown and there is no horizontal scroll                                       | Pass    | Pass     |
| Daily record 11-06: calories achieved (1,370 ≤ 1,800), protein judgment pending with the reason, sleep achieved, alcohol-free judgment pending, direct checks side by side | Pass    | Pass     |
| In the settings, saving sleep 7.5 hours from 11-06 → the current goal and change history update, and focus moves to the sleep card heading                                 | Pass    | —        |
| After saving, 11-06 is not achieved by the new goal (7 h 10 min < 7 h 30 min), and 11-05 is "기록 없음" (no record) by the previous goal (7 hours)                         | Pass    | —        |

- The save action was pressed only at 390×844. At 1440×900 only the layout of the same screen was checked.
- The meal names for the check looked garbled. This is because curl in Windows Git Bash sent the Korean text as non-UTF-8 bytes. It is not a problem of how the app stores or shows it.
- After the check, Chrome, Vite, the API, and the temporary DB were all shut down.

## Limits and follow-ups

- Even when saved on another card, the "목표 달성" card does not read again automatically. "다시 판정" must be pressed. How cards tell each other about changes must be decided separately.
- It cannot be known whether the whole day's meals were recorded, so a day with only part recorded also comes out as "achieved" for the calorie upper limit.
- The week and month achievement rates (as in #37) were not put in this scope.
