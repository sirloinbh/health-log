# #325 Add water and caffeine counters to the daily screen

- Issue: [#325](https://github.com/sirloinbh/health-log/issues/325)
- Branch: `feat/325-intake-counters`

## Purpose

Water and caffeine were not recorded anywhere, and typing them as meals is too slow. The daily screen now has a "Water and caffeine" card with a plus and a minus button per kind.

## Decisions (user, 2026-11-25, option C; also recorded in an issue comment)

- Water is counted in ml, 250 ml per tap. Caffeine drinks are counted in mg, one row per drink.
- Kinds: water, coffee, tea, energy drink, other caffeine.
- Default mg per drink (approximate, chosen by the agent): coffee 95, tea 40, energy drink 80, other caffeine 50. The amount is stored on each row, so changing a default later does not rewrite past days.
- Every drink is one row with `consumed_at`. The time is kept only when the drink is counted on today (the service date); a drink added to a past day has no real time, so it is `NULL` rather than a made-up one. A later caffeine and sleep comparison can use the rows that have a time.
- Minus removes the newest drink of that kind. At 0 it changes nothing, so a count never goes below 0. At most 50 drinks per kind per day.

## Change

- `database/migrations/022_intake_entries.sql`: table `intake_entries` (the number is renamed at the final sync if another lane takes 022 first).
- `backend/src/intake.ts`: `GET /api/intake/:date`, `POST /api/intake/:date` (body `{ kind }`), `DELETE /api/intake/:date/:kind`; wired in `app.ts`, listed in `openapi.ts`, `docs/openapi.json` regenerated.
- `frontend/src/intake.tsx`, `intake-text.ts`: the card; added to `daily.tsx`.
- Tests: `backend/test/intake.integration.test.ts`, `frontend/src/intake.test.tsx`, `intake-text.test.ts`; `daily.test.tsx` answers the new route.

## Verification

See the PR for the commands and results.

## Limits

- Writes are one tap per request. Two taps at once take turns on a per-day advisory lock on the server, so the 50 limit holds.
- No editing of an individual drink or its time; minus removes the newest one.
