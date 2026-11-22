# #274 Keep only health-log setup in the frontend test setup file

- Issue: [#274](https://github.com/sirloinbh/health-log/issues/274)
- Branch: `refactor/274-setup-own-parts`

## Purpose

#250 made `frontend/src/test/setup.ts` import the managed `standard-setup.ts`, but left the file's own copies of the shared parts. The `matchMedia` and `ResizeObserver` stand-ins did nothing (both use `??=`), and most of the `afterEach` resets ran twice.

## Decisions

- Removed from `setup.ts`, since `standard-setup.ts` already has them: the `matchMedia` and `ResizeObserver` stand-ins, and the `useRealTimers`, `unstubAllGlobals`, `restoreAllMocks`, `localStorage.clear`, theme class and URL resets.
- Kept, as health-log's own:
  - the `fetch` stand-in and the request check (#214);
  - `forgetPendingWrites` and `forgetQueryClient`.
- Also kept: one `cleanup()` call first in health-log's `afterEach`, with a comment saying why. Vitest 5 runs `afterEach` hooks in reverse order (`sequence.hooks` defaults to `stack`). So health-log's hook, registered after the import, runs before the shared one. The cards must unmount before their query cache and pending writes are forgotten, and before the requests are checked; the shared `cleanup()` after it then has nothing left to do.
  - Checked: the installed Vitest 5.0.3 defaults to `stack` and reverses `afterEach`. A throwaway test confirmed the order, and that the shared reset still unstubs globals.
  - No current test fails without this call (the suite passed with it removed). It is kept so the order does not depend on the tests of the day.

## Change — 2026-11-22

- `frontend/src/test/setup.ts`: 6 lines added, 28 removed.

## Verification

### Tests

- `npm test -w frontend`: 77 files, 780 passed, 3 skipped.

### Commands
