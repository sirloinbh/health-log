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
- Differences found in review round 1: React Query does not run the one-minute refetch while the tab is hidden (`refetchIntervalInBackground` is off), and reads again the moment the tab becomes visible, so the date is current whenever it can be seen. An answer that is not JSON (a proxy's HTML page) now shows requestJson's "The server sent an unreadable answer" or "Could not process the request" instead of "Cannot reach the server". `/api/health` needs no sign-in, so requestJson's 401 handler never fires for it.

### Tests

`app.test.tsx` adds three behavior tests: the date changes after a minute (fake timers advance 60 s, two health reads), the page becoming visible reads again, and an answer without a date is an alert.

### Test adjustments

- React Query hands a result to the screen one task later than the old `fetch().then(setState)`, so tests that pressed "Add" on the visits and medications pages the moment the button appeared now beat the server's date and got a blank date field. A person cannot press that fast; the waiting itself is covered by the pages' own "waits for today" tests (and #204 / PR #254 for medications). `App` takes an optional `queryClient`, and the new `src/test/query.ts` `testQueryClient({ today })` gives these tests a client that already knows the date. The two visits tests about waiting for the date keep the real read (`openAsking`).
- `daily.test.tsx`, `report.test.tsx`: the `visibilitychange` event is created with `bubbles: true`, as browsers fire it. React Query listens on the window, which a non-bubbling event at the document never reaches.

### Verification (health check PR)

- `TEST_DATABASE_URL= npm run check` after merging `origin/main` (with #204): passed. Frontend vitest 72 files, 734 passed, 3 skipped. The backend DB integration tests skip locally (no `health_test`); CI runs them.
- CI on the first push failed after #204 (PR #254) merged: its two new medication tests check the wait for the server's date, so they now render through `openAsking` (the real read), like the visits ones. Fixed after merging `origin/main`.

## Sleep, daily check, alcohol and tobacco, and body cards — 2026-11-22

`SleepCard`, `ChecksCard`, `HabitsCard` and `BodyCard` load with `useApiQuery` on the day's path (`apiKey('/api/sleep/<date>')` and so on) and save and delete with `useApiMutation`. Their `useEffect` load loops, `live` refs, and `saving` state are gone; "Try again" is `refetch({ cancelRefetch: false })`, so pressing twice still sends one read.

- **Writes update the cache.** A save's answer goes into the day's cached record from the mutation's own `onSuccess`, which runs even after the card is gone, so coming back within the 30 s `staleTime` shows the saved record without a read. Deleting a sleep or body record sets it to none; deleting a daily check or a habit record resets the day's query, so the rates and totals read again behind a skeleton, as before.
- **Body trend.** The trend is its own query, `apiKey('/api/body', from, to)`, waiting at mount for any body write on its way (`useReadAfterWrites('/api/body/')`), as `writesSettled(pathOf(''))` did. A body save or delete cancels trend reads still on its way and then invalidates every trend key: React Query would otherwise join the older read that left before the save, and the newer answer must win (the existing "slow older trend" tests). The save does not wait for the trend. The trend error is hidden while "Reload changes" is on its way, so a repeated failure is announced again.
- **Reading after a write still on its way (#71)** is `useReadAfterWrites(path)` in the new `frontend/src/writes.ts`: writes pass `asRequest` as their request, so each mutation's variables carry its path, and `useIsMutating` with a path-prefix predicate tells whether one is pending. A card does not read until no write to its day is pending, then stays ready, so its own saves do not hide it.
- **Transition:** each write is still wrapped in `trackWrite`, so the goals card, which reads through `pending-writes` until it moves too, keeps waiting for and re-judging after these saves. The wrapper goes when the last card moves (#220).
- A failed refresh with a record on screen keeps the record; only a failed first read shows the error and "Try again".

### Tests

- `src/test/query.tsx` (renamed from `.ts`): `renderWithQuery` renders inside one query client per test, so a card unmounted and mounted again shares the cache and pending writes, as moving between days does; `src/test/setup.ts` clears it after each test.
- `sleep.test.tsx`, `checks.test.tsx`, `habits.test.tsx`, `body.test.tsx`, `save-focus.test.tsx` render through `renderWithQuery`. `body.test.tsx` "coming back while a save is on its way" now expects one read of the day instead of two: the save's answer is the record. The "save fails after leaving the day" tests wait until the save is sent before answering it: React Query sends it a moment after the click.
- New: `sleep.test.tsx` "coming back soon after a save shows the saved night from the cache, without reading again".
- `vitest run` on sleep, checks, habits, body, save-focus, daily and goals tests: all passed.
