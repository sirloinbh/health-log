# #128 #129 #130 Dashboard retry focus, year in the period, period navigation range

- Issues: [#128](https://github.com/sirloinbh/health-log/issues/128), [#129](https://github.com/sirloinbh/health-log/issues/129), [#130](https://github.com/sirloinbh/health-log/issues/130)
- Branch: `fix/128-dashboard-range`

## Purpose

Fix three small problems of the dashboard (the change report) in one PR. Data and the server are not changed.

## Decisions

- **#128 focus:** while a retry is in progress, the button is kept and marked with `aria-disabled`. Focus stays on the button meanwhile.
  - On success, focus moves to the period label of the report ("11월 2일 ~ 11월 8일", Nov 2 to Nov 8).
  - If it fails again, focus stays on the button.
  - Goal settings (#65) move focus to the area title as soon as retry is pressed. The report has no title to show while it requests, so keeping the button was chosen.
- **#129 year:** a year is added when the period crosses a year or is in a different year from the server's today. The format follows the daily record screen ("2000년 1월 1일", January 1, 2000).
  - Period that crosses a year: `1999년 12월 27일 ~ 2000년 1월 2일`
  - Period in another year: `2025년 11월 1일 ~ 11월 30일`. The end date is in the same year, so the year is not written again.
  - If the server's today is not known yet, the year is added.
  - The dates of the bar chart ("12/27") and the table are left as they are, because the period label on the same screen shows the year.
- **#130 range:** it uses the same range as the daily record screen (#50), 2000-01-01 to 2099-12-31.
  - In the week or month that contains 2000-01-01, "이전" (Previous) cannot be pressed, and in the week or month that contains 2099-12-31, "다음" (Next) cannot be pressed.
    - Like the daily record screen, it uses `aria-disabled` and a range notice, and focus does not drop.
    - The week that starts on 1999-12-27 contains 2000-01-01, so it is shown.
  - A `date` address out of range (`?date=1999-06-01`) does not call the report. It shows "2000-01-01부터 2099-12-31까지 기록할 수 있습니다: 1999-06-01" (records can be made from 2000-01-01 to 2099-12-31: 1999-06-01) and has a "이번 주로 이동" (go to this week) button (or "이번 달로 이동", go to this month). This is the same as the daily record screen.
  - The API was not changed this time. It still answers for dates out of range (the scope of the issue).

## Change — 2026-11-08

- `frontend/src/report-text.ts`: `spanLabel(span, today)` adds the year by the rule above.
- `frontend/src/report.tsx`
  - Retry: `retry`, `aria-disabled` while in progress, focus to the period label after success (`tabIndex={-1}`)
  - Previous and Next: `aria-disabled` and the `dailyRangeText` description at `earliestDate` and `latestDate`
  - The notice for an out-of-range `date` and "이번 주로 이동"
- Tests
  - `frontend/src/report-text.test.ts`: added 1 year display test. The test for the current-year display was also changed to pass today.
  - `frontend/src/report.test.tsx`: added 3 and widened 1.
    - Focus on the period label after a successful retry
    - Focus on the button if it fails again
    - The week and month buttons at both ends of the range
    - Out-of-range address
- At phone widths, the period label with a year was breaking in the middle of a date ("2000년 1월 / 2일"). This was prevented. Spaces inside a date were changed to non-breaking spaces and `break-keep` was added, so the line breaks only at "~".

## Verification

- `npm run check` (without a DB): passed (frontend 511 passed, 2 skipped; backend 135 passed, 123 DB integration skipped), `npm run knip`: passed.
- Browser: temporary PostgreSQL 17 (5471), real API (127.0.0.1:3971), Vite (5271), headless Chrome (9671). The results were the same at 390×844 and 1440×900.

| Check                                          | Result                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Period label of `?period=week&date=2000-01-01` | `1999년 12월 27일 ~ 2000년 1월 2일`                                                 |
| "이전 주" (Previous week) of that week         | `aria-disabled`, the address stays the same when pressed, focus stays on the button |
| `?period=month&date=2025-11-01`                | `2025년 11월 1일 ~ 11월 30일`                                                       |
| `?period=week&date=2099-12-31`                 | `2099년 12월 28일 ~ 2100년 1월 3일`, "다음 주" (Next week) is `aria-disabled`       |
| `?period=week&date=1999-06-01`                 | Range notice error and "이번 주로 이동"                                             |
| Report request fails → retry succeeds          | Focus goes to the period label (`P`, "11월 2일 ~ 11월 8일")                         |
| Horizontal overflow                            | none                                                                                |

- At width 390, the period label first broke in the middle of a date, so it was fixed as above. After the fix it is two lines, "1999년 12월 27일 ~" and "2000년 1월 2일".
- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.

## Change — 2026-11-08 (first review applied)

What the first review (a read-only review separate from the authoring context) found and how it was handled.

- **Applied 1 (high)** In the second week of 2000 (2000-01-03 to 01-09), pressing "이전 주" asked for `date=1999-12-27` and the out-of-range notice appeared, even though that week contains 2000-01-01.
  - Now, if the first day of the previous period is before the range, it asks for `2000-01-01`.
  - Other periods still ask for the first day of the previous period as now. The month chosen when switching to monthly does not change.
  - "The week that starts on 1999-12-27 is shown" in "Decisions" above is now also true for the Previous button because of this change.
- **Applied 2 (medium)** If the address changed to an out-of-range date while a request was in progress, the late earlier answer was still drawn next to the range notice. An error notice that was left over also showed together.
  - Now the request number is raised and the notice is cleared even when the date is out of range or unknown.
- **Applied 3 (low)** If the period was changed during a retry, the retry button of the next period stayed `aria-disabled` until the earlier request finished. Now the retry state ends when the period changes.
- **Applied 4 (low)** Even when focus was moved elsewhere after pressing retry, success still brought focus to the period label. Now it moves focus only when the button disappeared and focus fell to the page.
- **Left (out of scope, same on main)** When Previous, Next, or weekly or monthly is pressed, the period navigation row disappears while the new report is received, and focus falls to `<body>`. It is the same kind of problem as #128, but it is a period change, not a retry, so it is not fixed in this PR. The main session was told to handle it as a follow-up.
- Tests: added 2 (18 on the report screen). Previous week in the second week of 2000, and an answer in progress with an out-of-range address.

## Change — 2026-11-08 (second review applied)

The second review (the last) confirmed the first-review changes are correct (previous period adjustment, request number, the 2099 end, ordinary weeks and months, crossing midnight, and server check failure). It found the following.

- **Applied 1 (medium to low, created by the first-review changes)** An old retry ended a new retry.
  - Reproduction: while a weekly retry is in progress, switch to monthly, the monthly one also fails, and press retry. If the late answer of the weekly one arrives in between, the monthly retry button disappears and focus falls to `<body>`.
  - Now `load` returns success, failure, or a stale request (`'ok' | 'failed' | 'stale'`) separately. A retry for a stale request does not touch the state.
- **Applied 2 (low)** Pressing "이번 주로 이동" on an out-of-range address made the button disappear together with the notice, and focus fell to `<body>`. Now focus moves to the period label when the new report arrives.
- **Applied 3 (low)** A line of one test whose `waitFor` always passed was removed. Items 3 and 4 of the first-review changes (changing the period ends the retry state, focus moved by the user stays) are also covered by tests.
- Tests: 20 on the report screen.
  - The 2 new regression tests were confirmed to fail on the code before the changes.
  - They are the old retry test and the navigation button focus test.
- Browser: after the changes it was checked again at 390×844 and 1440×900 by the same method. Both sizes gave the same results as the table above. The added checks are as follows.
  - On `?period=week&date=2000-01-05` (January 3 to January 9, 2000), pressing "이전 주" goes to `date=2000-01-01` and shows `1999년 12월 27일 ~ 2000년 1월 2일`. There is no error notice.
  - Pressing "이번 주로 이동" on an out-of-range address moves focus to the period label (`P`).
- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.
- By the rule, there is no third review.
