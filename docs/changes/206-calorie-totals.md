# #206 Round and group calorie totals in combo and junk summaries

- Issue: [#206](https://github.com/sirloinbh/health-log/issues/206)
- Branch: `fix/206-calorie-totals`
- Parent: #189 Reliable daily cards and forms

## Purpose

`comboSummary` in `frontend/src/combo-text.ts` printed the API's calorie sum as it came, so a combo read "1234.75kcal" while the report read "1,850kcal". `junkText` in `frontend/src/junk-text.ts` did the same, and its partial-total wording ("250kcal or more (excludes …)") differed from the combo's ("300kcal (excludes …)"). The fixture in `combo-text.test.ts` had item calories that contradicted the totals.

## Changes

- New `frontend/src/calorie-text.ts` with `kcalText`: rounds to a whole number and groups with `en-US` ("1,235kcal").
- `comboSummary`, `junkText` and the three calorie formats in `frontend/src/report.tsx` (average, change, chart) use `kcalText`. Report averages already arrive as whole numbers from the server, so the report reads the same.
- Junk-food partial totals drop "or more" and read like a combo's, the report's and the goal results' partial totals: "250kcal (excludes 1 record with unknown calories)".
- Tests:
  - New `frontend/src/calorie-text.test.ts`: rounding (1234.75, 1234.25, 999.5), zero, and grouping.
  - `frontend/src/combo-text.test.ts`: the fixture builds each total from its items' calories (null for the missing ones); new fractional case (618.75 + 615.5 + 0.5 → "1,235kcal") and a fractional partial total.
  - `frontend/src/junk-text.test.ts`: grouped totals, the aligned partial wording, and fractional cases.
  - `frontend/src/meals.test.tsx`: the two junk-food lines it checks now read "1,850kcal" and "2,100kcal (excludes 1 record with unknown calories)". Only those two lines changed, as another lane is working on meals.

## Verification

- `vitest run` on `calorie-text`, `combo-text`, `junk-text`, `report`, `meals`, `combos` and `add-entry` tests (in `frontend/`): 127 passed.
- Against the old `combo-text.ts` and `junk-text.ts`, 4 of the combo and junk text tests fail; with the change they pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 154 passed, 131 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 762 passed, 3 skipped; skills tests 4 passed.

## Limits

- Per-item and per-entry calories (`combos.tsx` food rows, `meals.tsx` entries, `food-choices.tsx`) still print the raw value; the issue covers totals only.
- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The visible change is the number format of a text line.

## Review round 1

- Approve, no blocking comments. Out-of-scope finding filed as #271: per-food and per-entry calories in `combos.tsx`, `meals.tsx` and `food-choices.tsx` still print raw values.
