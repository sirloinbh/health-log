# #101 Count the length of food and meal text fields in characters

- Issue: [#101](https://github.com/sirloinbh/health-log/issues/101)
- Branch: `fix/101-food-meal-char-count`

## Purpose

#92 set the length rule to a count of characters (code points). This rule is the same as PostgreSQL `char_length`, so one emoji is 1 character. The text fields of foods and meals live in the same file as #38, so they were not changed then. These fields still counted with `.length` (UTF-16 units), so one emoji counted as 2 characters. A food name with 51 emoji was therefore rejected even though the limit is "100 characters or fewer".

## Change — 2026-11-08

- `backend/src/foods.ts`: the maximum length of the following fields is counted with `charCount` (`backend/src/text.ts`).
  - Food name (100), brand (50), category (30), serving unit (10)
  - Source URL (2000), search term (100)
- `backend/src/meals.ts`: the name of a food recorded directly (100) is counted the same way.
- The "enter a value" check (at least 1 character) is unchanged. An empty string is 0 in any unit.
- The screens (`foods.tsx`, `meals.tsx`) have no `maxLength` on these fields, so there is nothing to change. The database has no length constraint on these fields either.

## Verification

### Browser

A temporary database (port 5473, `health_browser`, freshly created with `npm run db:migrate`) was started with the real API (3973) and Vite (5273). Headless Chrome (debugging port 9673) was driven over CDP. Values were entered in the "Add food" dialog on the foods screen and saved.

- Food name: 99 emoji and one letter (100 characters, 199 UTF-16 units)
- Serving unit: 10 emoji (10 characters, 20 UTF-16 units)

| Case                                       | Result                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before the fix (1440×900)                  | The dialog stayed open with the message "음식 이름은 100자 이하…, 1회 제공량 단위는 10자 이하…" (food name must be 100 characters or fewer…, serving unit must be 10 characters or fewer…) |
| After the fix (320×700, 390×844, 1440×900) | The dialog closed, and the 100-character name and the 10-emoji unit were saved as entered                                                                                                   |

- In the first run the script entered a 101-character name and did not clear the default "g" in the unit field. The fixed code rejected this input with the same message. This confirmed that going over the limit is still rejected.
- There was no horizontal overflow and no console error at any of the three widths.
- After checking, the temporary database, API, Vite, and Chrome were all shut down.

### Tests

- `backend/test/text.test.ts` (1 added): when one more emoji than the limit is put into the food name, brand, category, unit, the meal food name, or the search term, the request is rejected with 400 and does not reach the database. This test also passes on the code before the fix. The old method counted an emoji as 2 characters and rejected the same input earlier. It is a test that keeps the rejection in place when the limit calculation changes.
- `backend/test/text.integration.test.ts` (1 added, date 1985-06-10, uses `testDatabaseSkip`)
  - A food filled to the limits with emoji (name 100 characters, brand 50, category 30, unit 10) is saved as entered.
  - A search term of 100 emoji answers with 200.
  - A meal recorded directly with a name of 100 emoji is saved as entered.
  - This test fails on the code before the fix and passes after it.

### Commands

- `TEST_DATABASE_URL=<temporary health_test> npm run check` with a temporary `health_test` (001 to 011 applied with `npm run db:migrate`): passed
  - Backend 196 passed, 0 skipped (including DB integration tests). Frontend 377 passed, 2 skipped. Skills 4 passed.
- `npm run knip`: passed

## Limits

- Source URLs are usually ASCII, so this change rarely alters anything for them. They were changed too so that every field uses the same rule.

## First review — 2026-11-08

A separate read-only review was run. Nothing had to be fixed, and the following were applied.

- **Confirmed:** every character limit in `foods.ts` and `meals.ts` was changed (`combos.ts` was changed in #92). The remaining `.length` uses are not limits shown to the user: the "at least 1 character" check, row and page counts, and duplicate checks. For the search term, `likePattern` only escapes special characters, and ILIKE does not assume a byte length.
- **Test that fails without a DB (to fix):** before the fix, the only failing tests were the DB integration tests. A unit test was added to `backend/test/text.test.ts` in which food and meal names filled to the limit with emoji, and a search term, pass the length rules and move on to the next step. On the code before the fix it fails even without a DB.
- **Cleanup code:** in the integration test cleanup, a name that no test creates was removed.
- **Not applied:** the remark that `foods.integration.test.ts` can get out of step if another file creates and deletes foods while it counts all foods is a property that existed before this PR. This PR adds no new kind of risk, so it was left as it is.
- After the changes, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 197, skipped 0. Frontend 377 passed, 2 skipped. Skills 4). `npm run knip`: passed.

## Second review — 2026-11-08

The first-review changes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed. The review ends here.

- **Make the test clearer (nice to fix):** the unit test added in the first review only checked "is not 400", so it also passed if the request ended with another error (500). It also did not show that the food request was actually used. The fake DB used only by this test now records the statements of both the pool and the transaction. The test now checks that the `INSERT` for the food and for the meal item ran with that name. The brand (50) and category (30) are also filled with emoji. On the code before the fix it fails without a DB.
- After the changes, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 197, skipped 0. Frontend 377 passed, 2 skipped. Skills 4). `npm run knip`: passed.
