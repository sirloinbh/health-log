# #200 Split FoodDialog and move label fill logic into a pure module

- Issue: [#200](https://github.com/sirloinbh/health-log/issues/200)
- Branch: `refactor/200-food-dialog-split`

## Purpose

`frontend/src/foods.tsx` was 659 lines: the form model, an 85-line `fill` algorithm, a 300-line `FoodDialog`, the food card and the page. The rules for filling the form from a pasted nutrition table could only be tested by rendering the dialog, pasting and clicking.

## Change

- `frontend/src/food-form.ts` (new, no React): the nutrient list, source labels, `Food` and `Form` types, `emptyForm`, `formOf`, `bodyOf`, `unreadableField` (the first number field that cannot be read), and `fillFromLabel(form, reading, today)`. `fillFromLabel` returns either the filled form with the lines to announce, or an error with its lines and no form. It takes the checked date as an argument, so tests do not depend on the clock.
- `frontend/src/food-dialog.tsx` (new): `FoodDialog`, split into `LabelReader` (paste, read, result message), `FoodFields` (name to nutrition values), `SourceFields` (source, verified date, junk mark) and `Actions` (Cancel and Save). The paste text and the result message now live in `LabelReader`.
- `frontend/src/foods.tsx`: only `FoodCard` and `FoodsPage`, 199 lines (was 659).
- The screen is meant to stay the same: same labels, ids, roles, texts and order. The fill messages are built by the same rules, now in one place.

## Verification

- New `frontend/src/food-form.test.ts` (10 tests): the fill with a basis (values, serving, label source, today's date), clearing values the table leaves out or marks "less than" or too large while keeping name, brand and URL, the source-type warning only for published data, the "basis from total" and package lines, values without a basis, a basis without values, no table, the input form not changed in place, and the form model round trip, blank handling and the unreadable-number check.
- `frontend/src/foods.test.tsx` is unchanged and passes, which shows the page and dialog behave as before (adding, editing, saving, focus, and the 6 paste-and-fill tests).
- `vitest run src/food-form.test.ts src/foods.test.tsx src/nutrition-label.test.ts`: 94 passed.
- `knip`: no unused export in the new files (it still reports the existing `e2e/smoke.spec.ts` and `@axe-core/playwright` items, and fails to load `playwright.config.ts` without a DB URL; not from this change).
- `npm run check` with `TEST_DATABASE_URL` set to a throwaway local PostgreSQL 17 `health_test`: format, lint, contract, typecheck, backend tests (277 passed, 0 skipped), `test:skills` and `build` passed. Four worktrees ran checks at the same time, and the frontend suite had timing failures in files this change does not touch: `src/daily.test.tsx` "the main menu opens the day the server counts as today" in both runs, and 2 tests in `src/report.test.tsx` in the first run (each `findByText` gave up after 1 second). Run alone, `daily.test.tsx` and `report.test.tsx` pass (54 passed). Every other frontend test passed (662 passed, 3 skipped). CI is the judge.

## Limits

- No browser check at 390x844 and 1440x900: the markup is unchanged and the page tests query it by role and label. If a review finds a visible difference, check it in the browser.
