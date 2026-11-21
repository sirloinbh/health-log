# #192 Add a pool error listener so a DB blip cannot crash the API

- Issue: [#192](https://github.com/sirloinbh/health-log/issues/192)
- Branch: `test/192-pool-error-listener`

## Purpose

pg reports a lost connection (DB restart, network blip) as an `error` event, and Node throws on an event nobody listens to, which ends the API process. The issue asked for a pool error listener in `server.ts`.

## What was already in place

The fix itself arrived before this issue was picked up, through the central standards (project-standards#709, commit `b803d63`):

- `backend/src/standard/db.ts` (managed file) has `createPool(pool, log)`. It adds a no-op `error` listener on the pool and an `error` listener on every new connection that logs `Database connection failed` with the error.
- `backend/src/server.ts` builds its pool as `createPool(new Pool({ connectionString }))`. The `new Pool` call stays inside `createPool(...)` because the managed module imports no value from `pg` and takes the app's own Pool.
- `backend/src/migrate.ts` only imports the managed migration CLI, which uses one `Client`, not a Pool, so there is no pool to wrap there.

Two differences from the issue text, both set by the managed file and so not changed here:

- The log line is `console.error('Database connection failed', err)`, not a JSON line with `event: db_pool_error`. Changing the format belongs in `sirloinbh/project-standards`.
- The pool-level listener is silent on purpose: an idle client reports on its own connection listener too, so logging both would double the line.

## Change — 2026-11-22

- Added `backend/test/pool.test.ts`, the missing behavior test. With a real pg `Pool` that never connects:
  - a bare Pool throws when `error` is emitted (shows why the listener is needed);
  - after `createPool`, an idle-client `error` on the pool does not throw;
  - a lost connection (`error` on a connected client) does not throw and is logged exactly once, with the original error;
  - the default logger writes one `console.error` line.

## Verification

- `node --import tsx --test test/pool.test.ts` in `backend`: 4 passed.
- `npm run check` with `TEST_DATABASE_URL` pointing at a temporary PostgreSQL 17 cluster (`health_test`, all migrations applied by `npm run db:migrate`): passed.
  - Backend: 276 passed, 0 skipped (DB integration tests ran).
  - Frontend: 651 passed, 3 skipped (existing skips, unrelated).
  - Contract check 3 passed, skills check 4 passed; format, lint, typecheck and build passed.
