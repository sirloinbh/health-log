# #76 Show recently eaten foods first in meal entry

- Issue: [#76](https://github.com/sirloinbh/health-log/issues/76)
- Branch: `feat/76-recent-foods`

## Purpose

So that frequently eaten foods do not have to be searched each time, show the recently recorded foods first when the meal card is opened, and let them be added right away.

## Rules decided

These are rules that were not in the requirements. They were recorded in the [#76 comment](https://github.com/sirloinbh/health-log/issues/76#issuecomment-6621425811) and applied without asking the user. If something different is wanted, it is fixed in a follow-up issue.

- **The criterion for "recent":** The order of recording (the largest meal record ID). It is not the date eaten. Foods that came in through a combo record or a copy are also included.
- **Count:** At most 10, and the same food appears only once.
- **Target:** Only foods from the food store appear. Foods entered directly and foods deleted from the store (the record's food link was cleared) do not appear.
- **Displayed values:** The current values in the food store. Adding one is the same as adding it by search.

## Change — 2026-11-04

- **API** `backend/src/foods.ts`: Added `GET /api/foods/recent`.
  - The response is `{ foods: [...] }`, the same as search.
  - It groups `meal_entries` by `food_id`, picks 10 in order of the largest record ID, and joins with `foods`.
  - It takes the request limit of the food router as it is. There is no DB change.
- **Screen** `frontend/src/meals.tsx`:
  - It shows "최근 먹은 음식" (recently eaten foods) below the quantity input of the meal card and above search. Each item has an "추가" (add) button, and records with the chosen meal and quantity.
  - It reads once when the card is opened. After recording with a food store food, a combo, or a copy, it reads again and raises the food just eaten to the top. Foods entered directly do not affect the list, so it does not read again.
  - A late previous response does not overwrite a new response.
  - If there are no recent records, the area is not shown. If it cannot be read, the reason and a "다시 불러오기" (reload) button are shown.
  - Quantity errors and server refusals are shown next to the recent list. When adding from a search result, it is next to the search result as now.
  - The search results and the recent list have the same shape, so they were put together in a `FoodChoices` component.
- **Test tools**
  - `frontend/src/meals.test.tsx`: `stubFetch` answers separately the recent food request that the card sends by itself. The responses and call counts that the existing tests wrote in order stay as they were.
  - `frontend/src/daily.test.tsx`: It answers the recent food request with an empty list.

## Verification

### Tests

- `backend/test/recent-foods.integration.test.ts`: 3 real DB tests. Two of the issue's completion criteria are here.
  - "The same food only once, in the order of the most recent record": Rice is recorded twice (with soup and egg in between), and one directly entered food is also recorded. Then the calories of the rice are changed. It checks that the list is rice (changed value 320), egg, soup, that the same food does not appear twice, and that there are at most 10.
  - "Directly entered foods do not appear": A directly entered record has no food, so it cannot appear in the response. So it checks that it does not take up a place. After recording the 10 foods of this file, the most recent directly entered record is added, and it checks that the list is still 10. If records with no food were counted as one group, it would be 9. This count does not change even if other test files record at the same time.
  - A food deleted from the store does not appear.
  - The recent list looks at the whole DB, so foods of other test files running at the same time may get mixed in. So only the foods of this file are picked and their order is compared.
- `frontend/src/meals.test.tsx`: 7 added.
  - Display in recent order, adding with the chosen meal and quantity, reading again after recording
  - No area if there are no recent records
  - A quantity error and a server refusal are shown next to the recent list, and it does not read again on failure
  - The read failure notice and reload, keeping the failure reason even after other actions, removing the notice and moving focus after success
  - After a combo or copy it reads again, and after direct entry it does not read
  - If the reloaded list is empty, focus moves to the food search field
  - Focus moves even if a reload and a read after an add overlap

### Run results

- `npm test -w backend`: 67 of 120 passed, 53 skipped. This PC has no PostgreSQL, so the DB integration tests (including the 3 new ones) were skipped, and they are not counted as success. The CI result is written in the PR.
- `npm test -w frontend`: 32 files, 247 passed, 2 skipped (a dark-only app condition, unrelated).
- `npm run check`: passed. Formatting, lint, type check, build, and 4 skill checks passed. In the first run the type check failed on a `mock.calls` type error in the new test, and it passed after changing to the existing `request` helper.

### Browser check

Headless Chrome was driven over CDP. There is no PostgreSQL, so the API used an in-memory stub. The server's sorting and duplicate removal are covered by the DB integration tests above.

| Item                                                                      | 390×844 | 1440×900 |
| ------------------------------------------------------------------------- | ------- | -------- |
| No recent area if there are no records                                    | Pass    | -        |
| Display in recent order after recording two foods by search               | Pass    | Pass     |
| Add request from the recent list as dinner `{"meal":"dinner","foodId":1}` | Pass    | Pass     |
| The same food once, the food just eaten at the top                        | Pass    | Pass     |
| Horizontal overflow, console errors                                       | None    | None     |

In the first run, the "display in recent order" at 1440×900 failed once. The cause was the expected value in the script. The earlier 390×844 run recorded Hetbahn (a rice product) last, so Hetbahn being at the top was right, but the expected value was written the other way around. After fixing the expected value and running again from the initial state, everything passed.

## First review applied — 2026-11-04

- **The failure reason staying or disappearing:**
  - Problem 1: Even when reload succeeded, the previous error stayed below the list.
  - Problem 2: When another action such as search was done, only the failure reason was erased and the "다시 불러오기" button remained.
  - Fix: The read failure reason was separated from the add error. The failure reason disappears only on success, and the add error is cleared by the next action.
- **Focus after reload:** When it succeeds, the button disappears and focus fell to the page. Now it moves to the "최근 먹은 음식" heading. If the list is empty and the area disappears, it moves to the food search field.
  - Test: The frontend test was fixed to check the three above. It was confirmed that this test fails on the code before the fix.
- **Direct entry exclusion test:** The original check had a structure that could not fail, because a directly entered record has no food and cannot appear in the response. Instead it was changed to a test that checks that it does not take up a place. If `WHERE food_id IS NOT NULL` is removed, this test fails.
- **Description of concurrent runs:** The description of the risky interval in the test comment was fixed. The interval is "from the oldest record of this file", not "from the last record".

## Second review applied — 2026-11-04

- **Correcting the focus test:**
  - Problem: In the first round, the focus check was written as "does the text of the focused element contain '최근 먹은 음식'". Even when focus fell to the page body, the body text contains that heading, so it passed. So the "fails on the code before the fix" above was thanks to the other two checks.
  - Fix: It compares whether the focused element is the heading itself.
  - Added: A test for the case where the list is empty and focus moves to the search field was added.
- **Focus in overlapping reads:**
  - Problem: If reload is pressed while waiting for a food add, the read after the add becomes the newer request. That read erases the failure notice and the button but did not move focus.
  - Fix: Reload reserves the focus move, and the read that actually changed the screen handles that reservation.
- **Test confirmation:** The three new focus tests all fail on the code before the first round. The overlapping read test also fails on the first round code (`96096d5`). On the current code all pass.

## Limits and follow-ups

- Even if a record is deleted, the recent list changes the next time the card is opened.
- `meal_entries.food_id` has no index, so it groups all records. It was left because it was judged not a problem at the scale of records of an app used by one person.
- There is no feature to hide or pin a food in the recent list.
- Dark mode, a real phone, Firefox, Safari, and a screen connected to a real DB were not checked.
