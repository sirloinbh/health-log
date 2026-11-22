# #201 Break readNutritionLabel into small tested steps

- Issue: [#201](https://github.com/sirloinbh/health-log/issues/201)
- Branch: `refactor/201-label-reader-steps`

## Purpose

`readNutritionLabel` in `frontend/src/nutrition-label.ts` was one 210-line function with more than a dozen closures (`nearestTotal`, `headCells`, `sizesIn`, ...), so its decisions in between could not be unit-tested. Regular expressions were built inline from fragments, and the price lookahead was written twice.

## Change

- The closures are module-level functions with explicit inputs: `findTotals` (heading and package size), `nearestTotal`, `chooseBasis` (the head the values are read under), `chosenTableRange`, `lineStart`, `stackedHeads`, `headColumns`, `sizesIn`, `hasBracketedBasis`, `firstColumns` and `readValues`. `readNutritionLabel` now calls them in order (25 lines).
- Shared regex pieces are named once at the top: `amount`, `number`, `unit`, `energyWords` and `notPrice` (the price lookahead, used by the basis pattern and by `sizesIn`). The patterns built in the old function are module constants (`nameHead`, `valueStart`, `sizeMention`, `kcalValue`, `nameGap`, `energyValue`, `nutrientValue`), so they are compiled once.
- `normalize`, `basisCandidates`, `headRow`, `firstColumn` and the new steps are exported for the tests.
- The longest function in the file is now `basisCandidates` with 42 lines (done criterion: 80 at most). Before, `readNutritionLabel` had 210.
- No behavior change is intended.

## Verification

- `frontend/src/nutrition-label.test.ts` is unchanged (`git diff origin/main` on it is empty) and passes.
- New `frontend/src/nutrition-label-steps.test.ts` (18 tests): `normalize`, `findTotals`, `basisCandidates`, `headRow`, `firstColumn`, `sizesIn`, `hasBracketedBasis`, `stackedHeads`, `headColumns` and `readValues`, each on its own.
- `vitest run src/nutrition-label-steps.test.ts src/nutrition-label.test.ts src/foods.test.tsx`: 102 passed.
- Old and new parser compared outside the repository: every string literal of `nutrition-label.test.ts`, every pair of them, and every run of lines of each, 10,607 inputs, gave the same result from both (0 differences).
- Function lengths measured with the TypeScript parser: longest 42 lines (`basisCandidates`), then `hasBracketedBasis` 38 and `tableRange` 31.
- `npm run check` with `TEST_DATABASE_URL` set to a throwaway local PostgreSQL 17 `health_test`: passed (format, lint, contract, typecheck, backend 286 passed and 0 skipped, frontend 676 passed and 3 skipped, skills, build).
