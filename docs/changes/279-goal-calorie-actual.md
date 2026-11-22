# #279 Round the calorie actual on the daily goal row like the totals

- Issue: [#279](https://github.com/sirloinbh/health-log/issues/279)
- Branch: `fix/279-goal-calorie-actual`
- Parent: #189 Reliable daily cards and forms

## Purpose

The goal results card on the daily page built its calorie text with `actualText` in `frontend/src/goal-text.ts`, whose `number` helper keeps up to two decimals. A 1234.5kcal day read "1,234.5kcal · Goal: …" there, while combo and junk totals (#206) and per-food and per-entry calories (#271) read "1,235kcal" through `kcalText`.

## Changes

- `actualText` shows the calorie sum with `kcalText` from `frontend/src/calorie-text.ts`, the helper #206 added and #271 (PR #280, still open) builds on. No second helper was written.
- `targetText` shows the calorie goal with `kcalText` too. Goals are whole numbers (the server takes integers only), so "Up to 2,000kcal a day" reads the same.
- Protein keeps `number` (up to 2 decimals, grouped): the meal card also shows protein with its decimals, so there is no mismatch there. Sleep and alcohol-free wording are unchanged.
- Tests:
  - `frontend/src/goal-text.test.ts`: new test with a 1234.5kcal day ("1,235kcal"), a partial 1234.25kcal day ("1,234kcal (excludes 1 food …)"), the calorie target, and a 1234.5g protein day that keeps "1,234.5g".
  - `frontend/src/goals.test.tsx`: new test that the goal row reads "1,235kcal · Goal: Up to 2,000kcal a day" and shows no "1,234.5".

## Verification

- `vitest run src/goal-text.test.ts src/goals.test.tsx` (in `frontend/`): 33 passed.
- With `goal-text.ts` reverted to `origin/main`, the two new tests fail; with the change they pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 156 passed, 137 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 777 passed, 3 skipped; skills tests 4 passed.

## Limits

- Found while checking the other calorie texts: the meal card's daily totals (`frontend/src/meals.tsx:61`) still print the calorie total unrounded ("1234.5kcal"). That file is in PR #280's area, so it is filed as #281 under #189 instead of changed here.
- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The visible change is the number format of one text line, covered by the screen test.

## Merge of origin/main

- Merged `origin/main` after the commit (it brought #276, React Query for meals and goals, which changed `goals.tsx` and `goals.test.tsx`); no conflict. `vitest run src/goal-text.test.ts src/goals.test.tsx`: 34 passed. CI runs the full check on the merged head.

## Review round 1

- Approve, no blocking comments. The meal card daily total is left to #281.
