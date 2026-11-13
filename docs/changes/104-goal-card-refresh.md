# #104 Make the goal achievement card judge again by itself after another card saves

- Issue: [#104](https://github.com/sirloinbh/health-log/issues/104)
- Branch: `feat/104-goal-card-refresh`

## Purpose

The "goal achievement" card from #45 did not read again when another card on the same page saved. Even if a meal was added and calories went over the upper limit, "achieved" stayed on screen until "Judge again" was pressed. This issue came up in the first review of PR #103 and was split out.

## Change — 2026-11-08

- **`frontend/src/pending-writes.ts`:** added `onWriteSettled(listener)`.
  - When a write registered with `trackWrite` finishes, successfully or not, the listener is told its path.
  - The notification is sent after the write is removed from the pending list. So a read started right after the notification does not wait for that write.
  - Why failures are announced too: re-reading costs one request, and there is no need to guess what reached the server.
  - Calling the returned function stops the notifications.
- **`GoalsCard` in `frontend/src/goals.tsx`**
  - It reads again when a write to a path used for the judgment finishes. The paths are the meals, sleep, and daily checks of that day, the alcohol records of the 7 days of that week (Monday to Sunday), and the goals.
  - Alcohol records were narrowed from all of `/api/habits/` in #45 to the 7 days of that week. It does not read again for alcohol records of other weeks, meals of other days, or food edits.
  - When reads overlap, only the answer of the last read is shown. When two saves start two reads, the late answer of the earlier read does not overwrite the new judgment.
  - While reading again, it keeps showing the previous judgment.
  - When the card disappears, it stops listening.
  - The "Judge again" button was kept. It is for changes made outside this page, such as records changed in another tab.
- **Placement of the sleep goal inputs (follow-up to #45)**
  - While checking in the browser, a problem was found on PC (1440×900). In the half-width card, the label "하루 수면 시간 (시간)" (sleep hours per day (hours)) wrapped to two lines, so the hours field sat lower than the minutes field.
  - The visible label of the hours field was shortened to the single word "시간" (hours), like the minutes field.
  - The field has `aria-label="하루 수면 시간 (시간)"`, so the accessible name is unchanged.

## Change — 2026-11-08 (first review applied)

The first review of PR #109 (a read-only review separate from the authoring context) left 3 low-severity items and no defect to fix.

- **Applied 1** On every save, the `role="status"` "다시 판정하는 중" (judging again) inside the goal card button appeared, so a screen reader could read it while the user was working in another card. Now the spinner and `aria-busy` show only when "Judge again" was pressed. A read started by a save is quiet.
- **Applied 2** The test "a save that must read again" passed as soon as the 4th read appeared, so it could not catch more reads after that. It now waits a moment and checks again that there were exactly 4.
- **Left as is 3** If one listener throws synchronously, later listeners are not called. Today's only listener is the single asynchronous `load`, so this does not happen, and it was not fixed.
- That an error message appears on the goal card when the automatic re-read fails was left as it is. It was judged better to tell the user that the previous judgment may be wrong.
- Test: added "a read started by a save is quiet, and only a read started by the button announces" to `frontend/src/goals.test.tsx`.
- Check: only the frontend changed, so `npm run check` was run without a temporary DB and passed.
  - Backend: 111 passed, 96 skipped (DB integration tests). This PR does not change the backend.
  - Frontend: 401 passed, 2 skipped (dark-only conditions).
  - `npm run knip`: passed.

## Change — 2026-11-08 (second review applied)

The second review confirmed the first-review change (the `asked` state) is correct. There was no defect that blocks merging; it found 2 low items and 1 out-of-scope note. This is the last review.

- **Applied 1** Pressing "Judge again" during a quiet read started by a save was ignored. Now the quiet read is replaced by a new read and the spinner announces it. The answer of the late quiet read is discarded. The press is ignored only when a read the person asked for is already in progress.
- **Applied 2** The test added in the first review waited on an always-true `toBeEnabled()`. It was changed to give a judgment different from the first response and wait until "미달" (missed) shows on screen.
- **Note 3 (not fixed in this PR)** The `role="status"` spinner inside a button can get mixed into the button name, or may not be announced by some screen readers. The save buttons of several cards have had the same structure since before #45, so this PR did not change it.
- Test: added "pressing the button during a quiet read reads again and announces" to `frontend/src/goals.test.tsx`.
- Check: `npm run check` without a DB passed (backend 111 passed, 96 DB tests skipped; frontend 402 passed, 2 unrelated skipped), `npm run knip` passed.

## Verification

- Tests
  - `frontend/src/pending-writes.test.ts`: checks that both successful and failed writes are announced, that a read of the same path is not already waiting when it is announced, and that nothing arrives after the notifications are stopped.
  - `frontend/src/goals.test.tsx` (4 added)
    - Saving a meal on the same day changes "달성" (achieved) to "미달" (missed) without a button.
    - It does not read again for a meal or sleep on another day, alcohol in another week (11-01, 11-09), or a food edit. It does read again for alcohol in the same week (11-08), the daily check of that day, and goals.
    - In overlapping reads, the late answer of the earlier read is not shown.
    - A card that disappeared does not read again.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5471/health_test npm run check` with a temporary PostgreSQL 17 cluster (port 5471, `health_test`): passed.
  - Backend: 212 passed, 0 skipped.
  - Frontend: 400 passed, 2 skipped. The 2 skipped are dark-only app condition tests and are unrelated to this change.
  - Skills check: 4 passed.
- `npm run knip`: passed.

### Browser check

The real API (127.0.0.1:3971) and Vite (5271) were started on a temporary DB, and headless Chrome (debugging 9671) was driven over CDP. Data was put in by sending UTF-8 JSON to the API from a Node script. From 11-01 there were 4 goals, and on 11-06 a lunch of 950 kcal, sleep, and a direct check.

| Item                                                                                                                                                                                                                           | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------- |
| Adding 1,300 kcal with "바로 기록" (record directly) on the 11-06 meal card changed the goal card from "달성 950kcal" (achieved) to "미달 2,250kcal" (missed) without a button                                                 | passed  | —        |
| Adding 1,300 kcal on 11-07 (no meals) changed "기록 없음" (no record) to "달성 1,300kcal" (achieved)                                                                                                                           | —       | passed   |
| #45 sleep goal hours and minutes inputs: the existing 7 hours 0 minutes were filled in, `1O` in minutes was rejected, 7 hours 10 minutes saved from 11-06 → current goal and form updated, focus moved to the sleep card title | passed  | —        |
| After saving, the 11-06 sleep judgment became "달성" (achieved) with the new goal (7 hours 10 minutes or more)                                                                                                                 | passed  | —        |
| The hours, minutes, and start-date fields of the sleep goal have the same height (after the fix). Before the fix at 1440 the hours field was pushed down                                                                       | passed  | passed   |

- Each change was tried by clicking at only one of the two widths, and at the other width only the layout was checked.
- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.

## Limits and follow-up

- Records changed in another tab or on another device cannot be known. In that case press "Judge again".
- The difference in the basis of the sobriety "current goal" on the settings screen is handled in #107.
