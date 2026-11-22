# #302 Guard the combo picker read and the food and combo dialog saves against late answers

- Issue: [#302](https://github.com/sirloinbh/health-log/issues/302)
- Branch: `chore/302-stale-answer-guards`
- Parent: #221

## Purpose

#282 moved the screen reads to React Query and left two paths on purpose without a stale-answer guard: the meal card's combo picker read and the food and combo dialog saves. Both called `requestJson` directly. This moves them onto the shared query layer (`frontend/src/lib/query.ts`, a managed file that is not edited here).

## Change — 2026-11-22

- **Combo picker** (`ComboPicker`, `frontend/src/add-entry.tsx`): reads with `useApiQuery` on `apiKey('/api/combos')`, enabled once "Choose from combos" is pressed. Each press calls `refetch({ throwOnError: true })`, so it still reads now even with a fresh cache, and a newer read cancels one still on its way. The list is the combos page's cache entry, so combo and food saves mark it stale. Leaving the day removes the last observer, and React Query aborts the request through the query's signal; that cancelled read ends without a message. The local `combos`/`loading` state is gone (`loading` is `isFetching` once asked).
- **Food dialog** (`FoodDialog`, `frontend/src/food-dialog.tsx`): saves with `useApiMutation(asRequest, { onSuccess: foodChanged })`. `foodChanged` (moved from `foods.tsx`) marks the meal days, combos and recent foods stale on every successful answer, even one that lands after the page is gone. The dialog's own reaction (close, "Saved", the page's list reload) goes through `mutate`'s per-call callbacks, which React Query runs only for the latest call while the dialog is still mounted. `saving` is `isPending`.
- **Combo dialog** (`ComboDialog`, `frontend/src/combos.tsx`): the same, with `onSuccess` invalidating `apiKey('/api/combos')` (not awaited, so the dialog still closes at once, as the #78 focus tests expect). The page's `onSaved` now only clears its words; the invalidation is the save's.
- **Draft locked while saving** (both dialogs): text fields are read-only, and the source type, the junk food box, "Read the table and fill in", the remove buttons and the add buttons are disabled until the answer, as the check and goal forms do. An edit made during the save was not in the save on its way, and the answer then closed the dialog and said "Saved" over it. A failed save gives the fields back.
- **Behavior change:** a save that lands after the person left the page shows no "Saved" toast and no error. The data on other screens is still marked stale.

## Tests

- `frontend/src/meals.test.tsx`: "leaving the day while combos are read stops that request (#302)"; "asking for combos reads them, even when the shared list was read a moment ago (#302)" (guard for the shared cache, passes on the old code too).
- `frontend/src/foods.test.tsx`: "the food cannot change while it is saved, so the save holds what is on screen (#302)"; "a food save answered after leaving the foods page reads no list for it, yet marks the other screens stale (#302)".
- `frontend/src/combos.test.tsx`: "the combo cannot change while it is saved, so the save holds what is on screen (#302)".
- Old-code check: with `add-entry.tsx`, `food-dialog.tsx`, `foods.tsx` and `combos.tsx` put back to `origin/main`, the four tests above other than the guard fail (4 failed, 143 passed); with the change, `vitest run` on the three files passes 147 of 147.
- `TEST_DATABASE_URL= npm run check` (under the shared check lock): passed (exit 0). Frontend: 76 files, 791 passed, 3 skipped. Backend: 293 tests, 156 passed, 0 failed, 137 skipped (the DB tests need `health_test`, not set here; CI runs them). Format, lint, contract, typecheck, skill tests and build passed.
- No browser check: the markup only gains `readonly`/`disabled` while saving, and the screen tests cover the behavior.

## Review round 1 (PR #308)

- Approve, no blocking comments ([comment](https://github.com/sirloinbh/health-log/pull/308#issuecomment-7073882695)). Before the commit, `invalidate: [combosKey]` on the combo save was replaced by a non-awaited invalidation, because awaiting the list read kept the dialog busy and broke the #78 slow-reload focus test.
- Nit, left as is: the picker shares the combos cache, so a list cached by the Combos page in the last few minutes shows for the moment its fresh read takes. Combo saves and deletes mark it stale, and recording a deleted combo is answered with "Combo not found".
