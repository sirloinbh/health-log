# #306 Apply the user decisions on junk wording, overdue reminders and the medication start date

- Issue: [#306](https://github.com/sirloinbh/health-log/issues/306)
- Branch: `fix/306-user-ui-decisions`
- Parent: #189 Reliable daily cards and forms
- User decisions (2026-11-22), recorded on #206, #207 and #204

## Purpose

The user reviewed three choices made in earlier fixes and chose differently:

1. #206 (PR #270) dropped "or more" from the junk-food partial total to match the combo wording. The total leaves out records with unknown calories, so it is a lower bound and says so again.
2. #207 (PR #275) made a past reminder date read "N days ago". It now reads "Overdue by N days".
3. #204 (PR #254) made "Add medication" wait for the server's date, with a note when it fell back to the device date. The dialog now opens at once on today in Asia/Seoul by this device's clock, with no wait and no note. The date stays editable.

## Changes

- `frontend/src/junk-text.ts`: a partial total reads "250kcal or more (excludes 1 record with unknown calories)".
  - Combo wording checked: `comboSummary` keeps "300kcal (excludes 1 food with unknown calories)". The junk line is on the meals page and the combo line on the combos page and the add-entry list, so the two never sit side by side, and the combo line reads well on its own. The goal card's "(excludes 1 food with unknown values)" is unchanged for the same reason.
- `frontend/src/reminder-text.ts`: `whenText` says "Overdue by 1 day" / "Overdue by 3 days" for a past date. "Today", "Tomorrow" and "In N days" stay.
- `frontend/src/medications.tsx`:
  - "Add medication" opens the dialog at once with `serviceToday()` (today in Asia/Seoul by the device clock). The `aria-disabled` wait, the screen-reader "Checking today's date…" line and the "The server's date could not be checked…" note are gone.
  - A visit link without a usable date (`?visit=<id>`) also opens at once on that date instead of waiting for the server, so both add paths use the same date. A link with a date still starts on the visit's day.
  - `MedicationsPage` no longer takes the server's `today`; `frontend/src/app.tsx` stops passing it. The visits page still gets it.
- `frontend/src/daily-date.ts`: the `serviceToday` comment names the new use.

## Tests

- `frontend/src/junk-text.test.ts`: the two partial-total cases expect "or more".
- `frontend/src/meals.test.tsx`: the junk-food summary on the meal card expects "2,100kcal or more (excludes 1 record with unknown calories)". The first `npm run check` caught this screen test still expecting the old wording.
- `frontend/src/reminders.test.tsx`: past dates expect "Overdue by 1 day" and "Overdue by 3 days".
- `frontend/src/medications.test.tsx`:
  - New: "adding opens at once on this device's today in Asia/Seoul, without waiting for the server". The server's date never arrives; the clock is fixed at 2026-03-15 23:30 UTC (already 2026-03-16 in Asia/Seoul). The button is not `aria-disabled` and has no description, the dialog opens on 2026-03-16 with no note, and the date can be changed.
  - Removed: the two #204 tests for waiting and for the fallback note, whose behavior is gone.
  - The two tests that expect a start date of 2026-03-15 fix the clock at 2026-03-15 12:00 in Asia/Seoul (`clockAt`), so they do not depend on the day they run.
- Against the old `junk-text.ts`, `reminder-text.ts`, `medications.tsx` and `app.tsx` (from `origin/main`), the new assertions fail: 4 failed, 31 passed. With the change: 35 passed.

## Verification

- `node ../node_modules/vitest/vitest.mjs run src/medications.test.tsx src/junk-text.test.ts src/reminders.test.tsx` (in `frontend/`): 35 passed.
- `npm run check` with `TEST_DATABASE_URL` empty: passed. Format, lint, contract, typecheck and build passed; scripts tests 3 passed; backend 156 passed, 137 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 785 passed, 3 skipped; skills tests 4 passed. The first run failed in `src/meals.test.tsx` (old junk wording), fixed above.

## Limits

- No browser check at 390×844 and 1440×900: running the app needs the `health` database, which this worktree does not have. The visible changes are two words in a text line, a reworded reminder label, and an add button that is never dimmed.

## Review round 1

- `suggestion (blocking)`: the visit-link path (`?visit=<id>` without a usable date) now also starts on the device date, but its test could not tell the device date from the server's, since both were 2026-03-15. Fixed in "test: tell the device date from the server's on a visit link (#306)": that test fixes the clock at 2026-03-15 23:30 UTC (2026-03-16 in Asia/Seoul) while the server's date stays 2026-03-15, and expects 2026-03-16. Against the old `medications.tsx` it fails; with the change it passes.
- Otherwise no findings: editing still starts from the medicine's own date (`draftOf` uses `item.startOn`), the visits page still gets the server's date, and no other code used `fromDevice` or the wait.
- `vitest run src/medications.test.tsx`: 18 passed. `eslint` and `prettier --check` on the changed files: passed. Only a test and this record changed after the full `npm run check`, so it was not repeated.
