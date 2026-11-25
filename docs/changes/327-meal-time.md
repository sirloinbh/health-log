# #327 Record the time of each meal

## What changed

- Migration `022_meal_slot_times.sql` adds `meal_times` (`entry_date`, `meal`, `eaten_time`), one optional time per meal slot per day, Asia/Seoul wall-clock. No row means "not recorded".
- `PUT /api/meals/:date/times/:meal` with `{ time: "HH:MM" | null }` sets or clears a slot's time and answers with the whole day. `GET /api/meals/:date` (and the AI tool `list_meals`) now return `times`, an object with all four slots, each `"HH:MM"` or `null`.
- Each meal section in the day list has a time field; it saves when it loses focus, and clearing it sends `null`.
- `docs/openapi.json` regenerated.

## Decision

The user chose, via the coordinator on 2026-11-25: one optional time per meal slot per day in a new table (not per entry). Past days have no slot time (unknown, never guessed). Recorded in a comment on #327. #328 judges the "no eating after" goal from these slot times; a day with no timed slot is unknown.

## Limits

- A time can be set only on a slot that already has an entry (the field is in the slot's section).
- Deleting every entry of a slot leaves its time row; it is shown again if the slot gets a new entry.

## Tests

- `backend/test/meals.test.ts`: bad times and a bad meal are rejected before any query.
- `backend/test/meals.integration.test.ts`: set, change and clear a slot time; other days are untouched.
- `frontend/src/meals.test.tsx`: the saved time shows, a new one is sent on blur as PUT, clearing sends `null`, an unchanged time sends nothing.

## Verification

- `npm run check` (with `TEST_DATABASE_URL=` cleared): pass. Format, lint, types, unit and screen tests, and the build all pass.
- The database integration tests (including the new slot-time test and the migration) were skipped: this PC has no `health_test` database. CI runs them.
