# #1 Fix the Vite dev port clash

- Issue: [#1](https://github.com/sirloinbh/health-log/issues/1)
- Branch: `fix/1-vite-port`

## Problem

The Vite dev server port `5173` was the same as the default Vite port of workout-memo. If you start the dev servers of both apps at the same time, health-log does not start because of `strictPort`.

## Changes

- `frontend/vite.config.ts`: port `5183`. `strictPort` and the `/api` → `127.0.0.1:3013` proxy are kept.
- Updated the port notes in the README and AGENTS.md.
- `backend/test/dev-ports.test.ts` (new): checks that the Vite port is 5183 and does not overlap the dev ports of the other personal apps (5172-5178, workout-memo 5173), and checks `strictPort` and the API proxy. It is skipped in the backend sub repository, where there is no frontend source.

## Verification

- Regression test: **0 pass / 1 fail** before the fix (actual 5173, expected 5183), **1 pass / 0 fail** after the fix.
- Real run: started the health-log API (3013) and Vite, and confirmed that `http://localhost:5183/` returns the app HTML (`<title>식단·수면·건강 기록</title>`, "Meal, sleep, and health log") and that the proxy at `http://localhost:5183/api/health` returns `{"ok":true,"service":"health-log",…}`. health-log did not bind 5173.
- `npm run check` with the dedicated test DB `health_log_test`: **exit 0**. App and DB tests 9 pass / 0 fail / 0 skip (including the new port test), skills 4 pass, and format, lint, types, and build passed.
