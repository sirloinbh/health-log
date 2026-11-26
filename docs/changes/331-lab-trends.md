# #331 Show lab result trends over the years

- Issue: [#331](https://github.com/sirloinbh/health-log/issues/331)
- Branch: `feat/331-lab-trends`

## Purpose

A single result is hard to judge; the value of lab records is in the trend across years. On the Lab results page, a person can pick a recorded test and see its values over time with the reference range.

## Decisions

- **One test is the test name, ignoring case and outer spaces.** The same rule groups the selector and the trend, so "LDL" and "ldl" are one test. Results of one test may use different units over the years: each result keeps its own unit and range, the view warns about mixed units, and a change is shown only between results with the same unit.
- **Reuses the body card's change view** by importing `formatChange` from `frontend/src/body-change.ts` unchanged (the lane rule says that file is read-only). Its date-span helper is not used: it prints month and day without the year, which is not enough across years, so the table shows full dates.
- **The reference band is the latest result's range**, because earlier results may have used another range. The table's Range column says, per result, whether it was inside the range that result was measured against.
- **A first result has no change**, and a test with one result says there is no trend yet.

## Changes

- `backend/src/labs.ts`, `openapi.ts`, `docs/openapi.json`: `GET /api/labs/names` (each test once, with its result count and latest date) and `GET /api/labs/trend?name=` (one test, oldest first, each point with its unit and range).
- `frontend/src/lab-trend.ts`: the rows (change against the previous result in the same unit, status), unit helpers and the chart geometry.
- `frontend/src/lab-trend-card.tsx`, `labs.tsx`: the "Trend over time" card above the list: a test selector, a chart (an SVG with a text label, the shaded range and highlighted out-of-range dots) and a table (date, result, change, range).

## Verification

Made-up values only.

- `backend/test/labs.test.ts` (+1): the trend needs a name of at most 100 characters and rejects a repeated parameter, and nothing reaches the database.
- `backend/test/labs.integration.test.ts` (+2, real database): a trend lists one test oldest first whatever the case of its name, keeps each unit and range, and an unknown test is an empty list; the names list has each test once with count and latest date. 14 lab backend tests passed on a temporary PostgreSQL 17.
- `frontend/src/lab-trend.test.ts` (7): changes, floating point, status, units, selector text, chart geometry.
- `frontend/src/lab-trend-card.test.tsx` (5): no results, a chosen test with its rows and chart label, one result, mixed units, a failed read.
- `npm run check`: see the PR (CI runs the full check).
- Browser check at 390x844 and 1440x900 (headless Chrome on the Vite dev server, API replaced by an in-memory stand-in): the card, selector, chart and table rendered with no horizontal overflow. The table scrolls inside its card on a narrow screen.

## Limits

- The chart shows no axis numbers or dates; the table beside it has them.
- No search or date window: a test's whole history is shown.
