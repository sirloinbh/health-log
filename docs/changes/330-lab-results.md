# #330 Add checkup and blood test result records

- Issue: [#330](https://github.com/sirloinbh/health-log/issues/330)
- Branch: `feat/330-lab-results`

## Purpose

Visits and medications were recorded, but checkup and blood test values had no place. A person can now save a value with its test date, unit and reference range, link it to a clinic visit, and edit or delete it.

## Decisions (user, 2026-11-25, on #330)

- **Free test items.** A result is a test name (1-100 characters), a number, an optional unit (up to 20 characters) and an optional reference minimum and maximum. There is no fixed list, so any checkup fits. The trend view (#331) will group by test name.
- **Optional visit link.** `visit_id` is a nullable foreign key to `clinic_visits` with `ON DELETE SET NULL`, the same as medications. A deleted visit keeps its results, unlinked.

## Changes

- `database/migrations/022_lab_results.sql`: table `lab_results` (value `numeric(14,4)`, 0 or more; reference minimum not above maximum; indexes on date, visit and lower-cased name). The number may change at merge if another lane took 022.
- `backend/src/labs.ts`, `app.ts`, `openapi.ts`, `docs/openapi.json`: `GET/POST /api/labs`, `PUT/DELETE /api/labs/:id`. The list is newest first, searched by test name, 20 per page with `more`. Numbers must be 0 to 1 billion with at most 4 decimals. An unknown visit is a 400.
- `frontend/src/lab-text.ts`, `labs.tsx`, `app.tsx`: a "Lab results" page (menu entry, route `/labs`) with add, edit, delete, search and "Show more", the value with its range and an in/above/below-range word.

## Verification

Made-up values only in tests and docs.

- `backend/test/labs.test.ts` (7): rejected input never reaches the database.
- `backend/test/labs.integration.test.ts` (4): create/read/change/delete, paging and search, visit link, the database checks. Run against a temporary PostgreSQL 17 `health_test` with all migrations applied.
- `frontend/src/lab-text.test.ts` (4), `frontend/src/labs.test.tsx` (8): parsing, range text and status, the add/edit/delete/search/paging flows, validation messages and a failed read.
- `npm run check` (2026-11-25, `TEST_DATABASE_URL` on a temporary PostgreSQL 17): passed. Format, lint, contract, typecheck, backend tests, frontend tests (806 passed, 3 skipped), skills test and build.
- Browser check at 390x844 and 1440x900 (headless Chrome on the Vite dev server, API replaced by an in-memory stand-in because the local API could not be reached from the browser run): add dialog, save, the card with "Above range", delete and the empty state worked, with no horizontal overflow. The real API is covered by the integration tests.

## Limits

- Dates must be inside the daily page's range, like medications.
- Trends over time are #331.
