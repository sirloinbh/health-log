# #253 Use the bad-port-safe listener in three backend tests

- Issue: [#253](https://github.com/sirloinbh/health-log/issues/253)
- Branch: `test/253-bad-port-safe-listen`

## Purpose

Three backend test files started their own server with `listen(0, '127.0.0.1')`. A random port can be one the Fetch standard blocks (for example 6000 or 6665). `fetch` then fails with `TypeError: fetch failed`, cause `bad port`, as seen once in a local `npm run check` on 2026-11-22.

## Change

- `backend/test/ai-tools-binding.test.ts`, `backend/test/ai-tools.integration.test.ts` (two tests) and `backend/test/sign-in.test.ts` now create the server with `createServer(createApp(...))` and start it with `listenLocally` from the managed helper `backend/test/standard/api.ts`. That helper closes a listener on a blocked port and asks for another. The port it returns replaces `server.address().port`. What each test checks is unchanged.
- No other file changed: the backend lane is working on #195, #196 and #215.

## Verification

- `grep -rn "listen(0" backend/test` now finds only `backend/test/standard/api.ts` (the managed helper) and `backend/test/helpers.ts` (its own retrying `listenForFetch`), as the done criterion asks.
- The three files against a throwaway local PostgreSQL 17 `health_test` (all migrations up to 020 applied): 5 passed, 0 skipped, including both AI tool integration tests.
- No new test: a blocked port cannot be produced on demand. The retry itself belongs to the managed helper (project-standards#680).
- `npm run check` under the shared lock, with `TEST_DATABASE_URL` set to that `health_test`: passed. Backend 290 passed and 0 skipped, frontend 759 passed and 3 skipped.
