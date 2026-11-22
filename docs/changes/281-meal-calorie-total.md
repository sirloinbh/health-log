# #281 Round the daily calorie total on the meal card

- Issue: [#281](https://github.com/sirloinbh/health-log/issues/281)
- Branch: `fix/281-meal-calorie-total`
- Parent: #189 Reliable daily cards and forms

## Purpose

The meal card's daily totals (`Totals` in `frontend/src/meals.tsx`) printed each total as `${value}${unit}`, so a 1234.5kcal day read "Calories 1234.5kcal". Every other calorie amount reads "1,235kcal" through `kcalText`: combo and junk totals (#206), per-food and per-entry calories (#271), and the goal row (#279).

## Changes

- `totalText` in `frontend/src/meals.tsx` shows the calorie total with `kcalText` from `frontend/src/calorie-text.ts`, as #271 does for the entries. No new helper.
- The carbohydrate, protein, fat, sugar (g) and sodium (mg) totals keep the API's value, as the issue allows. The goal row also keeps protein decimals, so they still agree. "No value" for an unknown total is unchanged.
- `frontend/src/meals.test.tsx`: new test "the calorie total of the day is rounded and grouped, and gram totals stay as they are" (1234.5kcal → "1,235kcal", 82.5g stays "82.5g", no "1234.5" on the card).

## Verification

- `vitest run src/meals.test.tsx` (in `frontend/`): 70 passed.
- With `meals.tsx` reverted to `origin/main`, the new test fails; with the change it passes.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed (frontend 779 passed / 3 skipped in 76 files; backend 156 passed / 137 skipped, the DB tests that need `health_test` and run in CI).

## Limits

- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The change is the number format of one total, covered by the screen test.
