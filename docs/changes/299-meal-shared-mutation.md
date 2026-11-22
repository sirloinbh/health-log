# #299 Save meals through the shared useApiMutation with the Idempotency-Key header

- Issue: [#299](https://github.com/sirloinbh/health-log/issues/299)
- Branch: `chore/299-meal-shared-mutation`
- Parent: #221

## Purpose

`useMealWrite` in `frontend/src/meals.tsx` called `useMutation` directly with its own `mutationFn` and a local `MealRequest` type, because the shared `useApiMutation` could not send request headers and the meal add needs `Idempotency-Key` (#196, #220). sirloinbh/project-standards#979 added `headers` to `ApiRequest` (PR sirloinbh/project-standards#984), and sync PR #297 brought it here.

## Change — 2026-11-22

- `frontend/src/meals.tsx`: `useMealWrite` is `useApiMutation<MealDay, ApiRequest>(asRequest, { onSuccess })`, like the other cards. `MealRequest`, the direct `useMutation` call and the `requestJson` import are gone. The add still passes `headers: { 'Idempotency-Key': key }`, and the variables are still the request, so `useReadAfterWrites` sees pending meal writes as before.
- #196's behavior is unchanged: a retry after no answer reuses its key, an answered add moves to a new key (`createRetryKeys` and `add` are untouched). The existing #196 test now checks the header through the shared hook, so no new test was needed.

## Verification

- `vitest run src/meals.test.tsx`: 70 of 70 passed.
- Mutation check: with the shared `useApiMutation` changed to drop `headers`, the #196 test fails (`.toMatch() expects to receive a string, but got undefined` for the first key). Restored afterwards.
- `TEST_DATABASE_URL= npm run check`: passed. Frontend: 76 files, 786 passed, 3 skipped. Backend: 293 tests, 156 passed, 0 failed, 137 skipped (the DB tests need `health_test`, not set here; CI runs them). Format, lint, contract, typecheck, skill tests and build passed.
- No visible change (same requests, same messages), so no browser check.
