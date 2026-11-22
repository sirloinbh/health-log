# #210 Split meals AddEntry into a form hook and smaller forms

- Issue: [#210](https://github.com/sirloinbh/health-log/issues/210)
- Branch: `refactor/210-meals-add-entry`

## Purpose

`AddEntry` in `frontend/src/meals.tsx` was about 475 lines with 15+ state hooks, six `useNotice` instances and five submit handlers. Which add button was waiting was a string key (`search-<id>`, `combo-<id>`, ...) parsed back with `startsWith` and `Number(slice)`, so a typo failed silently.

## Decisions

- Pure refactor: no text, layout, request, request order or focus behavior changed. `frontend/src/meals.test.tsx` is not changed and passes.
- The waiting button is a discriminated union, `Pending` in `frontend/src/meal-entry.ts`: `{ kind: 'food', list, foodId }`, `{ kind: 'combo', comboId }`, `{ kind: 'copy' }`, `{ kind: 'typed' }`. `waitingFood` and `waitingCombo` read it, so the compiler checks every use.
- Shared state goes in `useAddEntry` (`frontend/src/use-add-entry.ts`): meal, quantity, the waiting button, the six form messages with one `clear`, `readServings`, the recently eaten foods (`useRecentFoods`) and `record`, which runs one add with its spinner. `record` calls `onRecorded` inside the same `try` as before, so the recent-foods reload still starts before the spinner clears, in the same request order as before.
- State only one form uses stays in that form: the search query and results (`FoodSearch`), the combos (`ComboPicker`), the copy date (`CopyMealForm`), and the typed name, calories and junk mark (`TypedFoodForm`).
- `FoodChoices` and `JunkBadge` moved to `frontend/src/food-choices.tsx`, used by both the add forms and the entry rows.

## Change — 2026-11-22

- **New** `frontend/src/meal-entry.ts`: `meals`, `MealKey`, `FoodOption`, `FoodList`, `Pending`, `waitingFood`, `waitingCombo`.
- **New** `frontend/src/use-add-entry.ts`: `useAddEntry` and `useRecentFoods`.
- **New** `frontend/src/add-entry.tsx`: `AddEntry` (37 lines) with `MealPicker`, `ServingsField`, `RecentFoods`, `FoodSearch`, `ComboPicker`, `CopyMealForm`, `TypedFoodForm` (the longest is 87 lines).
- **New** `frontend/src/food-choices.tsx`: `FoodChoices`, `JunkBadge`.
- `frontend/src/meals.tsx`: the card, totals, junk summary and entry rows only (850 → 298 lines). The longest component is `MealCard` at 157 lines.

## Verification

### Tests

- `frontend/src/meals.test.tsx`: unchanged, passes. With `save-focus.test.tsx` and `daily.test.tsx` (which render the meal card): 106 passed.
- **New** `frontend/src/meal-entry.test.ts` (3 tests): a waiting food shows only in the list it was added from, even when the same food is in both lists; nothing waits in the food lists during a combo, copy or typed add; only the pressed combo waits, never a food with the same id.

### Browser

Temporary local DB, API (3984) and Vite (5284), checked with Playwright on `/daily/2026-10-05`:

- 390×844: with "Lunch" chosen, a typed food (`Test rice bowl`, 500 kcal) was recorded under Lunch and the name field cleared; a search for "밥" showed "9 results"; the copy button read "Copy lunch". No horizontal overflow.
- 1440×900: adding the first search result recorded it under Lunch and moved it to the top of the recently eaten foods; copying lunch from an empty day showed "No lunch records to copy from Sunday, October 4, 2026" next to the copy form (the browser logs the expected 404). No overflow.

### Commands

- `TEST_DATABASE_URL= npm run check` (run under the shared check lock): passed. Frontend 692 passed, 3 skipped; backend 154 passed, 127 DB tests skipped because `TEST_DATABASE_URL` was emptied (CI runs them); skill checks 3 passed.
- `E2E_DATABASE_URL=<temporary local DB> npm run knip`: passed (configuration hints only).
