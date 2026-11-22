# #211 Move visit form rules out of visits.tsx and split VisitDialog

- Issue: [#211](https://github.com/sirloinbh/health-log/issues/211)
- Branch: `refactor/211-visit-form-rules`

## Purpose

The rules that turn the clinic visit form into a request (`readDraft`, `tooLong`, `readCost`, `draftOf`) lived inside `frontend/src/visits.tsx` and were not exported, so they could be tested only through the screen. One screen test chained nine rules, so its first failure hid the rest. `VisitDialog` was about 260 lines in a file of about 730.

## Decisions

- Pure refactor: no text, layout, request or focus behavior changed. The existing screen tests stay as they were, except the chained validation test, which is shortened as the issue asks.
- The rules go to `visit-form.ts`, and the dialog goes to its own file `visit-dialog.tsx`, split into `VisitFields`, `ProcedureList`, `ProcedureRow` and `DialogActions`. `VisitDialog` keeps the draft state and the save.
- The "focus next" effect (the new row's name after adding, the add button after removing) moved with the rows into `ProcedureList`.

## Change — 2026-11-22

- **New** `frontend/src/visit-form.ts`: `Draft`, `ProcedureDraft`, `VisitBody` types, `procedureDraft`, `draftOf`, `tooLong`, `readCost`, `readDraft`, exported and unchanged in what they return.
- **New** `frontend/src/visit-dialog.tsx`: `VisitDialog` (state and save, about 75 lines) with `VisitFields`, `ProcedureRow`, `ProcedureList` and `DialogActions`.
- `frontend/src/visits.tsx`: the list page and the visit card only (734 → 343 lines).

## Verification

### Tests

- **New** `frontend/src/visit-form.test.ts`, table-driven:
  - `readDraft` refuses a form, one case per rule (21 cases): visit date missing, not a real day, before and after the range; clinic blank; clinic, department and note too long; visit cost unreadable and too large; next appointment not a real day, out of range, before the visit; procedure name blank; procedure name, area, dose and note too long; procedure cost unreadable and too large; the second procedure at fault. Plus: the visit is checked before its procedures.
  - `readDraft` builds the body (blanks as typed, costs as whole won, blank appointment as null) and accepts the edges: an appointment on the visit day, the first and last days of the range, exactly 100 million won, exactly 100 characters (emoji counted as one), spaces around a full-length name.
  - `tooLong`, `readCost`, `draftOf` (filled from a visit, blank on a day, a new key for each row).
- `frontend/src/visits.test.tsx`: the chained test "what cannot be sent is explained in the dialog before anything is sent" now checks three reasons (a visit field, the appointment order, a procedure field) and that nothing is sent. The rest is unchanged and passes.
- `npm test -- src/visit-form.test.ts src/visits.test.tsx` (frontend): 52 passed.

### Browser

Temporary local DB, API (3984) and Vite (5284) with made-up visits, checked with Playwright:

- 390×844: editing a visit, "Add procedure" moved focus to the new row's name; the dialog (358 px) had no horizontal overflow and the same 11 labels as before; saving closed the dialog and the card showed the new procedure.
- 1440×900: the dialog showed its two-column grid (223 px columns), the saved procedure was filled in, and "Remove Procedure 1" moved focus to "Add procedure". No overflow, no console errors or warnings.

### Commands

- `TEST_DATABASE_URL= npm run check`: passed on the second run (frontend 687 passed, 3 skipped; backend 146 passed, 126 DB tests skipped because `TEST_DATABASE_URL` was emptied, CI runs them; skill checks 3 passed). The first run failed once in `frontend/src/daily.test.tsx` ("the main menu opens the day the server counts as today"), the same intermittent timeout seen on #208; it is filed as #250.
- `E2E_DATABASE_URL=<temporary local DB> npm run knip`: passed (configuration hints only). Without a DB URL, knip cannot load `playwright.config.ts` and reports `e2e/smoke.spec.ts` as unused.
