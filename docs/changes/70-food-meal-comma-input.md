# #70 Comma input in the number fields of foods and meals

- Issue: [#70](https://github.com/sirloinbh/health-log/issues/70)
- Branch: `fix/70-food-meal-comma-input`

## Purpose

A `type="number"` field in Chrome removes the comma at the input stage. `49,5` becomes `495`, and `badInput` is not turned on either, so a value 10 times too large is saved with no warning. We fixed the body screen in #44, and now fix the food and meal screens, which have the same structure.

## Changes: 2026-11-04

- **Food screen** `frontend/src/foods.tsx`: changed the serving and the 6 nutrition fields to text inputs (`inputMode="decimal"`). Before saving, they are read with `parseAmount`, and if one cannot be read, the notice names that field and nothing is sent. We removed the `badInput` check that did not work.
- **Meal screen** `frontend/src/meals.tsx`: changed the quantity and the calories per serving in the same way. The notices for an empty value, 0, and a third decimal place stay the same. A value that cannot be read, such as one with a comma, gets the notice `수량: 숫자만 입력해 주세요…` ("Quantity: enter numbers only…").
- **Notice text** `frontend/src/number-input.ts`: grouped it as `unreadableAmount`, so that the body, food, and meal screens use the same text. The text on the body screen did not change.

## Verification

- Tests
  - `frontend/src/foods.test.tsx`: removed the test that forced `validity` to be overwritten. For each of the 7 fields, it checks that `49,5` stays in the field as it is, a notice appears, and there is no POST. It also checks that `49.5` is sent as a number.
  - `frontend/src/meals.test.tsx`: added cases where `49,5` and `1.5.1` in the quantity are rejected. It also checks the rejection of a comma in the quantity and the calories per serving, and the sending of `49.5` kcal for `0.5` servings.
  - If we put the code back to before the fix and run the same tests, 15 fail, and after the fix all pass.
- `npm test -w frontend`: 30 files, 208 passed, 2 skipped. The 2 skipped are condition tests for the dark-only app and unrelated to this change.
- `npm run check`: passed. Format, lint, type check, and build passed. Backend: 60 of 97 passed, 37 skipped (the DB integration tests were skipped because there is no `TEST_DATABASE_URL`; they are not counted as a success). Frontend: 208 passed, 2 skipped. 4 skill checks passed.
  - In the first run, `the main menu opens the day the server counts as today` in `daily.test.tsx`, unrelated to this change, failed once. When we ran it 3 times separately, all passed, and the full check we ran again also passed. It seems to fail by a timeout under load.

### Browser check

We drove headless Chrome with CDP. We did not set the value directly; we pressed the keys one by one. There is no PostgreSQL on this PC, so the API used a temporary stub instead of the real server. The stub records the body of the write requests it receives. This change is a screen check before the request is sent, so a stub is enough to verify it. The server validation did not change.

**Reproduction before the fix:** in `foods.tsx` and `meals.tsx` of `origin/main`, pressing `49,5` in all 9 fields made the field value `495` (390×844, 1440×900).

**After the fix:**

| Item                                                                            | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------- | ------- | -------- |
| `49,5` in each of the 7 food fields: the value stays, a notice, no request      | pass    | pass     |
| `49.5` in the food serving is saved as `servingSize: 49.5`                      | pass    | pass     |
| `49,5` in the meal quantity and calories per serving: the value stays, a notice | pass    | pass     |
| Recording `1.5` servings and `49.5` kcal in a meal sends the same numbers       | pass    | pass     |
| Horizontal overflow, console errors                                             | none    | none     |

## First review: 2026-11-04

The independent review had no high or medium findings, and gave 1 low finding.

- **`.5` input:** the old number field accepted `.5` as 0.5, but now there is no leading digit, so it is rejected and explained as "write the decimal point as a period" (in Korean). It is not clear why for someone who did use a period. It is the intended rule of `parseAmount`, and the body screen has been the same since #44. If we change the rule, all three screens change together, so in this PR we only wrote it in the limits below.

## Second review: 2026-11-04

Nothing to fix. We checked that the first finding was recorded as above, and looked again at the final whole change. The review is at most 2 rounds, so we do no more.

- The order of the checks on the meal screen is the quantity, the name, and the calories. The error appears in the notice area next to the button that was pressed, and the earlier notice is cleared.
- If a save is rejected, no request is sent, and the input values and the button state are not left behind.
- Opening an existing food and saving it as it is is not rejected.
- The notice text on the body screen did not change.
- Note: the keyboards of some foreign-language phones may show a comma with `inputMode="decimal"`. Even so, it is not saved as 10 times the value, and a notice appears.

## Limits and follow-up

- If you enter a negative number, you get the number format notice, not a range error. The same as the body screen.
- A decimal without the leading 0, such as `.5`, is rejected, and the notice text does not say that reason (you must write `0.5`). The same as the body screen.
- We did not check dark mode, a real phone, Firefox, or Safari.
- We could not do a browser check connected to a real DB. The DB integration tests run in CI.
