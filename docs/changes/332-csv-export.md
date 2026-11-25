# #332 Download my records as CSV

- Issue: [#332](https://github.com/sirloinbh/health-log/issues/332)
- Branch: `feat/332-csv-export`

## Purpose

Records could only be seen on screen. A person can now download their records for a date range as CSV files, to show a doctor or keep a personal copy. This is separate from the server backup (#42).

## Decisions (user, 2026-11-26, on #332)

- **Every record kind, both ways:** one CSV per kind, and one zip with all of them, for the chosen range.
- **Notes included:** free-text notes and medical details are in the files.
- **No new dependency.** The zip is written by a small stored-only (uncompressed) zip writer with `node:zlib` `crc32`, so no package was installed. The files are small text.

## Changes

- `backend/src/export.ts`, `app.ts`, `openapi.ts`, `docs/openapi.json`: `GET /api/export?kind=&from=&to=`, with `kind` one of `meals`, `sleep`, `body`, `habits`, `checks`, `intake`, `visits`, `procedures`, `medications`, `labs`, or `all` for the zip. The route is under `/api`, so it is behind the shared sign-in and answers 401 without a session.
  - **Format:** UTF-8 with a byte order mark so spreadsheet apps read Korean text, CRLF line ends, commas, quotes and line breaks quoted. Decimal columns drop trailing zeros (`70.50` is `70.5`).
  - **Dates and times:** dates are plain `YYYY-MM-DD`; moments (sleep, drinks) are written in `Asia/Seoul` as `YYYY-MM-DD HH24:MI`.
  - **Range:** both dates are included. Medications are the ones taken on at least one of the days.
  - **Meals:** nutrients are the amounts eaten (per-serving value times servings), with the meal's recorded time.
  - **Visits** and their procedures are two files that share the visit id. Medications and lab results name their linked visit.
  - **Formula guard:** text starting with `=`, `+`, `-` or `@` (or a tab or carriage return) gets a leading apostrophe, so a note is not run as a formula when the file is opened in a spreadsheet.
  - **Headers:** `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, because the files hold medical details. Nothing about a request's content is logged.
  - **Errors:** a missing or unreadable kind or date, or a start after the end, is a 400 that reads nothing.
- `frontend/src/export-text.ts`, `export.tsx`, `app.tsx`: a "Download my records" card on the Settings page ("data management"): a date range (default the last 30 days), "Download everything (zip)" and one CSV button per kind. The file is fetched and handed to the browser, so a refusal (an ended sign-in, a bad range, no connection) is shown on the page instead of replacing it. A second press while a file is being made is ignored.

## Verification

Made-up values only.

- `backend/test/export.test.ts` (10): cell quoting, the formula guard, byte order mark and CRLF, the zip read back through its central directory (names, sizes, checksums), headers (type, file name, no-store), every kind asked for with only the two dates as values, the zip of all kinds, 401 behind the sign-in with nothing read, and 400 for bad input with nothing read.
- `backend/test/export.integration.test.ts` (9, real database): each kind against fixtures with exact expected rows, including a quoted multi-line name and note, Seoul times, a formula-like note, drinks in one cell, visits and procedures that agree on the id, medication overlap (before, inside, open-ended, after), lab results with their visit, rows outside the range left out, an empty range giving only the header and a one-day range being inclusive. Run on a temporary PostgreSQL 17 with all migrations.
- `frontend/src/export-text.test.ts` (7), `export.test.tsx` (7): range checks, the address, the file name from the server, the download handed to the browser, 401, server errors, no connection, the default range, one kind, the zip, bad dates, a retry after a refusal, a second press ignored, and the card on the Settings page.
- `npm run check`: see the PR (CI runs the full check).
- Browser check at 390x844 and 1440x900 (headless Chrome on the Vite dev server, API replaced by an in-memory stand-in): the card rendered, real browser downloads fired for one CSV and for the zip with the server's file names, no page errors and no horizontal overflow.

## Limits

- The workout memo records come from another service and are not in the export.
- The zip is not compressed; the CSV files are small.
- The whole range is built in memory, which is fine for one person's records.
