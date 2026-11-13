# #43 Weekly and monthly change report

- Issue: [#43](https://github.com/sirloinbh/health-log/issues/43)
- Branch: `feat/43-change-report`

## Purpose

The purpose of this service is not just to record but to check changes. The empty dashboard gathers the weekly and monthly changes in sleep, diet, alcohol and tobacco, and daily checks. It compares with the previous period, and also shows the relation between alcohol and the sleep of that night.

## Decisions

Details that were not in the issue were decided as below, without asking the user. The same content was left as an issue comment.

- **Periods:** A week (Monday to Sunday) and a month (1st to the last day). It uses the same Asia/Seoul calendar date calculation as #36 and #37 (`backend/src/day-records.ts`). The previous period is the week or month right before.
- **Denominator of averages:** The number of days that have that record. Days with no record are not put in the denominator.
  - Sleep: the average of `duration_minutes` on days that have a sleep record.
  - Calories: only days on which the calories of all items are known go into the average. A day with an item whose calories are unknown is not mixed in as a low day, and is shown separately as "칼로리를 모르는 날 N일" (N days with unknown calories).
  - Smoking: the daily average and the total over days with cigarettes recorded.
  - Alcohol: among the days alcohol was recorded, the number of days drunk and its ratio. The number of recorded days differs by period, so the change is compared by ratio (percentage points), not by number of days (changed after the first review).
  - Checks: the ratio of "yes" among the days that question was answered.
- **Change:** Shown together with the number of recorded days of the previous period, as in "지난주(4일)보다 +14분" (+14 minutes compared with last week (4 days)) (the day count was added after the first review). If either period has no record, it says "지난주 기록 없음" (no record last week) instead of a change. The unit of change for a ratio is percentage points (%p).
- **Alcohol and sleep of that night:** Sleep is recorded by the date of waking up. So the night of a day D when alcohol was recorded (sleeping on D and waking on D+1) is the sleep of the date D+1. After the first review, the name on screen was changed from "술 마신 다음 날 밤" (the night after the day alcohol was drunk) to "술 마신 날 밤" (the night of the day alcohol was drunk). The first name read as the night of D+1.
  - The days in that week (month) when alcohol was recorded are divided into "drank" days and "did not drink" days, and the average sleep of the next night and the sample size (number of nights) are shown.
  - The next night of a day with no alcohol record is left out of the count.
  - If either sample is fewer than 5 days, a notice "차이를 믿기 어렵다" (the difference is hard to trust) is attached.
  - The screen also says "관련성을 보여 줄 뿐, 원인을 판정하지 않습니다" (it only shows a relation and does not judge a cause).
- **Chart:** As the project rule (`docs/project-setup.md` 8.2) says, it is drawn with SVG without a library. No new package was installed.
  - Sleep hours and calories by date are each drawn as a bar chart. One chart uses one series and one axis.
  - A day with no record has no bar and keeps only a small mark at the bottom. It is not drawn as 0.
  - On PC, hovering shows that day's value, and on a phone, pressing shows it.
  - Each chart has a "표로 보기" (view as a table) table.
- **Color:** Colors 1 (blue) and 2 (orange) of the data visualization reference palette were used. Light is `#2a78d6` and `#eb6834`, dark is `#3987e5` and `#d95926`.
  - Both modes were checked with the validation script (`validate_palette.js`). The lightness range, saturation, color vision deficiency distinction (ΔE 24.7 and 26.8), general distinction, and background contrast all passed.
  - Comparison bars write the name and value as text next to the color. They do not rely on color alone.

## Change — 2026-11-05

- **API** `backend/src/report.ts`, `backend/src/app.ts`: `GET /api/report?period=week|month&date=YYYY-MM-DD`
  - The response is the current period summary, the previous period summary, values by date (sleep minutes, calories, whether alcohol was drunk), and the comparison of alcohol and sleep of that night.
  - All reads are done in one `REPEATABLE READ READ ONLY` transaction.
  - Values by date make one row for every day of the period, and a day with no record is `null`.
  - `period` and `date` are validated, and a wrong one returns a Korean 400. A request rate limit is also applied, like other routers.
- **Screen** `frontend/src/report.tsx`, `frontend/src/report-text.ts`, `frontend/src/daily-bars.tsx`, `frontend/src/app.tsx`
  - The dashboard (`/`) shows this report.
  - It has weekly and monthly switching, previous and next period, and a "이번 주(달)" (this week (month)) button. The chosen period stays in the address (`?period=&date=`).
  - 6 stat cards: average sleep, average calories per day, days alcohol was drunk, average smoking per day, diet kept, sleep satisfied. Each card shows the number of recorded days and the change from the previous period.
  - There are bar charts of sleep and calories by date, and a "술과 그날 밤 수면" (alcohol and sleep that night) card.
  - Today uses the date the server gave (`/api/health`).

## Checks

- Tests
  - `backend/test/report.test.ts`: Checks that it is 400 when the period is missing or different, the date is missing or wrong, or the date is repeated, and that the request does not reach the DB.
  - `backend/test/report.integration.test.ts`
    - For a period with no record, the averages are `null` and all 7 days are blank.
    - The denominator of averages is the number of recorded days. With a record of two days of sleep in a week, the average is the average of those two days. A day with an item whose calories are unknown is counted separately.
    - A question not checked and a day with only a memo do not go into the denominator.
    - It breaks at the week boundary (Sunday 1979-04-01 / Monday 04-02) and the month boundary (03-31 / 04-01, 04-30 / 05-01), and the previous period is the period right before.
    - Alcohol and the sleep of that night compare the sleep of the next date. The night of a day with no record is left out, the night of alcohol drunk on the last day of the period (Sunday) is included, and the night of alcohol drunk last Sunday (this week's Monday date) is left out. The sample size of each side is returned.
    - This file uses dates of 1979. The calendar is the same as 1990, so the same boundaries can be checked. Test files run at the same time, so when 1990 was used at first, the cleanup of another file once deleted rows of the alcohol and tobacco concurrent save test and caused a 500.
  - `frontend/src/report-text.test.ts`: Checks the time text, the change text (the day count of the previous period, the particles in "지난주(3일)와" and "지난달(20일)과", no record), ratios, moving periods (including crossing a year), and the period text.
  - `frontend/src/report.test.tsx` (7 at first, 12 after the first review, 13 after the second review)
    - It requests this week with the server date, and each card shows the value, the number of recorded days, and the change.
    - For a period with no record, all 6 cards show "기록 없음" and 0% is not shown.
    - The comparison has the sample sizes and the notice that it does not judge a cause. The warning is attached only when the sample is small.
    - An empty day is "기록 없음" in the chart description and the table.
    - Switching to the previous week and to monthly requests the right period and changes the address.
    - It can be retried after a failure.
- On a temporary PostgreSQL 17 cluster (port 5467), the 9 migrations were applied twice to `health_test`. The second time had no errors either.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5467/health_test npm run check`: passed twice in a row.
  - Backend: 157 passed, 0 skipped.
  - Frontend: 317 passed, 2 skipped. The 2 skipped are condition tests for the dark-only app, unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

### Browser check

Two weeks of records were put into a temporary DB (sleep 8 days, meals 6 days with 1 day of unknown calories, alcohol and tobacco 6 days, checks 4 days). A real API (3993) and Vite (5203) were started and headless Chrome was driven over CDP. Dark mode was checked with `prefers-color-scheme: dark`.

| Item                                                                                                                     | 320 light | 390 light | 390 dark | 1440 light | 1440 dark |
| ------------------------------------------------------------------------------------------------------------------------ | --------- | --------- | -------- | ---------- | --------- |
| The values, samples, and changes of the 6 cards equal hand-calculated values (for example average sleep 7 h 9 min, +14 min) | Pass      | Pass      | Pass     | Pass       | Pass      |
| Alcohol and sleep that night: sample 2 days 6 h 48 min / sample 1 day 8 h, small-sample notice                           | Pass      | Pass      | Pass     | Pass       | Pass      |
| The sleep chart has bars only for the 4 recorded days, description "7일 중 4일 기록" (4 of 7 days recorded)               | Pass      | Pass      | Pass     | Pass       | Pass      |
| The bar color is the value of each mode (`rgb(42,120,214)` / `rgb(57,135,229)`)                                          | Pass      | Pass      | Pass     | Pass       | Pass      |
| "11/4 · 8시간" (11/4 · 8 hours) by mouse (PC) or press (phone) on a bar                                                   | Pass      | Pass      | Pass     | Pass       | Pass      |
| Previous week → Oct 26 to Nov 1, monthly → October, next month → November (average 7 h 13 min, 5 days)                   | Pass      | Pass      | Pass     | Pass       | Pass      |
| No horizontal overflow, no console errors                                                                                | Pass      | Pass      | Pass     | Pass       | Pass      |

The browser check found and fixed a problem with pressing on a phone. When pressing, `mouseenter` came first and showed the value, and the `click` that followed closed it again. Now pressing only shows that day.

## First review — 2026-11-05

The independent review found no defect that blocks merging. What the review confirmed to be correct is as follows.

- The join where the date column and rows are not multiplied
- Counting days alcohol was drunk with `EXISTS`
- The calorie calculation and the rule for a complete day
- Date string handling
- Input validation
- Particles and units of change

4 medium and 6 low points came up.

- **Medium: The sample size of the previous period was not visible.**
  - Applied: The change text also shows the number of days of the previous period, as in "지난주(1일)보다 +30분" (+30 minutes compared with last week (1 day)).
- **Medium: The change in days alcohol was drunk was compared by number of days.** A week with 2 recorded days out of 7 and a week with 2 out of 2 became "the same".
  - Applied: The value is shown as "2일 (50%)" (2 days (50%)) and the change is compared by the percentage points of the ratio.
- **Medium: The name of the comparison pointed to a different night.**
  - Applied: The card title was changed to "술과 그날 밤 수면" and the items to "술 마신 날 밤 / 안 마신 날 밤" (the night of a day drunk / the night of a day not drunk). The description sentence was also fixed.
- **Medium: The subquery that gets calories by date added up all meal records every time.**
  - Applied: It was limited to the dates within the period.
- **Low: If the server date (`/api/health`) could not be received, "리포트 불러오는 중" (loading the report) kept spinning.**
  - Applied: The reason is shown as a sentence, and the loading mark is shown only when there is a date or while the server status is being checked.
- **Low: Extreme dates such as 9999-12-31 and 0001-01-01 become 500 instead of 400.** It was added to the allowed date range issue [#50](https://github.com/sirloinbh/health-log/issues/50).
- **Low: The tooltip of the first and last bars could go outside the card.**
  - Applied: For a bar within the edge quarter, the tooltip is attached inward.
- **Low: The chart comment was written as if it supported keyboard focus.**
  - Applied: The comment was fixed. Keyboard users use "표로 보기".
- **Low: Tests were lacking.**
  - Added as screen tests: ignoring a late previous period response, the fallback for a wrong address date, the server date failure screen, and the edge tooltip position.
  - The comparison of the ratio of days alcohol was drunk was also added as a screen test.
  - Added as an integration test: that the night of last Sunday's alcohol, recorded on this week's first day (Monday), is left out.
  - Added as an integration test: every item of the previous period summary.
- **Low: A leftover blank line in `app.tsx`.**
  - Applied: Removed.

### First round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 158 passed, 0 skipped.
  - Frontend: 322 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.
- Browser: The API was started again with the new code and the items in the table above were run again, and all passed.
  - New expected values: "지난주(4일)보다 +14분", "2일 (50%)", "지난주(2일)와 같음" (same as last week (2 days)).
  - At the five screens, the first and last bars were pressed, and it was checked that the tooltip is inside the card and there is no horizontal overflow.

## Second review — 2026-11-05

It was confirmed that all the first round of fixes were correct and created no new regression. What was confirmed: the particles, ratio rounding, the denominator of each card, the `$2` and `$3` parameters, the server date failure text not flickering, and the tooltip position calculation. There was no defect that blocks merging, and 1 medium, 2 low, and 1 minor point came up. All were applied. Reviews are limited to two rounds, so no more are done.

- **Medium: If the server status check failed once, a report that was already shown disappeared.** If the address has no date, today's date is received from `/api/health`. When the check that runs every 60 seconds failed once, the date was lost and the report was emptied.
  - Applied: The last server date received is remembered and kept in use.
  - Test: It is checked that the report stays even if the recheck when returning to the tab fails. It was confirmed that it fails when run with the code before the fix.
- **Low: The edge judgment differed between left and right.** On a 7-day chart, the left counted two bars and the right counted only one bar as the edge.
  - Applied: Both sides count the bars within the quarter from the end as the edge.
  - Test: Added the second bar from the right and the second bar from the left to the check.
- **Low: This document still had the old card name ("술과 다음 날 수면") and the old change text.**
  - Applied: Fixed.
- **Minor: The particle was obtained by cutting a string.**
  - Applied: The particle (`와`, `과`) is stored separately.

### Second round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 158 passed, 0 skipped.
  - Frontend: 323 passed, 2 skipped.
  - Skill checks: 4 passed.
- `npm run knip`: passed.
- Browser: The items above were run again at the five screens and all passed.

## Limits and follow-ups

- The report has only week and month units. Longer periods such as 4 weeks and 12 weeks and choosing a period directly are out of scope.
- The item comparison is only alcohol and sleep that night. Other combinations are added as an issue if needed after records accumulate.
- The bar chart stretches the SVG to the screen width. So on a wide screen the bars get thicker, and the rounded corners get a little flatter.
- Bar values can be seen by mouse and press. With a keyboard, they are seen in "표로 보기".
- A real phone, Firefox, and Safari were not checked. Dark mode was checked only with media emulation of headless Chrome.
