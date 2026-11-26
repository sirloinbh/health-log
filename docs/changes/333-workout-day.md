# #333 Show the day's workout-memo workouts on the daily screen

- Issue: [#333](https://github.com/sirloinbh/health-log/issues/333)
- Branch: `feat/333-workout-day`

## Purpose

Workouts are recorded in workout-memo, a separate app. The daily screen now shows that day's workouts (read-only) next to meals and sleep.

## Research (also an issue comment)

- workout-memo serves `GET /api/workouts?from&to` behind the shared sign-in, whose cookie is on the parent domain, so one session is valid for both apps. Its AI tool `list_workouts` is for shared-ai only.
- workout-memo's api already has the alias `workout-memo-api` on the `shared-ai` network, and health-log's api is on that network. So no workout-memo change is needed and no workout-memo issue was kept (#492 was filed and closed as not needed).

## Decisions

- **Server relay (option A, recommended to the coordinator; the coordinator could not be reached, so it was built as recommended):** `GET /api/workout-memo/:date` in health-log calls workout-memo with the user's own session cookie and returns a short summary per journal (title, and per exercise the performed sets and the top weight). Planned (not completed) sets are not counted.
- The address comes only from the `WORKOUT_MEMO_URL` setting (compose default `http://workout-memo-api:3101`), never from the request. The cookie is forwarded only to that address.
- A 3-second timeout. Unset, unreachable, an error status, bad JSON or an unexpected shape all give `{ state: 'unavailable' }` with status 200 and one log line; the card then shows a quiet message and a "Try again" button instead of an error banner.

## Change

- `backend/src/workout-memo.ts` (route), `app.ts`, `server.ts`, `openapi.ts`, `docs/openapi.json`, `compose.yaml`, `.env.example`.
- `frontend/src/workouts.tsx`, `workout-text.ts`; the card is added to `daily.tsx`.
- Tests: `backend/test/workout-memo.test.ts` (stubbed workout-memo), `frontend/src/workouts.test.tsx`, `workout-text.test.ts`; `daily.test.tsx` answers the new route.

## Verification

See the PR for the commands and results.

## Limits

- Only the day's journals are read, up to 20. No link back to workout-memo and no editing.
- Not checked against a live workout-memo: that needs both apps running on the server. After deploy, open a day that has a workout.
