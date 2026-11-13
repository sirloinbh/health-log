# #50 Decide the allowed date range of the daily record

- Issue: [#50](https://github.com/sirloinbh/health-log/issues/50)
- Branch: `fix/50-daily-date-range`

## Purpose

The range of dates that can be opened in the daily record differed from place to place.

- The lower limit `2000-01-01` of the input field was not applied to the address and the previous day link. `/daily/0002-03-15` also opened as a normal screen.
- Typing `1999-12-31` in the input field was ignored with no notice, and when focus left, it went back to the original date.
- The next day link of `/daily/9999-12-31` became `/daily/+010000-01` and went to the "없는 날짜" (date that does not exist) screen.
- (#43 note) The API only checked whether the day really exists, so `GET /api/report?date=9999-12-31` and `0001-01-01` failed in PostgreSQL and gave 500, not 400. The week and month calculation of alcohol and tobacco and the daily checks use the same boundary.

## Decisions

Decided without asking the user. The same content was left as an issue comment.

- **Screen range: from 2000-01-01 to 2099-12-31.** The address, the previous and next day links, and the date input field all follow this rule (one place, `frontend/src/daily-date.ts`).
  - The lower limit is 2000-01-01 as the issue recommended. The time zone offset problem of 1987 and 1988 in the #27 note also does not occur on the screen.
  - The issue's recommendation was "no upper limit", but without an upper limit the next day link of `9999-12-31` breaks. To leave room for future records such as clinic appointments, while keeping the year always four digits, it was set at 2099-12-31.
- **API range: from 1900-01-01 to 2999-12-31.** It was put in `isRealDate`, which is used by all date paths, the report, the food check date, and the meal copy date.
  - Why it is wider than the screen: the integration tests use dates of 1979 to 1994 so as not to overlap with real records.
  - It is far enough from the years 0001 and 9999, so even when the week or month or the next day of that day is calculated, it does not go beyond the range PostgreSQL can hold. Outside the range is 400 "날짜가 올바르지 않습니다" (the date is not valid).
- **Screen outside the range**
  - If the address is outside the range, it shows "2000-01-01부터 2099-12-31까지 기록할 수 있습니다: <date>" (records can be made from 2000-01-01 to 2099-12-31: <date>) and "오늘 기록으로 이동" (go to today's record). A date that cannot exist is "없는 날짜입니다" (this date does not exist), as now.
  - At the end of the range, the previous and next day remain as the same link but are `aria-disabled` and do not move when pressed. Focus stays, and the reason (the range) is read as a description (changed after the first review).
  - If a date outside the range is typed in the input field, the range is announced below the date navigation (`aria-live`). It is not announced for a value where the year is still being typed (before year 1000). It is also announced if the input field is left with a date outside the range (added after the first review).

## Change — 2026-11-08

- **API** `backend/src/dates.ts`: `isRealDate` rejects anything outside 1900-01-01 to 2999-12-31. `parseDate` and the report, food, and meal checks all use this function.
- **Screen** `frontend/src/daily-date.ts`: `earliestDate`, `latestDate`, `inDailyRange`, `dailyRangeText`
- **Screen** `frontend/src/daily.tsx`
  - Shows a notice screen for an address outside the range.
  - At the end of the range, the previous and next day are made `aria-disabled` links (pressing is blocked, while focus and the description remain).
  - The `max` of the input field was changed from `9999-12-31` to `2099-12-31`, and a notice is shown for input outside the range.

## Verification

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`). Headless Chrome (debugging port 9673) was driven over CDP. The results were the same at 320×700, 390×844, and 1440×900.

| Check                                                           | Result                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/daily/1999-12-31`, `2100-01-01`, `0002-03-15`, `9999-12-31`   | The range notice and "오늘 기록으로 이동", no cards                          |
| `/daily/2000-01-01`                                             | A disabled previous day link, the next day link `/daily/2000-01-02`, 6 cards |
| `/daily/2099-12-31`                                             | The previous day link `/daily/2099-12-30`, a disabled next day link, 6 cards |
| `19991231` typed in the input field by keyboard                 | The address stays, the range notice is shown                                 |
| Then `20260302`                                                 | Moves to `/daily/2026-03-02`, the notice disappears                          |
| `GET /api/report?period=month&date=9999-12-31` and `0001-01-01` | 400                                                                          |
| `GET /api/report?period=month&date=2999-12-31`                  | 200                                                                          |

- At all three widths there was no horizontal overflow and no console errors.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

- `backend/test/dates.test.ts` (2 new, 3 after the first review)
  - `isRealDate` accepts 1900-01-01 and 2999-12-31 and rejects anything outside.
  - 0001-01-01, 1899-12-31, 3000-01-01, and 9999-12-31 give 400 before reaching the DB on the report (week and month) and on all of the sleep, body, alcohol and tobacco, daily check, and meal paths.
- `backend/test/dates.integration.test.ts` (1 new, using `testDatabaseSkip`, read-only): at 1900-01-01 and 2999-12-31, the report (week and month), alcohol and tobacco, daily check, and body period reads are 200.
- On the code before the fix, two unit tests failed. The report outside the range was 500.
- `frontend/src/daily.test.tsx` (3 added and 1 changed at first, 6 added in total after the review)
  - The four addresses outside the range show the range notice and the link to go back, and do not draw cards.
  - At 2000-01-01 the previous day is disabled, and at 2099-12-31 the next day is disabled, and the link on the other side is inside the range.
  - Typing 1999-12-31 and 2100-01-01 in the input field shows the notice and the address stays. While typing a year such as 0199 there is no notice. Changing to a date inside the range moves and the notice disappears.
  - The `min` and `max` of the input field are 2000-01-01 and 2099-12-31 (the existing `max` test was changed).
  - It was confirmed that all 4 fail on the code before the fix.
- `frontend/src/daily-date.test.ts`: both ends and the outside of `inDailyRange`

### Commands

- `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed
  - Backend 193 passed, 0 skipped (including DB integration tests). Frontend 374 passed, 2 skipped. Skill checks 4 passed.
- `npm run knip`: passed

## Limits

- The "copy from another day" date of the meal card and the date of the overview (report) screen are not separately blocked to the screen range (2000 to 2099). If it is inside the API range (1900 to 2999), it is read as it is, and if outside, the API answers 400.
- The past time zone offset problem such as 1987 and 1988 inside the API range (#27 note) stays as it is in the API. It cannot be reached from the screen.
- The food check date input field and the meal "copy from another day" date input field have no `max`, so a six-digit year can be typed in Chrome. The API now answers 400 instead of 500. If there is a food already saved with an out-of-range check date, a 400 asking to fix that field comes at the next save.

## First review — 2026-11-08

A separate read-only review was run. Nothing had to be fixed, and the following was applied.

- **Keyboard focus lost at the end of the range (to fix):** Going from 2000-01-02 to 2000-01-01 with "이전 날" (previous day) changed the link into a disabled button, and focus fell to `<body>`. A disabled button cannot be reached with Tab, so the reason could not be heard either. Even at the end of the range, the same link (`DayLink`) is drawn, with `aria-disabled` and a description, and pressing is blocked. In the browser, after going to 2000-01-01 with Enter, focus stayed on the disabled "이전 날", and pressing Enter again left the address as it was (320/390/1440).
- **The point that there may be no notice when typing year 2100 and later (to fix):** The review expected that Chrome does not accept more digits than the `max` (2099) of the year field, so `2100` would become `0210`. In real Chrome 156, `2100`, `3000`, and `1999` could be typed as they are by keyboard, and the notice appeared both while typing and after leaving (320/390/1440). So that the notice also appears when the year is cut in other browsers, if the input field is left with a date outside the range, that date is remembered and the notice is shown.
- **Test additions:** Added to `backend/test/dates.test.ts` that the body period read, the food check date, and the meal copy date outside the range are 400 (3 tests). The screen tests check the link at the end of the range, focus at the end of the range, and the notice on leaving. These 3 failed on the code before the review.
- **Other:** Added a comment to `TodayRedirect` that the server's today will not be outside the range until the year 2100. Wrote the food and copy date input fields in "Limits" above.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 194, 0 skipped. Frontend 376 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.

## Second review — 2026-11-08

The first round of fixes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed, and the following was applied. Reviews end here.

- **Confirmed:** React Router's `Link` does not navigate if `preventDefault` is called in `onClick`, so the link at the end of the range is blocked for click, Enter, and Ctrl click. A middle click or "open in a new tab" only opens the current day, so it is harmless. `aria-description` passes this repository's accessibility lint.
- **The range notice coming back to life (to fix):** After the input field was left with a date outside the range and the notice appeared, going to the next day and coming back made the notice appear again without any input. This is because the daily record screen stays as it is even when the date changes, and became equal again to the saved date. When the date changes, the notice state is cleared during render (the "reset state by comparing with the previous value" approach recommended by React). A test of going to the next day and previous day and coming back was added, and it fails on the code before the review.
- **Disabled link look:** The background does not change on mouse hover and the pointer cursor does not appear. `pointer-events-none` was not used so that the `title` tooltip that tells the reason stays.
- **Docs:** Fixed the description of the disabled button in "Change" and the test counts.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 194, 0 skipped. Frontend 377 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.
