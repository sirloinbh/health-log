# #167 Require the shared sign-in

- Issue: [#167](https://github.com/sirloinbh/health-log/issues/167)
- Branch: `chore/standards-sync-b3f43a7`

## Change

- `backend/src/app.ts`: `createApp` takes an `auth` middleware and mounts it on `/api` before any route; `/api/health` stays open (the middleware's `publicPaths`). New `GET /api/me` returns the signed-in user.
- `backend/src/server.ts`: passes `sharedAuth()` (managed `backend/src/standard/auth.ts`), which builds the middleware from `@sirloinbh/auth-client` when `AUTH_INTERNAL_URL` is set and refuses to start in production without it.
- `compose.yaml`: the API joins the external `shared-auth` network and checks sessions at `http://shared-auth-api:3110`.
- `frontend/src/app.tsx`: the app is wrapped in `SignInGate` and the top bar shows `AccountActions` (managed `frontend/src/sign-in.tsx`, `auth-origin.ts`). On `<app>.<domain>` a signed-out visitor is sent to `https://auth.<domain>/sign-in`; on localhost and IP addresses nothing changes.
- `backend/test/sign-in.test.ts`: 401 without a session on every `/api` path but `/api/health`, and `/api/me` with one.
- `.env.example`: a note on `AUTH_INTERNAL_URL`.
- This app has no OpenAPI file and no API document, so there is no `/api/me` row to add.

## Reason

- The app relied only on the IP allow list. The shared sign-in is live (sirloinbh/project-standards ADR-0015, #550) and workout-memo (#303) is the pilot; this app follows.

## Verification

- Local: format, lint and typecheck pass; backend `sign-in` and `health` tests (7 pass); frontend `app` and `auth-origin` tests (6 pass); `node .standards/check.mjs` passes. The tests that need PostgreSQL and the rest of the frontend run in CI.
- `npm install --ignore-scripts` (user step) and `node .standards/lockfiles.mjs --write` updated the lockfiles for `@sirloinbh/auth-client` 1.0.0.
