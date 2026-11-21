# #202 Guard the goal settings reload against stale responses

- Issue: [#202](https://github.com/sirloinbh/health-log/issues/202)
- Branch: `fix/202-goal-settings-reload`
- Parent: #189 Reliable daily cards and forms

## Purpose

`GoalsSettings.load` in `frontend/src/goals.tsx` had no request-sequence guard, unlike `GoalsCard.load`. Each deleted goal change applies an optimistic update and reads `/api/goals` again, so two quick deletes started overlapping reads; when the older read answered last, the change deleted second came back on screen. A failed read after a delete also showed an error above the goals with no way to retry: the "Try again" button only appeared while no goals were loaded.

## Changes

- `GoalsSettings` counts its reads (`latest` ref, as in `GoalsCard`). Only the latest read may set the goals or show an error; an older answer is dropped.
- "Try again" now shows whenever the read failed, also when goals are already on screen. Pressing it reads again and moves focus to the section title, as before.
- `frontend/src/goals.test.tsx`:
  - New test: two deletes whose reads answer out of order. The second read answers first, then the first read answers with the change deleted second still in it; neither deleted change comes back.
  - The test "a deleted change stays gone even if reading the goals again fails" now also presses "Try again", checks the error and the button are gone, the goals stay on screen, and focus is on the "Goals" heading.

## Verification

- `node ../node_modules/vitest/vitest.mjs run src/goals.test.tsx` (in `frontend/`): 22 passed.
- With the `goals.tsx` change reverted, the two tests above fail (the deleted 2026-11-20 change comes back; no "Try again" button), and pass with it.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 141 passed, 126 skipped (DB integration tests need `health_test`, which is not set locally; CI runs them); frontend 652 passed, 3 skipped; skills tests 4 passed.

## Limits

- No browser check at 390×844 and 1440×900: the only visible change is the "Try again" button, which already existed and now also shows above a loaded goal grid after a failed read. The tests cover the behavior.
