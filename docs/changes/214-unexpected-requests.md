# #214 Fail screen tests on unexpected or unmatched requests

- Issue: [#214](https://github.com/sirloinbh/health-log/issues/214)
- Branch: `test/214-unexpected-requests`

## Purpose

Permissive fakes let a test pass when the code sends a request the test did not expect:

- `meals.test.tsx`'s server answered `200` with an empty body once its replies ran out.
- `app.test.tsx` applied the health status to every URL, and answered the dashboard's report read with the health body.
- `body.test.tsx`'s `sent()` broke with a TypeError when the request was missing, and its lookup was copied five times.
- `test/setup.ts` let an unstubbed `fetch` reach the network.

## Decisions

- A rejected request alone does not fail a test: the app turns it into "Cannot reach the server". So the new `frontend/src/test/requests.ts` notes each unexpected request and rejects it, and the setup's `afterEach` fails the test with the list (`failOnUnexpectedRequests`), after the other resets have run.
- `test/setup.ts` sets `globalThis.fetch` to a stand-in that fails with `unmocked fetch: <method> <url>`. It is set directly, not with `vi.stubGlobal`, so `vi.unstubAllGlobals()` after each test brings back the stand-in rather than the real `fetch`.
- One known stray request is ignored by name: the managed `lib/query.test.tsx` resets focus in its own `afterEach` while its query is still mounted, so it reads `/api/tags` once more after the test. The managed file cannot be edited here; filed as sirloinbh/project-standards#980.
- `meals.test.tsx`: a request after the last reply goes through `unexpectedRequest` and fails the test.
- `app.test.tsx`: only `/api/health` gets the test's status. Goals, reminders and the week's report get their own 200 answers (an empty report for the week of 2026-10-26); anything else fails the test.
- Found while merging `main`: #276 added `more-foods-button.test.tsx` with a fixed `setTimeout` before checking that focus stayed on the button, the pattern #213 removed. The button handles the failed read in promise steps only, so it now waits one task with `nextTask` from `test/answered.ts`. A mutation that moves focus after any load (`.finally`) fails it.
- `body.test.tsx`: `requests`, `didSend` and `sent` read the fake's calls in one place. `sent` fails with "No PUT request was sent; sent: …" instead of a TypeError, and the five copies of the method lookup use `didSend`.

## Change — 2026-11-22

- **New** `frontend/src/test/requests.ts`: `unexpectedRequest`, `unmockedFetch`, `failOnUnexpectedRequests`; **new** `frontend/src/test/requests.test.ts` (2 tests).
- `frontend/src/test/setup.ts`: the `fetch` stand-in and the check at the end of `afterEach`.
- `frontend/src/meals.test.tsx`, `frontend/src/app.test.tsx`, `frontend/src/body.test.tsx` as above; `frontend/src/more-foods-button.test.tsx` waits with `nextTask`.

## Verification

### Tests

- `npm test -w frontend` after merging `main` (#276): 77 files, 778 passed, 3 skipped. The new stand-in found one stray request in the whole suite (the managed query test above).
- By hand, once: an extra `fetch('/api/meals/2026-03-15')` at the end of "a searched food is recorded with the chosen meal and quantity" failed it with `The test sent requests it did not expect: unexpected request: GET /api/meals/2026-03-15`. Removed afterwards.
- `app.test.tsx` with unknown URLs failing first showed the dashboard's `/api/report` reads, which used to get the health body; they now have their own answer.

### Commands
