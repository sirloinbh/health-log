# #156 Apply the central scaffold fixes for migration lock release and pg_isready

- Issue: [#156](https://github.com/sirloinbh/health-log/issues/156)
- Branch: `fix/156-scaffold-fixes`
- Date: 2026-11-14 (Asia/Seoul)

## Purpose

The scaffold fixes in sirloinbh/project-standards#414 (PR #428) and #392 (PR #429) are not synced to existing apps. This applies them here (tracking issue: sirloinbh/project-standards#430).

## Changes

| File                              | Change                                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/migrations.ts`       | If applying a file fails, the advisory unlock failure is ignored and the original error is thrown. After a successful run, an unlock failure is still an error. The apply loop moved to `applyPending()` |
| `backend/test/migrations.test.ts` | Fake connection tests: a lost connection keeps the failing file and cause; unlock after success; unlock failure after success is reported                                                                |
| `compose.yaml`                    | DB health check is `pg_isready -h 127.0.0.1 ...` so the first-run temporary server (no TCP) is not taken as ready                                                                                        |

A lost connection makes PostgreSQL release the session's advisory lock, so ignoring the unlock failure leaves no lock behind.

## Verification

- `tsx --test test/migrations.test.ts` in `backend`: 7 pass, 0 fail.
- `tsc -p tsconfig.check.json` (backend), ESLint (`--max-warnings 0`) and Prettier on the changed files: pass.
- Not run: the database integration tests (no Postgres here) and the full `npm run check`.
