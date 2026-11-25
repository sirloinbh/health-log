# #324 Next-day condition in the change report

- Issue: [#324](https://github.com/sirloinbh/health-log/issues/324)
- Branch: `feat/324-condition-report`

## Purpose

The report compared alcohol with that night's sleep but not with how the next day felt. It now shows average mood, energy and stress after short sleep, drinking and junk food.

## Decisions

The coordinator could not be reached when this was built, so the recommended option A was used. **It still needs the user's confirmation** (see the PR).

- **Inputs:** short sleep (under 6 h, so exactly 6 h is not short), drinking, junk food. Each is compared with its opposite: 6 h or more, a recorded no-drinking day, a day with meals and no junk food.
- **Which day:** a night's sleep is filed under the day of waking, so it is compared with that day's condition. Drinking and junk food on day D are compared with day D + 1, as the sleep-after-drinking card does.
- **Left out:** days without the input's own record, and days with no score. A score a day leaves empty is not counted for that score.
- **Minimum:** each side needs at least 3 days with a score, or the screen shows a "too few days" message instead of the numbers.

## Change — 2026-11-25

- **API** `backend/src/report.ts`: `GET /api/report` adds `conditionAfter.{shortSleep,drinking,junkFood}.{with,without}` with the day count and, per score, its day count and average (one decimal).
- **Screen** `frontend/src/report-condition.tsx`, `report-text.ts`, `report.tsx`: a "Condition the next day" card with one table per input.
- **Tests:** backend integration with fixed 1979 dates (CI database), screen test for the tables and the too-few-days message. `frontend/src/app.test.tsx` only gained the new field in its report fixture.
