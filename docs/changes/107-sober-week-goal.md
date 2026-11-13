# #107 Show the sobriety goal on the settings screen on the same weekly basis as the daily judgment

- Issue: [#107](https://github.com/sirloinbh/health-log/issues/107)
- Branch: `feat/107-sober-week-goal`

## Purpose

In #45, the sobriety goal judges the whole week with the goal that applies on that week's Sunday. But the "current goal" on the settings screen was based on today. If on a Wednesday you saved 6 sober days starting this week's Friday, the daily record judged this week as 6 days. The settings screen showed the old goal as the "current goal" and put "(예정)" (scheduled) on the new value. This issue came up in the second review of PR #103 and was split out.

## Change — 2026-11-08

- **API** responses of `GET /api/goals` and `PUT /api/goals/:item` in `backend/src/goals.ts`
  - The sobriety `current` is chosen on the basis of the Sunday of the week (Monday to Sunday) that contains today. This is the same basis as the daily judgment (`GET /api/goals/days/:date`).
  - Calories, protein, and sleep are still based on today.
  - The response gained `week: { from, to }`, the week that contains today.
- **Screen** `frontend/src/goal-text.ts`, `frontend/src/goals.tsx`
  - The description on the sobriety card now reads "이번 주(11.02~11.08) 목표: …" (this week's (11.02 to 11.08) goal: …). Other cards still read "지금 목표: …" (current goal: …) (`currentText`).
  - "(예정)" is added only to changes that start after the per-item basis date (`countsUntil`). The basis date is this week's Sunday for sobriety and today for the other items. So a sobriety change that starts within this week is not scheduled.
  - The current goal computed on screen right after deleting a change (`withoutChange`) uses the same basis.

## Change — 2026-11-08 (first review applied)

The first review of PR #112 (a read-only review separate from the authoring context) confirmed that the server and the screen use the same basis at every boundary. The boundaries checked were a change starting on Sunday or on the next Monday, today being Monday or Sunday, and a change that is turned off within this week. There was no defect that blocks merging, and 3 low items came up.

- **Applied 1** The confirmation text for deleting a change, "그 날짜부터 바로 앞의 목표로 판정합니다" (from that date it is judged with the goal just before), was wrong for sobriety. Sobriety is judged with the previous goal from the Monday of the week that contains the deleted change. On the sobriety card it now reads "삭제하면 그 날짜가 든 주부터 바로 앞의 목표로 판정합니다." (if you delete it, it is judged with the goal just before from the week that contains that date). The text has existed since #45, but it was corrected together because this PR changes sobriety to be shown by week.
- **Applied 2** Boundary tests were strengthened. A change that starts on this week's Sunday becomes the current goal. If the goal is turned off within this week, it becomes "이번 주(…) 목표 없음" (no goal for this week (…)) (`frontend/src/goal-text.test.ts`).
- **Applied 3** The test helper `goalsOf` took `today` as an argument while `week` was fixed, so it could produce a response the server cannot make. The `today` argument was removed.
- Test: added confirmation text tests for sobriety and for sleep to `frontend/src/goals.test.tsx`.
- Check: only the frontend changed, so `npm run check` was run without a DB and passed.
  - Backend: 117 passed, 99 skipped (DB integration tests). The backend code did not change after the first commit, for which 221 passed with a DB.
  - Frontend: 410 passed, 2 skipped (dark-only conditions).
  - `npm run knip`: passed.

## Second review — 2026-11-08

The second review (the last) confirmed the first-review changes are correct and found nothing to fix. The new boundary tests fail if the basis is reverted to today.

- **Note (not fixed)** If the sobriety goal is changed twice in the same week (for example 5 days on Monday, 6 days on Friday), the earlier change does not judge any week. So deleting it does not change any judgment, yet the deletion text says it is judged "with the goal just before from the week that contains that date". This is rare and there is no risk of wrong data, so it was left as it is.

## Verification

- Tests
  - `backend/test/goals.integration.test.ts`: checked when today is a Wednesday (1981-03-04). A sobriety change from Friday becomes this week's goal, while a calorie change from the same day is not yet current. The sobriety goal of the daily judgment equals the current goal in settings. A change from the next Monday is not yet current.
  - `frontend/src/goal-text.test.ts`: checks the sobriety and general wording of `currentText`, no goal, and `withoutChange` on the sobriety basis (deleting a change of next week, deleting a change of this week). It also checks that deleting a calorie change after today leaves the current goal as it is.
  - `frontend/src/goals.test.tsx`: on a Friday basis, checks the sobriety card description, that "(예정)" is not put on a sobriety change on this week's Saturday, and that it is put on a protein change on the same day.
  - `frontend/src/app.test.tsx`: added `week` to the goal response of the fake server.
- A temporary PostgreSQL 17 cluster (port 5471, `health_test`)
  - Applied `013_foods_franchise.sql`, newly merged into main, with psql.
  - `npm run db:migrate` recorded 013.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5471/health_test npm run check`: passed.
  - Backend: 221 passed, 0 skipped.
  - Frontend: 408 passed, 2 skipped. The 2 skipped are dark-only app condition tests and are unrelated to this change.
  - Skills check: 4 passed.
- `npm run knip`: passed.

### Browser check

The real API (127.0.0.1:3971) and Vite (5271) were started on a temporary DB, and the settings screen was opened with headless Chrome (debugging 9671). The sobriety goal was entered as 5 days from 11-01 and 6 days from 11-09.

| Item                                                                                                                                                                                | 390×844 | 1440×900 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| The sobriety card description is "이번 주(11.02~11.08) 목표: 주 5일 이상 금주 (2026-11-01부터)" (this week's (11.02 to 11.08) goal: sober at least 5 days a week (from 2026-11-01)) | passed  | passed   |
| "(예정)" (scheduled) is put on the change from the next Monday (11-09)                                                                                                              | passed  | passed   |
| No horizontal scroll                                                                                                                                                                | passed  | —        |

- The server's today on the day of the check (2026-11-08) is a Sunday, so there is no date after today within this week. "A later change within this week is not scheduled" could not be seen in the browser and was checked only by tests.
- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.
