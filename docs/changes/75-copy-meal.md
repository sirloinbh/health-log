# #75 Copy a meal from another day as it is

- Issue: [#75](https://github.com/sirloinbh/health-log/issues/75)
- Branch: `feat/75-copy-meal`

## Purpose

When you often eat the same breakfast, copy a meal of another day in one step ("same as yesterday") so that you do not pick the foods one by one again.

## Rules we set

These are rules that were not in the requirements. We recorded them in the [#75 comment](https://github.com/sirloinbh/health-log/issues/75#issuecomment-6621218252) and went on without user confirmation. If you want them different, we fix them in a follow-up issue.

- **What:** copy the same meal of the chosen date to the same meal of the day you are viewing. The meal is the one chosen on the meal card.
- **Default date:** the day before. You can also pick another date.
- **Values:** copy the values recorded in the source as they are. We do not read the current values of the food store again. The food link (`food_id`) is also kept as it is.
- **Existing records:** not overwritten; the copy is added after them.
- **Atomicity:** inserted in one statement, so either everything is copied or nothing is.
- **Rejections:** the same date is 400, and if there is no record for that meal on the chosen day, 404 "복사할 기록이 없습니다" ("There is no record to copy").

## Changes: 2026-11-04

- **API** `backend/src/meals.ts`: added `POST /api/meals/:date/copy`.
  - The body is `{ "from": "YYYY-MM-DD", "meal": "lunch" }`. The response is the whole day (`entries`, `totals`), like the other record APIs.
  - It is one `INSERT … SELECT … ORDER BY id` statement from `meal_entries` to `meal_entries`.
  - `from` is checked with the same rule as the date in the path (`isRealDate`).
  - There is no DB change.
- **Screen** `frontend/src/meals.tsx`: added "Copy from another day" (in Korean on the screen) under the combos of the meal card.
  - It has a date input (default the day before) and a "Copy <meal>" button. The button name follows the chosen meal.
  - If the date is empty or the same day, nothing is sent and a notice is shown.
  - A 404 says which day and which meal, as in "There is no record to copy to breakfast on Tuesday, 3 November 2026" (in Korean on the screen).
  - For other errors, the server text is shown next to the copy button.
  - While recording, it is blocked like the other record buttons. When you leave the day, the existing handling of `add()` is used as it is.

## Verification

### Tests

- `backend/test/meal-copy.integration.test.ts`: 4 real-DB tests. The three done criteria of the issue are here.
  - "The nutrition values of the source as they are": after recording the source, we change the food values and copy. We check that the copy has the same values as the source (185.18 kcal, protein 3.75), that the order and the totals are right, that another meal is not copied, and that it is added after the records that were already there.
  - "If part fails, everything is cancelled": we briefly set a trigger that makes only the copy of the second record fail, and check that nothing is left on that day.
  - "The copy stays even if the source is deleted": after deleting both the source record and the food, we check that the copy stays with the same values. Only the food link is emptied.
  - Besides, if there is no record for that meal, it is 404 and nothing is created.
- `backend/test/meals.test.ts`: 2 added.
  - It rejects a meal, a missing date, a date that does not exist, a date in another format, the same date, and a wrong date in the path before it reaches the DB.
  - If the response cannot be read, the copy is rolled back, so retrying does not insert it twice.
- `frontend/src/meals.test.tsx`: 7 added. It checks the default day before and the request body, picking another date, the rejection of an empty date and of the same day (2 cases), the 404 notice, the notice for another failure, and the button lock and the description link while copying.

### Run results

- `npm test -w backend`: 67 of 117 passed, 50 skipped. There is no PostgreSQL on this PC, so we skipped the DB integration tests (including the 4 new ones). They are not counted as a success. The CI result is written in the PR.
- `npm test -w frontend`: 32 files, 240 passed, 2 skipped (the dark-only app condition, unrelated).
- `npm run check`: passed. Format, lint, type check, build, and 4 skill checks passed.

### Browser check

We drove headless Chrome with CDP. There is no PostgreSQL, so the API used a memory stub. The copy and transaction behavior of the server is covered by the DB integration tests above.

| Item                                                                                 | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------------ | ------- | -------- |
| After recording foods at lunch of the day before, the default date is the day before | pass    | pass     |
| Copying an empty breakfast shows a notice that names the date and the meal           | pass    | pass     |
| The lunch copy request `{"from":day before,"meal":"lunch"}`, shown at lunch          | pass    | pass     |
| The earlier notice is cleared after a copy                                           | pass    | pass     |
| Horizontal overflow, console errors                                                  | none    | none     |

## First review applied: 2026-11-04

There was no required fix, and we applied two optional items.

- **Description link:** so that a screen reader does not read only the button name ("Copy lunch") and miss the description "it is added after the existing records", we linked the description paragraph to the button with `aria-describedby`.
- **Lock-while-copying test:** added a test that checks that until the copy request finishes the button is blocked and gets `aria-busy`, so pressing twice sends only once.

## Limits and follow-up

- We do not copy to a different meal (for example yesterday lunch to today dinner). Only the same meal is copied.
- Before copying, it does not preview what will be copied. A record that went in wrongly after the copy is deleted one by one.
- There is no copy of a whole day. You copy each meal.
- We did not check dark mode, a real phone, Firefox, Safari, or the screen connected to a real DB.
