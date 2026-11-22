# #296 Stop ignoring the query test's stray GET /api/tags request

- Issue: [#296](https://github.com/sirloinbh/health-log/issues/296)
- Branch: `chore/296-drop-stray-allowance`
- Parent: #221

## Purpose

#214 made every unstubbed request fail a test, but had to ignore `unmocked fetch: GET /api/tags` by name: the managed `frontend/src/lib/query.test.tsx` reset window focus while its query was still mounted. sirloinbh/project-standards#980 fixed the template (PR sirloinbh/project-standards#983), and sync PR #295 brought it here. The allowance would now only hide a future stray request with the same text.

## Change — 2026-11-22

- `frontend/src/test/setup.ts`: `knownStrayRequests` and its comment are gone; the `afterEach` calls `failOnUnexpectedRequests()` with no allowance. The helper keeps its optional `known` list (covered by `requests.test.ts`) for a future case.

## Verification

- `TEST_DATABASE_URL= npm run check`: passed. Frontend: 76 files, 785 passed, 3 skipped, and no test reported an unexpected request (the synced query test included). Backend: 293 tests, 156 passed, 0 failed, 137 skipped (the DB tests need `health_test`, which is not set here; CI runs them). Format, lint, contract, typecheck, skill tests and build passed.
- No screen changes, so no browser check.
