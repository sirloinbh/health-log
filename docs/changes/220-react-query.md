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
- `origin/main` merged (with #205 body client checks; its new body tests render through `renderWithQuery`). `TEST_DATABASE_URL= npm run check`: passed. Frontend vitest 73 files, 760 passed, 3 skipped (761 after the review fix); the backend DB integration tests skip locally (no `health_test`); CI runs them. The build's existing chunk-size warning stays; the main chunk grew from 660.8 kB to 679.7 kB (gzip 199.9 to 206.0 kB), mostly React Query.
- Review round 1 noted that a refetch on returning to the tab, still on its way while a save lands, could put the older answer over the saved record. Fixed in the same PR: writes put their answer with `putAnswer` (`writes.ts`), which cancels reads of that key on their way and then sets the data. React Query restores the pre-read state at once on cancel, and a manual set becomes that state, so the answer cannot be lost. New test in `sleep.test.tsx`: "a read from returning to the tab that is still on its way cannot undo a save" (fails with the cancel removed, passes with it).

## Meals card — 2026-11-22

`MealCard` loads with `useApiQuery` on `apiKey('/api/meals/<date>')` behind `useReadAfterWrites`, and adds and deletes through one mutation whose answer (the whole day) goes in with `putAnswer`. The `changes` counter that kept a read started before a change from undoing it on screen is replaced by `putAnswer`'s cancel-then-set; the `adding` state is the mutation's pending POST; the `live` ref stays only for the toasts after leaving the day.

- The add sends an `Idempotency-Key` header (#196), and the shared `useApiMutation` passes no headers, so the card uses React Query's `useMutation` directly (`useMealWrite`) with the same `{ path, method, body }` variables plus `headers`. The central follow-up is sirloinbh/project-standards#979 (let `useApiMutation` pass request headers).
- A failed read keeps the day on screen with the error and "Try again", as before; the next change's answer clears the error because it is the newer day.

### Tests

`meals.test.tsx` renders through `renderWithQuery`. The three "after leaving the day" tests and "focus follows the retry even when a read started by an add answers first" wait until the add is sent before answering it. "Coming back while an entry is being recorded" expects one read of the day instead of two: the add's answer is the day. `vitest run src/meals.test.tsx`: 66 passed.

## Goals settings and the goal results card — 2026-11-22

- **Settings** (`GoalsSettings`): one `useApiQuery` on `apiKey('/api/goals')` behind `useReadAfterWrites('/api/goals')`. A goal save puts the answer (all goals) with `putAnswer`, which replaces the old `latest` counter (#202). A deleted change disappears at once (`setQueryData` with `withoutChange`), then `invalidateQueries` reads the server's answer; a newer read replaces one still on its way. The error is hidden while "Try again" reads, so a repeated failure is announced anew.
- **Goal results card** (`GoalsCard`): `useApiQuery` on `apiKey('/api/goals/days', date)`, reading only after writes to every judged path settle (`useReadAfterWrites(...judgedPaths(date))`). The `pending-writes` listener is replaced by `onWriteSettled(client, listener)` in `writes.ts`, a subscription to React Query's mutation cache that reports the path of every write that succeeds or fails; a judged path invalidates the day's verdicts. "Re-judge" is a plain `refetch()`, which replaces a quiet read still on its way, as before; only a read the person asked for shows "Re-judging".
- All judged writers (meals, sleep, checks, habits, goals) are React Query mutations now, so nothing reads `pending-writes` on the daily page. The writes are still wrapped in `trackWrite` until the clinic and medication screens move; the last #220 PR removes the module.

### Tests

- `src/test/query.tsx` adds `write(path, answer)`: a write through the test's query client, as a card's `useApiMutation` with `asRequest` makes it. `goals.test.tsx` uses it instead of `trackWrite` and renders through `renderWithQuery`.
- New: "saving in a real card of the same day judges again" renders `GoalsCard` and `SleepCard` in one client and checks that the sleep save reads the verdicts again.
- `vitest run src/goals.test.tsx src/save-focus.test.tsx src/app.test.tsx`: all passed (24 goals tests).
