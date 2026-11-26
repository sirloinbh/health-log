# #326 Caffeine and that night's sleep in the change report

- Issue: [#326](https://github.com/sirloinbh/health-log/issues/326)
- Branch: `feat/326-caffeine-sleep`

## Purpose

The change report compared alcohol with that night's sleep, but not caffeine, a common cause of poor sleep. It now shows the average sleep after days with no caffeine, up to 200 mg, and over 200 mg.

## Decisions

The user chose these on 2026-11-26 (comment on #326):

- **Groups:** three, by the day's caffeine total: none (0 mg), 200 mg or less, over 200 mg. 200 mg is about two cups of coffee, and exactly 200 mg is in "200 mg or less".
- **Which days count:** only days with at least one intake record, water included. A day with water and no caffeine is "none". A day with no intake record is left out, because it may just be unrecorded.
- **Which night:** as in the sleep-after-drinking card, caffeine on day D is compared with the sleep dated D + 1, since sleep is filed under the day of waking.

## Change — 2026-11-26

- **API** `backend/src/report.ts`: `GET /api/report` adds `sleepAfterCaffeine.{none,low,high}`, each with `nights` and `averageMinutes`. Caffeine is the sum of the day's non-water `intake_entries.amount` (mg).
- **Screen** `frontend/src/report.tsx`, `report-text.ts`: a "Caffeine and sleep that night" card. The drinking card's layout became the shared `SleepComparison`, so both cards show the bars, the sample of each group and the fewer-than-5-nights warning in the same way. The 200 mg line is `highCaffeineMg` in `report-text.ts` (screen) and `report.ts` (server).
- **Tests:** a backend integration test with fixed 1979 dates covers each group, the 200 mg edge, a water-only day, an unrecorded day, and the week boundary. Screen tests cover the three rows and a group with no nights. The fixtures in `app.test.tsx` and `report.test.tsx` gained the new field, and the "enough nights" test now looks only at the drinking card, because the caffeine card can show its own warning.

## Verification — 2026-11-26

- `TEST_DATABASE_URL=<scratch PG 17 with all migrations> npm run check` passed: backend 357 pass, 0 skipped; frontend 860 pass, 3 skipped. `npm run knip` passed.
- **Browser:** the API and the Vite dev server ran against the scratch DB, with intake and sleep records for the week of 2026-11-23, and headless Chrome opened the report. At 390×844 and 1440×900 the card shows the three groups (5 h 50 min, 7 h 10 min, 8 h, one night each) with the fewer-than-5-nights warning. There was no horizontal overflow and no page error.
