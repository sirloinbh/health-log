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
