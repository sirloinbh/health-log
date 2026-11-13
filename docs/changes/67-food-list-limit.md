# #67 Remove the 100-item limit of the food list and search

- Issue: [#67](https://github.com/sirloinbh/health-log/issues/67)
- Branch: `feat/67-food-list-limit`

## Purpose

The food list and search were cut off by `LIMIT 100`, and there was no notice that they were cut. With #33 the foods became 95, and adding the #31 and #32 research data would make some foods impossible to find on any screen.

## Change — 2026-11-05

- **API** `backend/src/foods.ts`: `GET /api/foods?q=&offset=`
  - The response is `{ foods, nextOffset }`. It gives 100 at a time (`foodPageSize`), and gives the start position of the next page in `nextOffset` if there is one, or `null` for the last page.
  - It reads 101 to decide whether there is a next page. It does not count the total.
  - The sort is `name, brand NULLS FIRST, id`. A combination of name and brand cannot already be duplicated, but `id` was added so that pages do not overlap or skip even if that rule changes.
  - `offset` accepts only an integer of at most 7 digits and 0 or more. Negative numbers, decimals, empty values, and repeated parameters are rejected with 400 `목록 위치가 올바르지 않습니다` (the list position is not valid).
- **Screen common** `frontend/src/food-search.ts`: the food search hook `useFoodSearch`
  - `search` reads the first page, and `loadMore` attaches the next page below the list.
  - Only the latest request changes the list. A new search discards a next page in progress, and a next page is not requested during a search.
  - If a food is added after the first page and a food already shown comes again in the next page, the same food is shown only once.
  - If the next page request fails, the list already shown is kept, and the button can be pressed again.
  - A response with no `nextOffset` is treated as the last page.
- **Button** `frontend/src/more-foods-button.tsx`: `결과 더 보기` (show more results). It shows only when there is a next page, and cannot be pressed while reading or searching (changed to `aria-disabled` after the first review, see below).
- **Food screen** `frontend/src/foods.tsx`: Below the list, it shows `음식 N개 표시 중. 더 있습니다.` (showing N foods. There are more.) and the button. The behavior where a failed search keeps the previous list is as before.
- **Meal entry** `frontend/src/meals.tsx`, **combo dialog** `frontend/src/combos.tsx`: The status text becomes `검색 결과 N건 표시 중, 결과가 더 있습니다` (showing N search results, there are more results), and a button appears below the results. On the last page it is `검색 결과 N건` (N search results) as before.

## Verification

- Tests
  - `backend/test/foods.test.ts`: Checks 6 kinds of wrong `offset` and rejection of a repeated parameter. It also checks that `nextOffset` is decided by reading 101.
  - `backend/test/foods.integration.test.ts`: Inserts 150 foods, including foods with the same name (with and without a brand). Then it follows the pages and checks that all 150 appear once each in 2 pages. It also checks that the count followed without a search term equals the total number of rows in `foods`.
  - `frontend/src/food-search.test.ts` (new file, 9 tests): Checks the address format, status text, appending the next page, removing duplicates, a response without `nextOffset`, retry after failure, a new search overlapping the next page, ignoring the next page during a search, and whether the list of a failed search is kept.
  - `frontend/src/foods.test.tsx`, `meals.test.tsx`, `combos.test.tsx`: On each screen, check the notice text, the button, the `offset=100` request, the added results, and the button disappearing on the last page. The food screen also checks that the list and button remain after a next page failure.
- On a temporary PostgreSQL 17 cluster (`initdb`, port 5467), the 7 migrations were applied twice to `health_test`. The second time had no errors either.
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5467/health_test npm run test -w backend`: 123 passed, 0 skipped.
- `npm run check` with the same `TEST_DATABASE_URL`: passed (exit code 0).
  - Formatting, lint, type check, build: passed.
  - Backend: 123 passed, 0 skipped.
  - Frontend: 260 passed in 33 files, 2 skipped. The 2 skipped are condition tests for the dark-only app, unrelated to this change.
  - Skill checks: 4 passed.

### Browser check

150 more test foods were put into `health_browser`, a copy of the temporary DB, making 245 foods. A real API (3993), Vite (5203), and headless Chrome were driven over CDP. The search term was entered by key input and buttons were pressed with mouse events.

| Item                                                                                                  | 390×844 | 1440×900 |
| ----------------------------------------------------------------------------------------------------- | ------- | -------- |
| Food screen: 100 → 200 → 245, the notice text, the button disappearing at the end                     | Pass    | Pass     |
| Food screen: all 245 names once each                                                                  | Pass    | Pass     |
| Food screen: after a 500 response for the next page, the list of 100 stays, press again to get 150    | Pass    | Pass     |
| Meal entry: `테스트` (test) search shows 100 results notice → 150, a food on page 2 actually recorded | Pass    | Pass     |
| Combo dialog: 100 results notice → 150, the dialog is inside the screen                               | Pass    | Pass     |
| Horizontal overflow, console errors                                                                   | None    | None     |

## First review — 2026-11-05

The independent review had no high points. It judged the page calculation, the sort, the request order handling, and the `offset` validation to be correct. 1 medium and 4 low points came up.

- **Medium: Each time "결과 더 보기" is pressed, keyboard focus is lost.** The button became `disabled` while reading, so Chrome moved focus to `body`. On the last page the button disappeared and the same thing happened.
  - Applied: The button was changed to `aria-disabled`, and a press while reading is ignored.
  - Applied: When the last page arrives, focus moves to the status text. The status text receives focus with `tabIndex=-1`.
  - Applied: The status text of the food screen remains as `음식 N개` (N foods) even on the last page. A place to receive focus remains, and the changed count is read out.
  - Applied: `loadMore` of the hook does not request again while reading, and returns whether it was the last page.
- **Low: The page boundary of the integration test did not fall between foods with the same name.** It passed even if `brand` and `id` of the sort were removed.
  - Applied: One pair was pushed. The 100th and 101st foods are made to have the same name (without a brand, with a brand), and this is checked directly with `offset=99`.
- **Low: In meal entry, the next page also cleared the notice of another field.**
  - Applied: `onMoreStart` and `onMoreError` were set up separately in the hook.
  - Applied: The start and failure of the next page use only a separate notice field below the button. The error is shown next to the pressed button, not above a long list.
- **Low: On the food screen, when the next page succeeded, the notice of a search that had failed earlier was cleared.** Then the list of the previous search term looks like the result of the new search term.
  - Applied: The next page does not touch the search notice and uses only its own notice field.
- **Low: `docs/next-steps/README.md` wrote #67 as "done" before merging.**
  - Left as it is. This PR is merged right after review and CI, and this document is read on the merged `main`.
- **Not treated as a separate issue:** Returning to the first page after saving, and that a food added between pages may be missed, are already written in the limits below. Cursor-style paging is an API design change, so it will be handled when foods actually become many enough to be a problem.

### First round verification

- Tests
  - `food-search.test.ts`: Added a test that checks that the next page uses its own callback instead of the search callback and returns whether it was the last. Also added a test that checks that pressing twice while reading makes only one request. This file now has 11 tests.
  - `foods.test.tsx`: Checks that focus after the last page goes to `음식 2개`. Checks that while reading, the button is `aria-disabled` and not `disabled`, keeps focus, and ignores extra presses. Also checks that the next page leaves the notice of a failed search.
  - `meals.test.tsx`: Checks that focus after the last page goes to the status text. Also checks that the success and failure of the next page do not clear the notice of the direct entry field, and that the failure notice appears below the button.
- `npm run check` (same temporary DB): passed.
  - Backend: 123 passed, 0 skipped.
  - Frontend: 265 passed in 33 files, 2 skipped.
  - Skill checks: 4 passed.
- Browser check: In the same environment, the 38 items of the table above were run again and all passed. This time it was also checked by keyboard (390×844, 1440×900).
  - With focus on the button, pressing Enter keeps focus on the button while reading and gives `aria-disabled="true"`.
  - After page 2 arrives, focus is still on the button.
  - After the last page, focus goes to the `음식 245개` text. Pressing Shift+Tab goes to the `수정` (edit) button of the last food.
  - There were no console errors.

## Second review — 2026-11-05

It was confirmed that all 4 points of the first round were fixed correctly. There were no high or medium points, and all 3 low points were applied. Reviews are limited to two rounds, so no more are done.

- **Low: While waiting for the last page, focus that was moved to another field is taken away.**
  - Applied: When the last page arrives, focus moves to the status text only if it is still on the button or has fallen to `body`.
  - Test: In `foods.test.tsx`, it checks that focus moved to the search field while waiting stays as it is.
- **Low: The status text has no focus indicator.**
  - Applied: Added a `focus-visible` ring to the status text of the three screens.
- **Low: The limits item missed the case where foods can drop out because of a rename.**
  - Applied: Wrote it in the limits below.

### Second round verification

- `npm run check` (same temporary DB): passed.
  - Backend: 123 passed, 0 skipped.
  - Frontend: 266 passed in 33 files, 2 skipped.
  - Skill checks: 4 passed.
- Browser check: In the same environment, the 38 items and the keyboard check were run again. All 38 items passed. The keyboard check also passed at 390×844 and 1440×900. After the last page, focus goes to `음식 245개`, and Shift+Tab goes to `수정` of the last food.

## CI fix — 2026-11-05

- The CI `ci / verify` of the second round commit failed at `npm run knip`. This is because `foodPageSize` of `backend/src/foods.ts` was only exported and not used elsewhere. The local `npm run check` has no knip, so it was not caught.
- What was fixed: `foodPageSize` was changed to a constant inside the file.
- Verification: the local `npm run knip` passed. `npm run check` run on the same temporary DB also passed (backend 123, frontend 266 passed, 2 skipped).

## Limits and follow-ups

- When a food is saved, the list is read again from the first page. If several pages were expanded and then saved, it goes back to the first 100.
- If a food is added between pages, that food falls into the range of an earlier page and may not be seen in this list. It is seen if searched again. There is no delete API, but if a food name is changed in another tab, that food can move to an earlier page or drop out of the search term. Then the later foods shift forward by one, and one can drop out of this list. It could be solved with cursor-style paging, but it is an API design change, so it is not done in this PR.
- Dark mode, a real phone, Firefox, and Safari were not checked.
