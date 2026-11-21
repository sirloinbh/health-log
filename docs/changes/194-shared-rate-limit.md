# #194 Mount one rate limiter on /api instead of one per router

- Issue: [#194](https://github.com/sirloinbh/health-log/issues/194)
- Branch: `test/194-shared-rate-limit`

## Purpose

When the issue was filed, each of the 12 feature routers called `router.use(rateLimit(...))` with its own memory store, so a client really had 12 budgets instead of the one the comment described.

## What was already in place

The fix arrived before this issue was picked up, through the central standards (project-standards#678 and #779, commit `f53acb9`):

- `backend/src/standard/rate-limit.ts` (managed file) has `apiRateLimit(app)`, which mounts one `express-rate-limit` limiter on `/api`, keyed by the client IP Express reads with `trust proxy` 1, and skips `/api/health`. Its header comment already says what is limited and how the key is chosen.
- `backend/src/app.ts` calls `apiRateLimit` once, after the request log and before the body parser, sign-in and feature routers.
- No feature router calls `rateLimit(` any more. `rg "rateLimit\(" backend/src` finds only the managed module, which `app.ts` calls once; the issue's wording ("only the call in app.ts") predates that move.

## Change — 2026-11-22

- Added the missing test in `backend/test/rate-limit.test.ts`: with a limit of 3, requests to the foods, sleep and goals routers use up the budget, and the next requests to the meals, report and reminders routers get 429 without reaching the database. With one limiter per router this test would fail, because each router would still have its own 3 requests left.

## Verification

- `node --import tsx --test test/rate-limit.test.ts` in `backend`: 5 passed.
- `npm run check` with `TEST_DATABASE_URL` pointing at a temporary PostgreSQL 17 cluster (`health_test`, all migrations applied by `npm run db:migrate`): passed.
  - Backend: 273 passed, 0 skipped (DB integration tests ran).
  - Frontend: 651 passed, 3 skipped (existing skips, unrelated).
  - Contract check 3 passed, skills check 4 passed; format, lint, typecheck and build passed.
