# #198 Match food search on the brand and name shown on screen

- Issue: [#198](https://github.com/sirloinbh/health-log/issues/198)
- Branch: `fix/198-food-search-brand-name`

## Purpose

The screens show a food as `brand name` (for example in the meal card and the combo text). The search (`GET /api/foods?q=`) matched `name` and `brand` one column at a time, so typing what the screen shows, both words, found nothing.

## Change

- `backend/src/foods.ts`: the search condition is now `concat_ws(' ', brand, name) ILIKE $2`. The name alone and the brand alone are parts of that text, so they still match. `concat_ws` skips a missing brand, so a food without a brand is the name alone. `%` and `_` are still escaped as before.
- No index changes: the table had no index for the old `ILIKE` either, and it holds a few hundred foods.

## Verification

- New test in `backend/test/foods.integration.test.ts`: "search finds a food by the brand and name as the screen shows them". It searches `<brand> <name>`, a part across the space, upper case, the name alone, the brand alone, a food without a brand, and the words in the other order (no match).
- The new test failed against the old query (`main`'s `foods.ts`: 16 passed, 1 failed) and passes with the fix.
- `npm test -w backend` with `TEST_DATABASE_URL` set to a throwaway local PostgreSQL 17 `health_test` (all migrations applied with `backend/src/migrate.ts`): 273 tests, 273 passed, 0 skipped.
- `npm run check` with the same `TEST_DATABASE_URL`: passed (format, lint, contract, typecheck, backend 273 passed and 0 skipped, frontend 651 passed and 3 skipped, skills, build).

## Limits and follow-up

- The words must be in the screen order (`brand name`); `name brand` does not match. That is the issue's scope.
