# #260 Fill the unit as mL when a pasted label gives ml

- Issue: [#260](https://github.com/sirloinbh/health-log/issues/260)
- Branch: `fix/260-label-unit-ml`

## Purpose

#199 decided that milliliters are written `mL` (`docs/food-data.md`, migration `020_foods_serving_units.sql`). The label reader still returned `unit: 'ml'`, so a food filled from a pasted drink label got `ml` in its unit field, next to seeded foods with `mL`.

## Change

- `frontend/src/nutrition-label.ts`: the reading's `basis` and `total` now use a new `Amount` type with the unit `'g' | 'mL'`. `readNutritionLabel` converts `ml` to `mL` once, at its return (`stored`).
  - Inside the reader, sizes keep the lower-case `ml` of the normalized text. The steps compare sizes as text (`sizesIn` against the chosen basis), so changing them earlier would change which basis is chosen.
  - The fill messages and the package line ("The total amount of 500mL is 5 times the serving size (100mL)") show `mL` too, because they print the reading's units.

## Verification

- New test in `frontend/src/food-form.test.ts`: a pasted "총 내용량 500ml / 100ml당" table fills the unit field with `mL`, and the package line says `500mL` and `100mL`. It failed with the old reader and passes now.
- Changed expectations:
  - `nutrition-label.test.ts`: two basis expectations from `'ml'` to `'mL'` (250 mL package, 200 mL serving).
  - `food-form.test.ts`: the "basis without values" message now says `100mL`.
- `nutrition-label-steps.test.ts` is unchanged and passes, which shows the internal steps still work on `ml`.
- `vitest run src/food-form.test.ts src/nutrition-label.test.ts src/nutrition-label-steps.test.ts src/foods.test.tsx`: 113 passed. Frontend typecheck clean.
- `npm run check` (run under the shared lock, `TEST_DATABASE_URL` empty): passed. Frontend 732 passed and 3 skipped. Backend 285 tests, 0 failed, 131 skipped because no `health_test` was set; this change has no backend or DB part.
