# #271 Round per-food and per-entry calories like the totals

- Issue: [#271](https://github.com/sirloinbh/health-log/issues/271)
- Branch: `fix/271-item-calorie-text`

## Purpose

#206 added `kcalText`, which rounds a calorie amount to a whole number with thousands grouping ("1,235kcal"), and used it for totals. Single amounts still printed the API value as it was. A combo row with 1.5 servings of a 412.5kcal food read "618.75kcal", while the total under it read "1,235kcal".

## Change — 2026-11-22

- `frontend/src/calorie-text.ts`: new `calorieText(value | null)`, which gives `kcalText(value)`, or "No calorie value" when the value is unknown. The four places below wrote that same choice inline.
- It is used for the combo food search rows and the combo item rows (`frontend/src/combos.tsx`), the meal entry rows (`frontend/src/meals.tsx`), and the food choice list (`frontend/src/food-choices.tsx`, shared by the meal and combo searches).
- Only the display changes. The API values and the numbers sent back are unchanged.

Tests:

- `frontend/src/calorie-text.test.ts`: `calorieText` rounds 618.75 to "619kcal" and 1234.5 to "1,235kcal", keeps 0, and says "No calorie value" for null.
- `frontend/src/combos.test.tsx`: a combo item of 618.75kcal reads "샘플 햇반 · 1.5 servings · 619kcal", and "618.75" is not shown.
- `frontend/src/meals.test.tsx`: an entry of 1234.5kcal reads "… · 1,235kcal", and a searched food of 412.5kcal per serving reads "Serving 120g · 413kcal".

## Verification

- `vitest run src/combos.test.tsx src/meals.test.tsx src/calorie-text.test.ts`: passed (combos and calorie-text 98 together, meals 68 after the food-choice test was added).
- `origin/main` (#275, #207 plural wording) was merged in. It conflicted on the two lines that #207 also changed (`count(servings, 'serving')` in `meals.tsx` and `combos.tsx`); both changes were kept. The affected tests: 100 passed.
- `npm run check` (foreground, under the lanes' shared check lock) with `TEST_DATABASE_URL` on a temporary PostgreSQL 17 `health_test`: passed. Backend 298 passed, 0 skipped; frontend 775 passed, 3 skipped (existing skips); contract 3, skills 4 passed; format, lint, typecheck and build passed.
- Browser check (Playwright, local API and Vite on the temporary database, rows 412.5kcal per serving, a combo of 1.5 servings and a 1234.5kcal entry), at 390×844 and 1440×900:
  - Combos page item row: "browser-check rice · 1.5 servings · 619kcal", the same as the summary "1 food · 619kcal".
  - Combo editor food search row and the meal card food search row: "Serving 210g · 413kcal".
  - Meal card entry row: "1 serving · 1,235kcal".
  - No horizontal scroll at either size. The test rows were deleted afterwards.

## Review round 1 — 2026-11-22

- nit, fixed: the combo test matched "1.5 servings?" with a pattern because it was written before #207 (`count()`) reached main. It now expects the exact text "샘플 햇반 · 1.5 servings · 619kcal". `vitest run src/combos.test.tsx`: 29 passed.
- No other findings: the four inline null-or-kcal choices are gone (`rg "calories === null ? 'No calorie value'"` finds none outside tests), and the API values are unchanged.

## Follow-up

- The browser check showed one more place outside this issue's three files: the daily goal row reads "1,234.5kcal" (`goal-text.ts` keeps two decimals). Filed as #279 under #189.
