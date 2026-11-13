# #46 Save frequently eaten combos and record them at once

- Issue: [#46](https://github.com/sirloinbh/health-log/issues/46)
- Branch: `feat/46-meal-combos`

## Purpose

So that foods eaten together do not have to be picked one by one each time, save them as a combo and record them at once.

## Scope adjustment

The original issue had three to-do items: combos, copying a meal from another day, and showing recently eaten foods first. Their purposes differ, so they are hard to review in one PR, and they were split.

- Copying a meal from another day: [#75](https://github.com/sirloinbh/health-log/issues/75)
- Showing recently eaten foods first: [#76](https://github.com/sirloinbh/health-log/issues/76)

## Rules decided

These are rules that were not in the requirements. They were recorded in the [#46 comment](https://github.com/sirloinbh/health-log/issues/46#issuecomment-6620682075) and applied without asking the user. If something different is wanted, it is fixed in a follow-up issue.

- **Items:** Only foods from the food store are put in. Foods entered directly are not put in.
- **Size:** 1 to 20 per combo. The same food is put in only once.
- **Quantity:** The same as meal records. More than 0 and up to 999, to two decimal places.
- **Name:** 1 to 50 characters and cannot overlap with another combo. It is case-insensitive.
- **Recording:**
  - All the foods of the combo are recorded in one chosen meal.
  - Each food copies its nutrition facts at the moment of recording. Even if the combo is edited, meals already recorded stay as they are.
  - If any one fails, nothing is recorded.
- **When a food disappears:** The app has no feature to delete a food. If a food is deleted in the DB, it also drops out of the combo (`ON DELETE CASCADE`). A combo that has lost all its foods cannot be recorded, and it tells the user to edit it.

## Change — 2026-11-04

- **DB** `database/migrations/007_meal_combos.sql`:
  - Creates the `meal_combos` and `meal_combo_items` tables.
  - Names are kept from overlapping with a unique index on `lower(name)`.
  - The DB also enforces the item order (`position` 1 to 20), no duplicate of the same food, and the quantity range.
- **API** `backend/src/combos.ts`:
  - `GET /api/combos`: Returns the foods and the calorie total for each combo. The total is calculated with the DB's `NUMERIC`, so it equals the value that will be added when recorded.
  - `POST /api/combos`, `PUT /api/combos/:id`: Saves the name and the food list in one transaction. If a food that does not exist is mixed in, nothing is saved (400).
  - The same name is refused with 409.
  - `DELETE /api/combos/:id`: Answers 204.
- **Record API** `backend/src/meals.ts`:
  - Added `POST /api/meals/:date/combos/:id` (`{ meal }`). The foods of the combo are inserted with a single `INSERT … SELECT` statement, so either all go in or none.
  - A combo that does not exist is 404, and a combo with no foods is 400.
  - The quantity rule (`servingsInput`) is shared by meal records and combos.
- **Screen**
  - `frontend/src/combos.tsx`: Added a "조합" (Combos) screen to the menu. It has a list, an add and edit dialog (food search, add and remove, quantity), and a delete confirmation. The quantity is read the same way as #70, which blocks comma input.
  - `frontend/src/meals.tsx`: Added "조합에서 고르기" (choose from a combo) to the meal card. It records to the chosen meal, and errors are shown next to the combo button.
    - The combo list is loaded only when the button is pressed. Requests do not increase when a day is opened.
  - `frontend/src/combo-text.ts`: The combo type and the summary text ("음식 2개 · 520kcal" = 2 foods · 520kcal) are shared by the two screens.
  - `frontend/src/number-input.ts`: The two-decimal-place check was moved so that the two screens share it.

## Checks

### Tests

- `backend/test/combos.test.ts`: 5 input rejection tests. They check that the name, the number of foods, duplicates, the quantity, and a wrong ID, date, or meal are rejected before reaching the DB.
- `backend/test/combos.integration.test.ts`: 9 real DB tests. Two of the issue's completion criteria are here.
  - "If part fails, everything is cancelled": a trigger that makes only the insert of the second food fail is set for a while in the test, and it checks that nothing remains in that meal.
  - "Even if the combo is edited later, the record stays": it checks that the record is the same after the combo is changed, the food values are changed, and the combo is deleted.
  - It also checks the order and calorie total, a duplicate name, a food that does not exist, a combo that does not exist, a combo that lost all its foods, and a failed edit.
- `frontend/src/combos.test.tsx`: 17 tests for the combo screen. They check the menu, list text, the add flow and the request body, 6 kinds of input rejection, edit and remove, the 20 limit, a server refusal, delete and focus after delete, removing the card before the re-read, a combo that was already deleted, and a load failure.
- `frontend/src/meals.test.tsx`: 5 tests for the meal card. They check loading only on press, recording to the chosen meal, the notice for no combo, an empty combo, a load failure, and a server refusal.
- `frontend/src/combo-text.test.ts`, `frontend/src/number-input.test.ts`: the summary text and the decimal place check.

### Run results

- `npm test -w backend`: 65 of 111 passed, 46 skipped. This PC has no PostgreSQL, so there is no `TEST_DATABASE_URL`, and the DB integration tests (including the 9 new ones) were skipped. They are not counted as success. CI applies the migrations to `health_test` and runs the integration tests. The result is written in the PR.
- `npm test -w frontend`: 32 files, 233 passed, 2 skipped (a dark-only app condition, unrelated).
- `npm run check`: passed. Formatting, lint, type check, build, and 4 skill checks passed. The test counts are as above.
- `npm run knip`: On this PC it could not run because the native module of `oxc-resolver` could not be loaded (an environment problem). CI checks it with `knip-strict`.

### Browser check

Headless Chrome was driven over CDP. As in #70, there is no PostgreSQL, so the API used a temporary stub that keeps combos and records in memory. The server's saving and transaction behavior is covered by the DB integration tests above, and here the screen flow and the requests sent are checked.

| Item                                                                                | 390×844 | 1440×900 |
| ----------------------------------------------------------------------------------- | ------- | -------- |
| Empty list notice                                                                   | Pass    | -        |
| Search and put in 2 foods, a food already put in cannot be put in again             | Pass    | Pass     |
| Saving a quantity `1,5` is refused with a notice, no request                        | Pass    | Pass     |
| The request body saved as `1.5`, the card "음식 2개 · 520kcal"                      | Pass    | Pass     |
| Adding with the same name gives the 409 notice                                      | Pass    | Pass     |
| Removing a food in an edit, the card updates                                        | Pass    | Pass     |
| Choosing lunch on the meal card and recording the combo, request `{"meal":"lunch"}` | Pass    | Pass     |
| The record stays even after the combo is deleted                                    | Pass    | Pass     |
| Horizontal overflow of the screen and dialog, console errors                        | None    | None     |

A long food name wrapped inside the 390px dialog and did not push out the quantity field.

## First review applied — 2026-11-04

- **Focus after delete:** When a combo was deleted, the card and button disappeared and keyboard focus went to `<body>`. Now it moves to the page heading "조합". This is the same approach as the meal card of the daily record. It was confirmed that this test fails on the code before the fix.
- **Quantity over 999:** The server answered only "수량이 너무 큽니다" (the quantity is too large), so it was not clear which food. Now, before sending, it tells the user "<food> 수량은 999 이하로 입력해 주세요" (enter the quantity of <food> as 999 or less).
- **Split off:** The problem that focus goes to `<body>` when the add and edit dialog is closed has the same structure as the food screen. It was split into [#78](https://github.com/sirloinbh/health-log/issues/78) so that both screens are fixed together.

## Second review applied — 2026-11-04

- **Focus on a slow re-read:** The first fix was right only when the response that reads the list again was fast.
  - Cause: If the re-read is later than the dialog close animation (200ms), the dialog returns focus to the "삭제" (delete) button of the card that was deleted. If the list is updated after that, the button disappears and focus goes to `<body>` again.
  - Fix: When the delete finishes, the card is removed from the screen right away without waiting for the re-read.
  - Test: It checks that the card disappears first while the re-read is held. It was confirmed that this test fails on the code before the fix.
  - Limit: jsdom has no close animation, so the process itself of focus returning to the button and then disappearing cannot be reproduced.

## Limits and follow-ups

- There is no feature to save "this meal as a combo" directly from a meal record. It is created on the combo screen.
- When recording a combo, there is no quantity multiple (for example 2 servings of the combo). It is recorded with the saved quantities.
- Dark mode, a real phone, Firefox, and Safari were not checked.
- The screen connected to a real DB was not checked.
