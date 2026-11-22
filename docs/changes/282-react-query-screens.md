# #282 Move the remaining screen reads to React Query

The screens that #220 left reading with their own load functions and stale-answer counters move to the shared React Query layer (ADR-0027), in stacked PRs per screen group.

## Report (dashboard) — 2026-11-22

- `ReportPage` reads with `useQuery` keyed by `apiKey('/api/report', period, date)` (`reportQuery`), with `placeholderData: keepPreviousData`. The earlier report stays on screen, dimmed and `aria-busy`, while the next period loads (#138); `loading` is now `isPlaceholderData`. The `latest` counter and the `report`/`loading` state are gone.
- A date out of range shows no report, as before: the shown report is the query's only while a date is asked.
- The focus reducer (`report-focus.ts`, #212) is unchanged. Each address is one load: the key-change effect dispatches `load` and ends it with `client.fetchQuery`, which joins the read the query has just started, or answers at once from a fresh cached report. The effect's cleanup flag drops the end of a load for an address already left. "Try again" dispatches `retry`, refetches, and ends only if the address is still the one it was pressed on.
- The shared `useApiQuery` takes no `placeholderData`, so this uses `useQuery` directly with `requestJson` and the request's abort signal, as the health check does.
- **Behavior changes:** going back to a period seen in the last 30 seconds shows it at once without a request. Returning to the tab reads the shown period again in the background, without dimming it. A server error is retried once after a second (the shared client's rule), so its word shows a second later.

### Tests

- `report.test.tsx` renders the app with `testQueryClient()` (no automatic retry), so each failure a test serves shows at once and the hand-counted request order holds.
- New: "going back to a period just shown brings it back at once, without asking again (#282)".
- `vitest run` on report, report-focus and app tests: all passed (27 report tests).
- The full `npm run check` was not run locally: another lane held the shared check lock. Instead: `prettier --check` on the changed files, `eslint --max-warnings 0`, frontend `tsc --noEmit`, and `vitest run` on report, report-focus, app, reminders and daily tests (87 passed). CI runs the full check.
- No browser check: the markup is unchanged, and the screen tests cover the behavior.

### Review round 1 fix (report PR)

- Going back to a period cached more than 30 seconds ago showed its older numbers undimmed while it was read again; the old page dimmed every load the person started. The report is now also dimmed while a read the person started (a move, "This week", or a retry) is on its way. A quiet read on returning to the tab still does not dim it. New test "a period cached a while ago is shown dimmed while it is read again" fails without the fix and passes with it (28 report tests pass).

## Clinic and medicine page lists — 2026-11-22

- **Clinic page** (`VisitsPage`): one `useQuery` per search, `apiKey('/api/visits', 'list', words)`. Its read fetches pages until it has `keep` visits, as many as were shown, so a save or a delete keeps the place of someone who loaded more (#208); a new search starts at one page. A plain `useInfiniteQuery` was not used: it re-reads only as many pages as before, so an added visit would push the old last one behind "Show more" (the #208 test "adding a visit after loading more" covers this). "Show more" reads the next page and appends it to the cached list; a page that comes back after a reload or another search was asked is dropped (the cached list or the asked words changed). The list on screen stays while the next search is on its way, and when it fails, as before. The `latest` counter and the `visits`/`more`/`searching` state are gone.
- **Medicine page** (`MedicationsPage`): `useApiQuery` on `apiKey('/api/medications', 'lists')`, and the recent visits offered in the dialog on `apiKey('/api/visits', 'recent')`. "Try again" says "Reloading the list…", then "The list was reloaded." or the failure; a failed read shows over those words and is hidden while reading again, so a repeated failure is announced anew. A delete drops the medicine from the cached lists at once.
- **Refreshing the other screens:** a save or delete on either page invalidates `apiKey('/api/visits')` or `apiKey('/api/medications')` (every key under it: the page lists and the daily card's days) and the upcoming list. So `VisitsCard` no longer needs `staleTime: 0` and uses the 30-second default. `RemindersCard` keeps `staleTime: 0`, as its list changes with the service day.

### Tests

- New: "a visit saved on the clinic page reads the daily card again (#282)" renders the daily card and the clinic page in one client; it fails when only the page's own list is invalidated.
- `vitest run` on medications, visits, daily and reminders tests: 82 passed.
- Full `npm run check` with `TEST_DATABASE_URL` empty, under the shared check lock: passed (exit 0). Frontend: 76 files, 781 passed, 3 skipped; the backend's database tests are skipped without a test database, as intended.
- No browser check: the markup is unchanged, and the screen tests cover the behavior.

### Review round 1 (clinic lists PR)

- Checked whether the daily card could keep a cached day after a save that lands once the clinic page is gone (the card no longer reads on every mount). It cannot: the dialog's submit keeps running after the page unmounts, as `mutateAsync` still resolves, so its `onSaved` reload invalidates the day. New guard test "a visit save that lands after leaving the clinic page still refreshes the daily card (#282)"; visits and medications tests: 42 passed.
