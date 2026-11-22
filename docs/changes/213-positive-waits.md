# #213 Replace fixed-delay negative assertions in screen tests

- Issue: [#213](https://github.com/sirloinbh/health-log/issues/213)
- Branch: `test/213-positive-waits`

## Purpose

39 screen tests waited a fixed time (`setTimeout(resolve, 0 | 20 | 50)` or `act(() => Promise.resolve())`) and then checked that something did **not** happen: a stale answer did not land, focus did not move, a card did not read. Such a check also passes when the wait ends before the app has even handled the answer, so it can hide the bug it is there to catch.

## Decisions

- Each negative check now waits for a positive signal first. Four kinds:
  - **A late or stale answer changed nothing**: the new helper `answered(response)` in `frontend/src/test/answered.ts` waits until the app has read that response's body, then lets the promise steps after the read and the zero-delay timers of the resulting render run. Only then does the test check that the screen and focus are unchanged.
  - **A card waits for a save still on its way**: the test records, at each read, whether the save had already settled (`landedAtRead`), or logs reads and saves in order (`logReads` in `goals.test.tsx`). It lands the save one task after mounting (`nextTask`), by which time a card that did not wait would already have read. Then it requires every read to come after the save.
  - **Saves that should not start a read**: in `goals.test.tsx` each save that should read is waited for, so a read started by an earlier save that should not count shows up out of place in the log.
  - **A press that reaches nothing**: wait for the "Try again" button to go, then count requests.
- After merging `main` with #220 (health read through React Query), `answered` showed that three of these tests no longer tested anything on `main`; each failed here until fixed:
  - `daily.test.tsx`, "a slow older response does not overwrite a newer today": React Query runs one health check at a time, so the tab-return check never started beside the slow one, and the mock counted the new body, visit and medicine reads as health checks. The test now answers only `/api/health` and checks the current design: a tab return while a check is out starts none beside it, the older today is shown when it lands, and the next check shows the newer today (the "Upcoming" card, which appears only on the server's today, and no "Today" link).
  - `report.test.tsx`, "a report still on its way does not land next to the word about a date out of range" and "an answer for a period already left does not replace the one on screen": health now arrives a tick later, so the address moved before the week's report was even requested. Both now wait until that request has gone out.
- Where a fixed wait sat before a check that is true at once (a remounted card has not read yet because a save is out), the wait is removed. These tests now also check the exact request count once the save lands.
- Mutation checks: each of these deliberate bugs now fails a test, and the code was restored afterwards:
  - removing the stale guard in `report.tsx` (3 tests), or in the old `useHealth` before #220;
  - removing the save waits in `sleep.tsx`, `visit-card.tsx`, `reminders.tsx` or `goals.tsx`;
  - having `goals.tsx` read on every save, or keep listening after unmount.

## Change — 2026-11-22

- **New** `frontend/src/test/answered.ts`: `answered(response)` and `nextTask`.
- Tests rewritten in `body`, `checks`, `daily`, `foods`, `goals`, `habits`, `meals`, `medications`, `reminders`, `report`, `sleep` and `visits` `.test.tsx`. No app code changed.

## Verification

### Tests

- `rg "setTimeout\(resolve|Promise.resolve\(\)\)" frontend/src/*.test.tsx`: no matches.
- The 12 changed test files after merging `main`: 337 passed.

### Commands
