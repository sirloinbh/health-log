# #203 Keep keyboard focus when adding or removing drink rows

- Issue: [#203](https://github.com/sirloinbh/health-log/issues/203)
- Branch: `fix/203-drink-row-focus`
- Parent: #189 Reliable daily cards and forms

## Purpose

In the alcohol and tobacco form (`frontend/src/habits.tsx`), "Add drink" used `disabled` at the 20-row limit, so adding the 20th row disabled the focused button and dropped keyboard focus to the page. `visits.tsx` and `MoreFoodsButton` already use `aria-disabled` for this reason (#98). Removing a row unmounted the focused remove button with no focus target, and the remove button was named "Drink 1 remove" instead of "Remove drink 1".

## Changes

- "Add drink" uses `aria-disabled` at the limit and ignores presses there, as in `visits.tsx`. At the limit a line under it says "You can record up to 20 drinks per day.", linked to the button with `aria-describedby`.
- Removing a row moves focus to the remove button of the row that takes its place, else the row before it, else "Add drink". The ids come from `useId`, so two forms on one page cannot clash.
- The remove button is named "Remove drink N".
- `frontend/src/habits.test.tsx`:
  - New: "adding the last allowed drink keeps focus on the add button, which then refuses more" starts from a saved day with 18 rows, adds 2, and checks the button keeps focus, is `aria-disabled` but not `disabled`, has the limit description, and adds no 21st row.
  - New: "removing a drink moves focus to the next row, then the previous row, then the add button".
  - Two existing tests use the new name "Remove drink 1".

## Verification

- `node ../node_modules/vitest/vitest.mjs run src/habits.test.tsx` (in `frontend/`): 26 passed.
- Run against the old `habits.tsx` (with only the button name changed, so the tests can find it), the two new tests fail; with the change they pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 145 passed, 126 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 655 passed, 3 skipped; skills tests 4 passed.

## Limits

- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The visible change is one line of muted text under "Add drink" at 20 rows and the button's dimmed state, both styled like the procedure limit in `visits.tsx`.

## Review round 1

- Approve, no blocking comments. One non-blocking thought: the procedure editor in `visits.tsx` could move focus to a neighbouring row the same way; left out of this PR's scope.
