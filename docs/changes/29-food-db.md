# #29 The food nutrition store and the source rules

- Issue: [#29](https://github.com/sirloinbh/health-log/issues/29)
- Branch: `feat/29-food-db`

## Purpose

Create a place to store the research results on franchise menu items, retort foods, and favorite foods together with their sources. Without the source and the checked date, we cannot verify later whether a number is correct.

## Changes: 2026-10-31

- **DB:** `database/migrations/002_foods.sql`. Nutrition is per serving, and an unknown value is NULL. The DB also rejects negative values and a serving of 0 or less. The combination of name and brand cannot be duplicated.
- **API:** `backend/src/foods.ts`. `GET /api/foods?q=`, `POST /api/foods`, `PUT /api/foods/:id`. Delete is outside the issue scope.
- **Validation rules:** official and public data need the source URL and the checked date, and a product label needs the checked date. The source URL accepts only http and https.
- **Research data:** added with `ON CONFLICT` in a migration, with no new tool. Running it again does not create duplicates, and only a research with a newer checked date changes an existing value that has a date.
- **Screen:** `frontend/src/foods.tsx`. The food menu, search, and add and edit. It shows 0 and "no value" differently.
- **Rules document:** `docs/food-data.md`.
- **Error handling:** replaced the own error handling in `backend/src/app.ts` with `notFound` and `errorHandler` from the shared `standard/http.ts`. The 404 response needed `HttpError`.
- **Test safeguard:** we found that `TEST_DATABASE_URL` on this PC points to `study_test` of another project. An integration test that writes now runs only when the DB name is `health_test`, and otherwise it is skipped with the reason shown.

## Verification

- Tests added: `backend/test/foods.test.ts` (input rejection), `backend/test/foods.integration.test.ts` (real DB), `frontend/src/foods.test.tsx` (screen)
- Local `npm run check`: passed. 94 frontend tests passed. 29 backend tests passed, 10 skipped. The 10 skipped are `foods.integration.test.ts`, and they could not run because there is no `health_test` locally. The 29 that passed include 1 basic DB test that only reads from `study_test` (#52).
- DB integration tests: ran on `health_test` in the CI `ci / verify` of the first commit (`ab9c3b2`). 23 backend tests passed, 0 skipped. The results of the later commits are in the review fix sections below.
- `npm run knip`, `npm run standards:check`: passed

### Browser check

Headless Chrome, viewports 390×844 and 1440×900. The API used the real `createApp`, routes, and validation code, with only the store replaced by memory. Real SQL is not part of this check.

| Item                                                                  | 390×844 | 1440×900 |
| --------------------------------------------------------------------- | ------- | -------- |
| The empty list notice, the menu display                               | pass    | pass     |
| A Korean error for a missing serving and a negative input, input kept | pass    | pass     |
| The list refreshes after adding, 0 kcal and "no value" are told apart | pass    | pass     |
| The value is applied after an edit                                    | pass    | pass     |
| The notice for a search with no results                               | pass    | pass     |
| The input window fits on the screen, no horizontal overflow           | pass    | pass     |

## First review fixes: 2026-10-31

Of the 13 findings of the independent review, we fixed 10, split 2 into [#52](https://github.com/sirloinbh/health-log/issues/52), and wrote 1 (CodeQL) separately below.

- **Research data rule:** removed the branch where a rerun overwrote a food whose checked date was cleared. A correction with the same date is ignored, so the docs say to use `UPDATE`.
- **Numbers:** values below the third decimal place were rounded (`0.004`→0) or caused a 500 from a DB constraint violation. They are now rejected with a Korean error.
- **Dates:** a future date can block later research forever, so it is rejected. `0000-01-01` is also rejected.
- **Screen:** fixed the problem that an invalid input in a number field was saved as "no value", the problem that cancelling during a save closed another window, the problem that a successful save of a food hidden by the search was not visible, and the problem that letters that were not searched were applied after saving.
- **Validation gaps:** added the rejection of `http:foo`, the Korean error for a body that is not an object, and the DB constraint of the source rules.
- **Tests:** fixed the `%` check so that it really verifies the escape. The integration test reads and runs the SQL of `docs/food-data.md` as it is.
- **Browser recheck:** typing `1e` in a number field with real keys gives an error notice, and it saves after you fix it. The whole flow also passed again at both sizes.

- **CI result (`6e9edc0`):** in `ci / verify` on `health_test`, 31 backend tests passed, 0 skipped, and 93 frontend tests passed.

## Second review fixes: 2026-10-31

We fixed 5 of the 6 findings and split 1 into [#53](https://github.com/sirloinbh/health-log/issues/53). The review is at most 2 rounds, so there is no third review.

- **Rules document:** "a fixed value stays after a rerun" was not always true. We wrote the result for each case in a table, and wrote a form for the `UPDATE` correction that is also safe to rerun.
- **Numbers:** because of a tolerance, a value such as `5e-9` passed and led to a 500 or to saving 0. We changed to a `toFixed(2)` comparison so that only values with two decimal places are accepted.
- **Search:** fixed the problem that a failed search term was used in the refetch after saving and the list went empty.
- **Tests:** added a check that today is allowed, and DB constraint checks for `public` and `label`.

### CodeQL alert

CodeQL reported 3 `js/missing-rate-limiting` (no request rate limit) findings on the new route in `backend/src/foods.ts`. The check is not required, but it was in a failed state.

- The central decision (`project-standards#291`) is to limit with `limit_req` in `frontend/nginx.conf` (10 per second per IP, burst 40, 429) and dismiss the alert.
- The user decided to act on the alert instead of dismissing it. We first added our own middleware, but CodeQL did not recognize it, so by the user choice we installed `express-rate-limit` 8.7.1 and replaced it. Only this app differs from the central nginx-only way, and the nginx limit is kept as it is.
- Version: the latest 8.7.2 was published 2 days ago and did not meet the 14-day publish standard, so we chose 8.7.1 (2026-10-06). It has no install script, and the user installed it directly with `--ignore-scripts`.
- The limit is 700 per minute per address. It is larger than the 640 per minute that nginx lets through at most, so it does not act in normal use, and it guards against direct access to the API.
- `/api/health` is excluded from the limit. The status check must answer even while limited.
- Limits: the record is only in memory, so a server restart resets it. Behind a proxy every request looks like it comes from the nginx address, but there is one user, so it is not a problem.
- When you create a new router, attach the limiter directly to the router in the same way.

## Limits and follow-up

- There is no food delete. If it is needed, decide the relation to meal records (#30) first and handle it in a separate issue.
- Search results show up to 100. If the research data grows and that is not enough, add paging.
- To run the DB integration tests locally, the user must create `health_test` and apply the migrations. The current DB account has no permission to create a DB.
- We did not check dark mode or a real phone.
