# #220 Adopt the shared query layer on @tanstack/react-query

- Issue: [#220](https://github.com/sirloinbh/health-log/issues/220)
- Branch: `feat/220-react-query`
- Parent: sirloinbh/project-standards#788 (ADR-0027)

## Install the package — 2026-11-22

Add `@tanstack/react-query` 5.104.1 to the `frontend` workspace with the approved command, `npm install --ignore-scripts --save-exact @tanstack/react-query@5.104.1 -w frontend` (user reconfirmed on 2026-11-22, issue comment). It brings one dependency, `@tanstack/query-core` 5.104.1 (MIT, no install scripts). npm also moved `@vitejs/plugin-react` into alphabetical order in `frontend/package.json`; the version is unchanged.

This repository has no `lockfiles:sync` script: the npm workspaces share the one root `package-lock.json`, which the install updated, so there is no second lockfile to sync.

### Verification

- `node .standards/ioc-scan.mjs`: `ioc-scan: no suspicious items` (it notes that esbuild and fsevents have install scripts, which do not run with `--ignore-scripts`; both were already in the lockfile).
- `npm audit` from the install: `found 0 vulnerabilities`.

## Provide a query client — 2026-11-22

`App` now wraps the routed app in a `QueryClientProvider` with one `QueryClient` per mounted app, so the new dependency is used (the CI knip-strict job fails an unused dependency) and later screens can call query hooks. The client has React Query's own defaults for now; the shared `createQueryClient()` replaces it once `frontend/src/lib/query.ts` arrives through the standards sync (user decision A on 2026-11-22, #220 comment: install PR first, then the central `features.query` flag, then the sync PR, then the screen migrations). Nothing calls a query hook yet, so no screen changes.

### Verification

- The existing `app.test.tsx` screen tests render `App` through the provider.
- `TEST_DATABASE_URL= npm run check`: passed (format, lint, contract, typecheck, tests, skills, build). Frontend vitest: 67 files, 651 passed, 3 skipped. The backend DB integration tests skip locally because `health_test` is not set; CI runs them.
- Local `knip`: no finding for `@tanstack/react-query`. It lists `e2e/smoke.spec.ts` and `@axe-core/playwright`, which this branch does not touch.

## Shared client and the server health check — 2026-11-22

The standards sync brought `frontend/src/lib/query.ts` (sync PR #257, after sirloinbh/project-standards#977 turned on the `query` feature). `App` now creates its client with the shared `createQueryClient()`.

The hand-written polling hook `useHealth` in `app.tsx` (an interval, a visibility listener, and a request counter so an older answer could not overwrite a newer one) is replaced by `useServerHealth`, one `useQuery` on `apiKey('/api/health')` read through `requestJson` with the query's abort signal:

- `refetchInterval: 60_000` keeps "today" current in an app left open past midnight, as before.
- `refetchOnWindowFocus: 'always'` reads again when the page becomes visible, as the visibility listener did.
- `retry: false`: an outage shows at once, and the next check is at most a minute away.
- React Query runs one read at a time per key, which replaces the request counter.
- A 200 answer without `today` still shows "Cannot check the server status". A network failure shows requestJson's "Cannot reach the server", the same text as before.

### Tests

`app.test.tsx` adds three behavior tests: the date changes after a minute (fake timers advance 60 s, two health reads), the page becoming visible reads again, and an answer without a date is an alert.
