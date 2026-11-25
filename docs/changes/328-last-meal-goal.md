# #328 Add a goal for not eating after a set time

## What changed

- New goal item `last_meal`: the target is the last allowed minute of the day counted from midnight (21:00 is 1260), 1 to 1439. Migration `025_goal_last_meal.sql` widens the `goals` item and range checks.
- `GET /api/goals/days/:date` has a `last_meal` entry whose `actual` is `{ slots: [{ meal, time }] }`: each meal slot that has an entry, with its time (minutes) from the slot times of #327, or `null`.
- Judging (`judgeLastMeal`): no entries is `none`; any slot timed after the limit is `missed` (even if another slot has no time); otherwise a slot with no time makes the day `unknown`; otherwise `met`. Eating exactly at the limit is allowed.
- `PUT /api/goals/last_meal` takes minutes from midnight; errors say the range as a clock time. `docs/openapi.json` regenerated.
- Settings: a "Last meal" card with a time field. Daily page: an "Eating time" verdict listing each slot and its time, with the reason when undetermined.

## Decision

From the coordinator, recorded on #327: judge from the per-slot times; a day with no timed slot is unknown. Days before #327 have no slot times, so they are unknown, never guessed.

## Limits

- A time after midnight (00:30) counts as early on that same date. The goal sees clock times of one date only.
- The goal cannot be set to 00:00.

## Tests

- `backend/test/goals.test.ts`: the judge at, before and after the limit, with untimed slots; clock text; range errors.
- `backend/test/goals.integration.test.ts`: judged from real slot times (met, at the limit, missed, unknown, none); the database refuses out-of-range targets.
- `frontend/src/goal-text.test.ts`, `frontend/src/goals.test.tsx`: typing a time, sending minutes, refusing an empty time, the day card text.

## Verification

- `npm run check` with `TEST_DATABASE_URL=` cleared: pass.
- The database integration tests were skipped locally (no `health_test` DB); CI runs them.
