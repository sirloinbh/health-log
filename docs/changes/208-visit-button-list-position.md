# #208 Label the add-visit button as an action and keep list position

- Issue: [#208](https://github.com/sirloinbh/health-log/issues/208)
- Branch: `fix/208-visit-button-list-position`

## Purpose

The primary button on the clinic page read "Visit records", which sounds like "view records", while it opens the "Record clinic visit" dialog. After a save or a delete, the page read only the first page of visits again, so someone who had pressed "Show more results" lost the visits they had loaded.

## Decisions

- **Reload all loaded pages, not an in-place update.** An edited visit can move (its date sets its place in the list) or leave a search's results, and a new visit has a place only the server knows. Reading the pages again from the start keeps the server's order and filter. The API was not changed: the page reads the pages one after another with the existing `offset` parameter until it has as many visits as were shown, or the server says there are no more.
- The number kept after a delete is the count shown before the delete minus one, so the list is read up to the same place.

## Change — 2026-11-22

- `frontend/src/visits.tsx`
  - The add button now reads "Add visit".
  - `load(words, keep)` reads the first page and then the next pages until it has `keep` visits or there are no more. Each step checks that no newer load started, so an older answer still cannot overwrite a newer one.
  - Save passes the number of shown visits; delete passes that number minus one.

## Verification

### Tests

- `frontend/src/visits.test.tsx`
  - Existing tests now press "Add visit".
  - New: "saving a visit on the second page keeps both pages shown". 21 made-up visits, 20 to a page. After editing visit 21 the edited name is shown, both pages are kept (`21 visits`), and the reload read `/api/visits?q=` and then `/api/visits?q=&offset=20`.
  - New: "deleting a visit on the second page reads both pages again". 41 visits; after deleting one on page two the page shows `40 visits` (page one alone would show "Showing 20 visits. There are more.").
  - Both new tests were run against the old reload (`load(applied.current)`) and failed, and pass with the change.
- `npm test -- src/visits.test.tsx` (frontend): 20 passed.

### Browser

A temporary local PostgreSQL 17 cluster (port 5484, DB `health_browser`), the API (3984, `AUTH_DISABLED=1`) and Vite (5284) were started, and 25 made-up visits were added through the API. Checked with Playwright:

- 390×844: the button reads "Add visit" (103×36 px). After "Show more results", editing "Test clinic 2" (page two) closed the dialog and the page still showed `25 visits` with the edited name. No horizontal overflow.
- 1440×900: deleting "Test clinic 3" (page two) left `24 visits` with the last cards of page two still shown, and focus on the "Clinic" heading. No horizontal overflow, no console errors or warnings.

### Commands

- `TEST_DATABASE_URL= npm run check`: passed on the second run.
  - Frontend 653 passed, 3 skipped. Backend 141 passed, 126 DB tests skipped (`TEST_DATABASE_URL` emptied: the shell value points at another project's DB; CI runs the DB tests). Skill checks 3 passed.
  - The first run failed once in `frontend/src/daily.test.tsx` ("the main menu opens the day the server counts as today", text not found in time) while the whole suite ran. The file passed alone (28 passed) and the whole check passed on the rerun. This change does not touch the daily page.

## First review — 2026-11-22

Self-review of the whole PR diff (design, behavior, tests, security). One finding, fixed in this PR.

- **A new visit hid the last loaded visit.** After adding a visit, the page read only as many visits as were shown before, so the list grew by one and the old last visit went behind "Show more results". A new visit now reads one more (`keep` + 1); an edit reads the same count.
- New test in `frontend/src/visits.test.tsx`: "adding a visit after loading more keeps every loaded visit shown" (40 visits loaded, one added, page shows `41 visits` with the old last one). It failed with `keep` unchanged and passes with the fix.
- `npm test -- src/visits.test.tsx` (frontend): 21 passed. `TEST_DATABASE_URL= npm run check`: passed (frontend 654 passed, 3 skipped; backend 141 passed, 126 DB tests skipped; skill checks 3 passed).
