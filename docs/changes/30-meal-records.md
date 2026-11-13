# #30 Meal records and daily nutrition totals

- Issue: [#30](https://github.com/sirloinbh/health-log/issues/30)
- Branch: `feat/30-meal-records`

## Purpose

Record the foods and amounts eaten at each meal, and show the day's calorie and nutrient totals. The junk food count (#38) uses these records.

## Change — 2026-11-01

- **DB:** `database/migrations/004_meal_entries.sql`. When a meal is recorded, the food's name, brand, serving size, and nutrients are copied in as per-serving values. So editing a food later does not change past totals.
- **API:** `backend/src/meals.ts`. `GET /api/meals/:date`, `POST /api/meals/:date`, `DELETE /api/meals/:date/entries/:id`. Each returns the whole day's entries and totals from one query. The change and the read of the response run in one transaction. The request rate limit is the same as the other APIs.
- **Calculation:** Multiplying by the quantity and summing are done with the DB's `numeric`, so there is no floating-point error. Each entry is rounded to two decimal places, and the total is the sum of the rounded entries. So the total equals the sum of the entries shown on screen.
- **Missing values:** A nutrient whose value is unknown is not counted as 0. The totals also return, per nutrient, how many entries are missing it, and the screen shows "a total with some entries missing".
- **Screen:** `frontend/src/meals.tsx`. The meal section of the daily record now has the totals, a list per meal, and an add area. If the first load fails, the add area is hidden. If a later reload fails, an alert and a retry button are shown.
- **Cleanup:** The date check for paths is moved into `parseDate` in `backend/src/dates.ts` and shared with the sleep API.
- **Docs:** Updated `docs/next-steps/README.md`.

## Decisions

These rules were not in the issue. They were recorded in a comment on #30 and applied without asking the user.

- **Quantity unit:** A multiple of one serving. 1.5 means 1.5 servings. Grams are not entered directly.
- **Meals:** Four: breakfast, lunch, dinner, snack. They are buttons that can be pressed in one step, instead of a select box.
- **Quick entry:** For a food that is not in the food store, only the name and calories per serving are entered. It is not added to the food store and stays only in that day's record.
- **No editing:** A wrong entry is deleted and entered again, because the issue's scope is read, save, and delete.

## Limits

- If a request whose response was lost is sent again, the same food can be recorded twice. There is no idempotency key. There is one user, and a wrong entry can be deleted.
- The screen check that rejects a value in the quantity field that does not read as a number (`1,5`) cannot be reproduced in jsdom, so it has no test.

## First review fixes — 2026-11-01

The points from the independent review were fixed in this PR.

- **Total and list disagreeing:** Entries were rounded but the total added the unrounded values, so 125+125+125 gave 374.99. The two queries could also see different points in time under concurrent requests. The total is now the sum of the rounded entries in one query.
- **Saved but shown as failed:** If the read after saving failed, the response was 500 but the entry stayed, so retrying recorded it twice. Both are now in one transaction.
- **Focus after cancelling a delete:** Cancelling moved focus to the card title. `returnFocusRef` was removed, so cancelling returns to the delete button, and focus moves to the card title only after the delete finishes.
- **Late response overwriting:** If an entry was deleted while a record request was in flight, the response read earlier made the delete look undone. The delete button is blocked while recording.
- **Read failure after a delete 404:** The screen said the delete succeeded while the entry remained and there was no retry button. It now shows no success message and shows a retry button.
- **Search failure:** The previous results stayed as if they were this result. They are now cleared.
- **Screen rules:** Added the shared `Spinner` to the record button. Typed text is not cleared while waiting. The brand is in the button name so foods that differ only by brand can be told apart.
- **Layout:** The meal card no longer spans two columns, because a two-column layout makes the screen order and keyboard order differ on PC.
- **Intermittent test helper failure:** After the review, backend tests sometimes failed with `bad port` in a full run. This PC's ephemeral port range starts at 1024, so `fetch` sometimes received a port it blocks. `listenForFetch` avoids those ports.
- **Test gaps:** Added tests for brand and `foodId` copying, input limits, entries surviving a food delete, entry order, search races, and clearing the error on the next attempt.

## Second review fixes — 2026-11-02

The points from the independent review were fixed in this PR. There were no blocking points.

- **Error placement:** There was a single alert below the quantity field, so with a long search result list, the error of "record directly" at the bottom could appear off screen. It is now split for search results and direct entry, each shown near its own button, and the result list has a limited height and scrolls.
- **Late reload:** If an entry was recorded during a retry, a read response that started earlier could erase the new entry from the screen. Change responses are counted, and a read response that started before them is discarded.
- **Message after moving to another day:** Success said nothing, and when the response was lost the screen asserted "could not record" (기록하지 못했습니다). Success is now reported together with the date, and when no response arrives it says "could not confirm whether it was recorded" (기록했는지 확인하지 못했습니다).
- **Delete confirmation text:** Added the brand.
- **Focus on retry:** The button that was pressed disappeared, so focus was lost. Focus moves to the card title. `sleep.tsx` has the same structure, but it is outside this PR's scope, so it was not fixed.
- **Search announcements:** Added `Spinner` and `aria-busy` to the search button. The count and "no results" are announced in an always-present status region.
- **Test gaps:** Added a record failure for a searched food and the rollback after a read failure following a delete. Removed the unused `EntryRow.entry_date` type.

## Checks

- Added tests: `backend/test/meals.test.ts`, `backend/test/meals.integration.test.ts`, `frontend/src/meals.test.tsx`, `frontend/src/daily.test.tsx` (late response for a past date)
- Mapping to the completion criteria:
  - 1.5 servings counted: integration test `1.5 servings count exactly in calories and every nutrient`
  - Past totals kept after editing a food: integration test `editing a food later leaves past days as they were`
  - Note for partly missing values: integration test `an unknown nutrient is counted as missing, and a known zero is not`, screen test `the totals say when an unknown value leaves them incomplete`

- `npm run check` (with a temporary DB): passed. Backend 78 passed, 0 skipped. Frontend 148 passed, 2 skipped (a condition for the dark-only app, unrelated to this change). Skill checks 4 passed
- `npm run knip`, `npm run standards:check`: passed
- After the second review fixes (2026-11-02): `npm run check`, `npm run knip`, `npm run standards:check` passed. Backend 79 passed, 0 skipped. Frontend 157 passed, 2 skipped. Skill checks 4 passed

### DB integration tests

The DB account on this PC cannot create `health_test`, so a separate PostgreSQL 17 cluster was started in a temporary folder with `initdb` and `health_test` was created there. The existing DB was not touched. The 4 migrations were applied, and re-running `004` also passed.

### Browser check

Headless Chrome was driven over CDP. The API was the real server, and the DB was the temporary cluster above. Input was done by setting the value and dispatching an input event, not by keyboard.

| Item                                            | 390×844 | 1440×900 |
| ----------------------------------------------- | ------- | -------- |
| Message for a day with no entries               | Pass    | Pass     |
| Record a searched food as 1.5 servings at lunch | Pass    | Pass     |
| Total 185.18kcal, protein 15g                   | Pass    | Pass     |
| Note for partly missing values                  | Pass    | Pass     |
| Record with only a name and calories            | Pass    | Pass     |
| Total kept after editing a food and reloading   | Pass    | Pass     |
| Delete confirmation, total update, focus move   | Pass    | Pass     |
| Entries not visible on another day              | Pass    | Pass     |
| Horizontal overflow, console errors             | None    | None     |

It was repeated 3 times and all passed. The failures in the first two runs were problems in the check script. One was that the chosen date was the day after the day the entries were put in at the earlier size, and the other was that the command to empty the temporary DB had garbled Korean text, so a food remained.

After the second review fixes, the table above was run again and all passed. With 15 foods searched, the following were also checked (390×844, 1440×900).

| Item                                                                  | Result |
| --------------------------------------------------------------------- | ------ |
| Result list height limit (320px) and scrolling                        | Pass   |
| Count message "15 search results" (검색 결과 15건)                    | Pass   |
| The "record directly" error is inside that form and visible on screen | Pass   |
| The "add" error on the first and last list rows is visible on screen  | Pass   |
| Horizontal overflow, console errors                                   | None   |

A real phone, dark mode, and a screen reader were not checked.
