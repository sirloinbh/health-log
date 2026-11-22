# #209 Close validation gaps in sleep goal and amount helpers

- Issue: [#209](https://github.com/sirloinbh/health-log/issues/209)
- Branch: `fix/209-validation-gaps`
- Parent: #189 Reliable daily cards and forms

## Purpose

Three latent gaps that the current forms cannot reach but the helpers allowed:

- `toSleepTarget(8, -30)` in `frontend/src/goal-text.ts` passed both checks and returned 450. `toTarget` passed `NaN` on to its whole-number check with a misleading message.
- `parseAmount` in `frontend/src/number-input.ts` accepted 9 integer plus 9 decimal digits, so `999999999.999999999` became `1000000000`, against the test named "digits too long to be exact are rejected, not rounded".
- `MoreFoodsButton` (`frontend/src/more-foods-button.tsx`) had no rejection handler for `onLoad`, so a rejected load would escape as an unhandled rejection.

## Changes

- `toSleepTarget` refuses minutes below 0 with "Sleep time: enter minutes from 0 to 59"; `NaN` hours or minutes already fail the whole-number check. `toTarget` refuses `NaN` with the range message.
- `parseAmount` also refuses more than 15 significant digits (what a double holds exactly). Leading zeros and zeros after the last decimal digit do not count, so "0.000000001" and "000000070.500000000" are still read.
- `MoreFoodsButton` catches a rejected `onLoad`. The `loading` state belongs to the caller (`useFoodSearch.loadMore` already ends it in `finally` and never rejects); the button stays focused so it can be pressed again.
- Tests:
  - `frontend/src/goal-text.test.ts`: `toSleepTarget(8, -30)` and `NaN` cases; new test for `toTarget` range, whole-number and `NaN` messages.
  - `frontend/src/number-input.test.ts`: the 18-digit and 16-digit cases are refused; new test for 15 significant digits and surrounding zeros.
  - New `frontend/src/more-foods-button.test.tsx`: focus moves to the count line after the last page; a rejected load is caught and the button keeps focus and can be pressed again.

## Verification

- `vitest run src/goal-text.test.ts src/number-input.test.ts src/more-foods-button.test.tsx` (in `frontend/`): 26 passed.
- With the three sources reverted to `origin/main`, 3 tests fail and vitest reports 2 unhandled rejections from the button test; with the change all pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 156 passed, 137 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 775 passed, 3 skipped; skills tests 4 passed.

## Limits

- No screen change, so no browser check.

## Review round 1

- Approve, no blocking comments. One non-blocking nitpick: an over-long number still gets the generic "enter digits only" message, as the 400-digit case already did.
