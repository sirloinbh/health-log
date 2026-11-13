# #138 Keep focus on the pressed button while the dashboard period changes

- Issue: [#138](https://github.com/sirloinbh/health-log/issues/138) (parent #86)
- Branch: `fix/138-dashboard-nav-focus`

## Purpose

On the dashboard, when Previous, Next, or weekly or monthly was pressed, the period navigation row disappeared while the new report was received. So the focus of the pressed button fell to `<body>`. It was found in the first review of PR #133 and was the same on main (the same kind as #128).

## Decisions

- **Keep the previous result, dimmed.** Until the new report arrives, the previous report is left as it is and shown dimmed (`opacity-50`).
  - Only `aria-busy` is put on the report area. Before the first-review changes, it was made a named region (`role="region"`) only while loading.
  - The navigation row and the pressed button stay, so focus stays.
  - The period label (`aria-live`) stays attached, so when the new period arrives, the text changes and is read out.
- **Buttons move based on the requested period.** The report on screen can be of the previous period while loading. So Previous, Next, and the range-end check are computed with the period that contains the date of the address (`periodSpan`).
  - This is the same as the server's period calculation (`periodsOf` in `backend/src/day-records.ts`, Monday to Sunday).
  - Pressing twice before the answer arrives moves two periods.
- **"이번 주" (This week) button:** it is shown based on the period on screen. So while this week is loading, the button stays and keeps focus. When this week arrives on screen, the button disappears and focus moves to the period label (same as "이번 주로 이동" (go to this week) in #128).
- **If the period moved to cannot be loaded:** the navigation row disappears. If focus fell to the page at that time, it moves to "다시 시도" (Try again).
- **Button names during a period change:** while changing from weekly to monthly, the period label briefly shows the previous week. The buttons already say what will happen when pressed, such as "이전 달" (Previous month) and "다음 달" (Next month).
- Before the first report is received, after a failure, and on an out-of-range address, there is no report as now. The skeleton, the error, and the range notice appear as they do.
- The "지난주/지난달" (last week / last month) wording of the statistics follows the period of the report on screen. So while changing from weekly to monthly, "지난달" is not attached to weekly numbers.

## Change — 2026-11-08

- `frontend/src/report.tsx`
  - The report is not emptied when the period changes.
  - The `loading` state, the dimmed area, and `aria-busy`
  - On an out-of-range address, the report is emptied.
  - The navigation buttons move based on `periodSpan`. After "이번 주", focus moves to the period label.
- `frontend/src/report-text.ts`: `periodSpan(period, date)`
- `docs/next-steps/README.md`: "In progress" was updated to the current state. agent2 is on the recent-foods test race, and agent3 has no assignment. The recently finished #48, #126, #127, #131, and #134 were written in.

## Verification

- Regression tests (`frontend/src/report.test.tsx`)
  - Added 3.
    - Focus before and after the response, the navigation row, and `aria-busy` after pressing Previous week and monthly
    - Pressing twice before the answer
    - Focus after "이번 주"
  - All three were confirmed to fail on `report.tsx` of main.
- `frontend/src/report-text.test.ts`: added 1 `periodSpan` test (Monday start, a week that crosses a year, February of a leap year, December 2099).
- `npm run check` (without a DB): passed (frontend 538 passed, 2 skipped; backend 135 passed, 123 DB integration skipped), `npm run knip`: passed.

### Browser check

Checked with a temporary PostgreSQL 17 (5471), the real API (127.0.0.1:3971), Vite (5271), and headless Chrome (9671). The report response was delayed by 0.8 seconds inside the page. The results at 390×844 and 1440×900 were the same.

| Check                                                         | Result                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Before the response after pressing "이전 주" (Previous week)  | Focus "이전 주", the navigation row unchanged, the report area `aria-busy`, the period label still the previous week |
| After the response                                            | Focus "이전 주", period `10월 26일 ~ 11월 1일`                                                                       |
| Pressing "이전 주" twice before the response                  | `10월 12일 ~ 10월 18일` (two weeks moved), focus unchanged                                                           |
| Before and after the response after pressing "월간" (Monthly) | Focus "월간", `aria-busy` before, and `10월 1일 ~ 10월 31일` after                                                   |
| After pressing "이번 달" (This month)                         | The button disappears and focus goes to the period label (`P`), `11월 1일 ~ 11월 30일`                               |
| Screen while loading                                          | The previous report stays dimmed (checked in the 390 screenshot)                                                     |
| Horizontal overflow                                           | none                                                                                                                 |

- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.

## Change — 2026-11-08 (first review applied)

The first review (a read-only review separate from the authoring context) confirmed that the core fix works. What it confirmed: focus of Previous, Next, and weekly or monthly, that `periodSpan` equals the server calculation, and that `loading` does not stall. It found the following.

- **Applied 1 (medium)** The "이번 주" button was shown based on the period of the address, so it disappeared as soon as it was pressed. So while loading, focus was on `<body>`. Now it is shown based on the period on screen.
- **Applied 2 (medium)** Even when the request of "이번 주" (or "이번 주로 이동") failed, the "focus when it arrives" mark stayed. After that, when another report arrived, focus could be moved without asking. This happens in Safari, where pressing a button does not give it focus. Now the mark is cleared on failure.
- **Applied 3 (low)** When the period moved to could not be loaded, the navigation row disappeared and focus fell. Now it moves to "다시 시도".
- **Applied 4 (low)** The `role="region"` and its name that appeared only while loading were removed. Only `aria-busy` is kept so that it does not appear and disappear in the landmark list.
- **Applied 5 (low)** The test checks that the statistics of the previous report are really inside the `aria-busy` area.
- **Explained (low)** That the button names change first during weekly → monthly is written under "Decisions" above.
- Tests: added 3 (26 on the report screen). All three were confirmed to fail on the code before the changes.
  - Focus while "이번 주" is loading
  - Focus on "다시 시도" after a failed move
  - After a failed "이번 주", another report does not move focus

## Change — 2026-11-08 (second review applied)

The second review (the last) confirmed the first-review changes are correct and that there are no blocking or medium problems. What it confirmed: when `focusRetry` runs, `loading`, that "이번 주" does not repeat, the in-progress line of the README, and the tests. Two low remarks were applied.

- **Applied 1 (low)** A move that leaves the period and date unchanged, like the already pressed "주간" (Weekly), also left a "moved" mark. No load follows, so the mark stayed until the next different load. Now a move to the same period and date does nothing.
- **Applied 2 (low)** If "이전 주" was pressed after pressing "이번 주" and before the answer arrived, the "focus when it arrives" mark was applied to the previous week's report. Now another move clears that mark. The mark is kept only for "이번 주" and "이번 주로 이동".
- Low item 3 (during weekly → monthly, "이번 달" (This month) may show briefly) is the result of showing based on the period on screen, so it is left as it is. Pressing it only asks for today's date once.
- By the rule, there is no third review.
