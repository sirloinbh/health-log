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
- In `daily.test.tsx` the stale-today test now also checks that the newer today is shown: the "Upcoming" card appears only on the server's today, and it stays after the older answer arrives.
- Where a fixed wait sat before a check that is true at once (a remounted card has not read yet because a save is out), the wait is removed. These tests now also check the exact request count once the save lands.
- Mutation checks: each of these deliberate bugs now fails a test, and the code was restored afterwards:
  - removing the stale guard in `useHealth` or `report.tsx`;
  - removing the save waits in `sleep.tsx`, `visit-card.tsx`, `reminders.tsx` or `goals.tsx`;
  - having `goals.tsx` read on every save, or keep listening after unmount.

## Change — 2026-11-22

- **New** `frontend/src/test/answered.ts`: `answered(response)` and `nextTask`.
- Tests rewritten in `body`, `checks`, `daily`, `foods`, `goals`, `habits`, `meals`, `medications`, `reminders`, `report`, `sleep` and `visits` `.test.tsx`. No app code changed.

## Verification

### Tests

- `rg "setTimeout\(resolve|Promise.resolve\(\)\)" frontend/src/*.test.tsx`: no matches.
- The 12 changed test files: 323 passed.

### Commands
