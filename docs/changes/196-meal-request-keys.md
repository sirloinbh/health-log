# #196 Make meal POST requests safe to retry

- Issue: [#196](https://github.com/sirloinbh/health-log/issues/196)
- Branch: `feat/196-meal-request-keys`

## Purpose

`POST /api/meals/:date`, `POST /api/meals/:date/combos/:id` and `POST /api/meals/:date/copy` always inserted. If the commit succeeded but the answer was lost and the request was sent again, the entries were added twice; for a combo or a copy, several rows at once. `docs/changes/30-meal-records.md` listed this as a known limit.

## Change — 2026-11-22

The design follows the project's own pattern in `docs/project-setup.md` section 6.2 (idempotent retry).

- **Migration** `database/migrations/021_meal_request_keys.sql`: table `meal_request_keys` (`key uuid` primary key, `fingerprint` as 64 hex characters, `answer json`, `created_at`, index on `created_at`). `json`, not `jsonb`, so a replayed answer keeps the first answer's text.
- **Server** `backend/src/request-keys.ts` and the three routes in `backend/src/meals.ts`:
  - `Idempotency-Key` header, optional. Without it a request runs as before. A value that is not a UUID is a 400 before the database.
  - Inside the route's transaction: `pg_advisory_xact_lock(hashtextextended(key, 0))` makes a second request with the same key wait for the first. Then keys older than 1 day are deleted, and the key is looked up.
  - The same key with the same fingerprint returns the stored answer with 201 and adds nothing. The fingerprint is the SHA-256 of the method, the path (which holds the date and the combo id) and the parsed body.
  - The same key with a different request is a 409, "This request key was already used for a different request".
  - A first request that fails (404, 400, a database error) rolls back and stores no key, so its retry runs again.
- **OpenAPI** `backend/src/openapi.ts`, `docs/openapi.json`: the three routes list the `Idempotency-Key` header (UUID) and the 409.
- **Screen** `frontend/src/retry-key.ts`, `frontend/src/meals.tsx`: every add (typed entry, stored food, combo, copy) sends a key. The key is kept only while the same request is retried after no answer (a network error or a timeout). After any answer, or for a different request, a new key is made with `crypto.randomUUID()` (the site is served over HTTPS, a secure context). Nothing visible changes.

Tests:

- `backend/test/meal-retry.integration.test.ts` (DB): each of the three routes sent twice with one key adds its rows once and answers the same; a new key or no key adds again; the same key for a different body or date is a 409 and adds nothing; a refused first request stores no key; two requests with one key at the same moment add the entry once.
- `backend/test/request-keys.test.ts`: a non-UUID key is a 400 on all three routes and never reaches the database.
- `frontend/src/retry-key.test.ts`: key reuse for the same request, a new key for a different request or after an answer, and UUID v4 format.
- `frontend/src/meals.test.tsx`: an entry sent again after a network failure carries the same key, and the next entry gets a new one.

## Limits and follow-up

- A key lives in the open meal card. Leaving the day or reloading the page makes the next attempt a new action with a new key.
- A key is kept for 1 day; a retry later than that adds again.
- `docs/project-setup.md` warns that a backup "replace all" restore must also clear the retry keys. This app has no restore yet (`chore/42-backup-restore` is not merged); when it is built, it must empty `meal_request_keys` in the same transaction.
- No browser check: the screen looks the same; the change is a request header, covered by the component test.

## Change — 2026-11-22 (migration renumbered)

- The migration was renamed from `020_meal_request_keys.sql` to `021_meal_request_keys.sql`, because the open PR for #199 (#263) adds `020_foods_serving_units.sql`. The runner stops when a new file sorts before an applied one, so this PR merges only after #263, and 020 is applied before 021.
- Verified after the rename: on the temporary `health_test`, the old `020_meal_request_keys.sql` record was removed and `npm run db:migrate` applied `021_meal_request_keys.sql` again without error (`CREATE ... IF NOT EXISTS`). `meal-retry.integration` and `migrations.integration` tests: 13 passed. The file content did not change, so the full check above still holds.

## Change — 2026-11-22 (main merged in)

- #263 merged `020_foods_serving_units.sql` into main, and `origin/main` was merged into this branch. On the temporary `health_test` (where 021 had been applied first), the 021 record was removed and `npm run db:migrate` applied `020_foods_serving_units.sql, 021_meal_request_keys.sql` in order. The meal-retry, request-keys, migrations, foods, meals and openapi tests: 46 passed.

## Verification

- `npm run db:migrate` on a temporary PostgreSQL 17 `health_test`: applied the file (then numbered 020).
- Backend meal tests (`meal-retry.integration`, `request-keys`, `meals`, `meals.integration`, `meal-copy.integration`, `openapi`) with `TEST_DATABASE_URL` on that database: 37 passed.
- Frontend `vitest run src/meals.test.tsx src/retry-key.test.ts`: 70 passed.
- `npm run check` (foreground, under the lanes' shared check lock) with `TEST_DATABASE_URL` on the temporary database: passed. Backend 295 passed, 0 skipped (DB integration tests ran); frontend 734 passed, 3 skipped (existing skips); contract 3, skills 4 passed; format, lint, typecheck and build passed.
