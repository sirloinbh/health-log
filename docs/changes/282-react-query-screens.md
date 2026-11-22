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
