# Checked int8 parser, shared transactions and rate limit (project-standards#779, #709 part 1)

- `app.ts` calls `setInt8Parser(types)`; the `Number(row.id)` conversions are removed and id types are `number`.
- Transactions run on the managed `withTransaction`: `day-records.ts` `inTransaction` (a read's `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` is its first statement instead of a `BEGIN ...` variant), and the combo and visit transactions. The test snapshot helper treats `SET TRANSACTION` as a no-op.
- The twelve per-router rate limits and `src/rate-limit.ts` are replaced by one managed `apiRateLimit(app)`: 600 per minute per client IP (the last X-Forwarded-For entry), health not counted, managed 429 text. The `rateLimit` option is now `requestsPerMinute`; the window-length and default-above-nginx tests are removed (the window is fixed at one minute).
- `src/pool.ts` (`connectPool`) adds the per-connection error listener to the managed `createPool`.
- Not in this PR: the OpenAPI builder (waits for the managed `params` option).
- Verification: typecheck, eslint, prettier, non-DB tests. DB tests run in CI.
