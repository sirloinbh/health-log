# Clean up the upper-case lab test row (#347)

The labs integration test adds a row named `ZZ-TEST-LAB-TREND` to check that a trend ignores case, but `clean()` deleted with the case-sensitive `LIKE 'zz-test-lab%'`, so that row stayed and three tests failed on the next run against the same database.

| File                                    | Change                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `backend/test/labs.integration.test.ts` | `clean()` deletes with `ILIKE`, so any case of the marker is removed |

## Verification

Against a scratch PG 17 (`lc_messages=C`):

- `backend/test/labs.integration.test.ts` twice in a row on the same database: pass (6 of 6 each time)
- `npm run check`: pass
- `E2E_DATABASE_URL=postgres://x@localhost/x npm run knip`: no findings (only existing configuration hints)

## Limits

Test-only; no app behavior changes.
