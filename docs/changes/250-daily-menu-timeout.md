# #250 Fix the intermittent timeout in the daily main-menu test

- Issue: [#250](https://github.com/sirloinbh/health-log/issues/250)
- Branch: `fix/250-daily-menu-timeout`

## Purpose

`daily.test.tsx` "the main menu opens the day the server counts as today" failed at random when the whole suite ran, with `Unable to find an element with the text: Sunday, March 15, 2026`. Two `report.test.tsx` first-render tests failed the same way once. Each passed when run alone.

## Cause

The test does not wait on the wrong signal. It waits too briefly. The managed `frontend/src/test/standard-setup.ts` (project-standards#680) sets Testing Library's `asyncUtilTimeout` to 8 s for every `findBy*` and `waitFor`. Its header says the app's `setup.ts` should start with `import './standard-setup';`. Vitest loads only `setup.ts` (`setupFiles` in the managed `vitest.config.ts`), and that file never imported it. So the wait stayed at Testing Library's 1 s default. Under a full parallel run, the first render, from the menu click through the `/api/health` read to the redirect and the daily page, can take longer than that.

A throwaway probe test read `getConfig().asyncUtilTimeout`: 1000 before the change and 8000 after it.

## Change

- `frontend/src/test/setup.ts`: starts with `import './standard-setup';` in place of its own `import '@testing-library/jest-dom/vitest';`. The shared setup imports jest-dom too. The rest of the file is unchanged, so the edit stays clear of the screens and cards lanes (#213, #214, and #220, which added lines in the middle of this file).
- The daily and report tests themselves are unchanged. The 8 s wait applies to every first-open test at once, so no test needs its own timeout.

## What the test still checks

- With `TodayRedirect` temporarily changed to navigate to the browser's date (`new Date().toISOString()`), the test fails after 8.5 s with `Unable to find an element with the text: Sunday, March 15, 2026`. That is inside the 15 s `testTimeout`, so a real failure still ends with Testing Library's message. The change was reverted.
- Negative waits (`waitFor(() => expect(...).not...)`) finish as soon as their condition holds, so the longer limit does not make them pass more easily.

## Follow-up

- `setup.ts` still repeats parts of the shared setup (the `matchMedia` and `ResizeObserver` stand-ins and the common `afterEach` resets). They are harmless: the stand-ins use `??=`, and the resets can run twice. Trimming them is a separate cleanup, [#274](https://github.com/sirloinbh/health-log/issues/274), left out to avoid conflicts with the lanes editing this file.

## Verification

- `daily.test.tsx` and `report.test.tsx` together, after merging `origin/main` (with #220): 54 passed. Frontend typecheck clean.
- `npm test -w frontend`, 5 full runs in a row (the done criterion), 2026-11-22 10:32–10:40 under the shared check lock with at least 4 GB free: all 5 passed, each with 75 files and 770 passed, 3 skipped (64–90 s per run). A first attempt earlier that morning was stopped by Claude Code for low memory before any run started.
- `npm run check` under the same lock, `TEST_DATABASE_URL` empty (no backend change): passed. Frontend 770 passed, 3 skipped. Backend 293 tests, 0 failed, 137 skipped without a `health_test`.
