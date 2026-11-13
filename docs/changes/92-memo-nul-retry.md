# #92 Align the memo length unit, the NUL character, and late reloads of the daily record cards

- Issue: [#92](https://github.com/sirloinbh/health-log/issues/92)
- Branch: `fix/92-memo-nul-retry`

## Purpose

Three problems that span several daily record cards came up in the review of PR #91.

- The screen, server, and DB count the memo length in different units.
- If the NUL character (U+0000) gets into a memo, it becomes 500 instead of 400.
- A slow "다시 시도" (retry) response can overwrite a new response.

## Decisions

Decided without asking the user. The same content was left as an issue comment.

- **Length criterion:** Counted in characters (Unicode code points). It is the same unit as PostgreSQL `char_length`, so one emoji is 1 character. Both the screen and the server use the same method with `charCount`.
- **NUL character:** It is not blocked field by field. The body and query string of every request are rejected in one place (`rejectNul`) with 400 and a Korean message. Even if a new text field is created, it cannot be missed.
- **Late reload:** No mechanism was added. As in "What was checked" below, on the current screen a second reload cannot be started, so an old response cannot come later than a new one. Instead, screen tests that protect this property were put in.

## What was checked

- **zod `.max()` already counts in characters.** In zod 4, `z.string().max(2)` accepts 2 emoji (4 UTF-16 units). So the server-side length of the daily check and body memos was right from the start. The statement in the issue that "zod `.max` is in UTF-16 units" was not true in this version.
- **The places that actually disagreed were two.**
  - `maxLength={200}` of the daily check memo field: the browser counts in UTF-16 units, so pasting 201 emoji left only 100 in the field and it was saved as it was (confirmed in the browser).
  - The fields the server counted directly with `.length`: the combo name (the DB has `char_length` 50) was rejected from 26 emoji.
- **Why reloads do not overlap**
  - When "다시 시도" is pressed, `load()` clears the notice before the first `await`, and the button disappears in the same render. Even if pressed twice, there is one request.
  - While reading again after a delete, "불러오는 중" is shown instead of the form, so a save cannot be made in between.
  - A card that came back after moving the date reads after the saves in progress finish, by the mechanism of #71.
  - "변화 다시 불러오기" (reload change) of the body card has always reflected only the latest request.

## Change — 2026-11-06

- **New file** `backend/src/text.ts`
  - `charCount(value)`: the character count. `[...value].length`.
  - `rejectNul`: If a NUL is anywhere in the request body (including keys) or the query string, 400 "쓸 수 없는 문자(NUL)가 들어 있습니다" (a character that cannot be used (NUL) is included).
- **API** `backend/src/app.ts`: `rejectNul` is attached right after the JSON parsing.
- **API** `backend/src/checks.ts`, `body.ts`, `combos.ts`
  - The daily check memo (200 characters), the body memo (500 characters), and the combo name (50 characters) are counted with `charCount`.
  - The memo-only NUL check of the daily check was moved to `rejectNul` and removed.
- **Screen** `frontend/src/checks.tsx`, `frontend/src/check-text.ts`
  - Removed `maxLength` of the memo field. When saving, it checks with `charCount` whether it exceeds 200 characters.
  - `charCount` was put in `check-text.ts`.

## Verification

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`). Headless Chrome (debugging port 9673) was driven over CDP. 201 emoji were put into the daily check memo field at once (`Input.insertText`, the same as pasting) and saved.

| Step                                         | Before the fix (1440×900)          | After the fix (320×700, 390×844, 1440×900)                                     |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Characters in the field after putting in 201 | 100 (the rest silently disappears) | 201                                                                            |
| Save                                         | 100 saved as they are              | "메모는 200자 이하로 입력해 주세요" (enter the memo as 200 characters or less) |
| Remove one and save                          | (not applicable)                   | 200 saved as they are                                                          |

- After the fix, at all three widths there was no horizontal overflow and no console errors.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

- `backend/test/text.test.ts` (3 new, 4 after the first review)
  - One emoji is counted as 1 character.
  - A NUL anywhere in the body and daily check memos, in food, combo, and meal names, in the alcohol type, in a key of the body, and in the search query (`?q=%00`) is rejected with 400 and does not reach the DB.
  - A daily check memo of 201 emoji, a body memo of 501, and a combo name of 51 are rejected.
- `backend/test/text.integration.test.ts` (2 new, date 1985-06-10, using `testDatabaseSkip`)
  - A daily check memo of 200 emoji and a body memo of 500 are saved as they are.
  - A combo name of 50 emoji is saved as it is.
- On the code before the fix, the NUL tests and the combo name 50 test failed. The memo tests passed even before the fix, as in "What was checked" above.
- `frontend/src/checks.test.tsx`
  - The memo field has no `maxLength` (an existing test was changed).
  - 201 emoji are rejected before sending, and 200 are sent as they are.
- `frontend/src/check-text.test.ts`: 200 emoji are counted as 200 characters.
- `frontend/src/body.test.tsx`, `habits.test.tsx`, `checks.test.tsx`: Even if "다시 시도" is pressed twice, only one request goes out.

### Commands

- `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed
  - Frontend 360 passed, 2 skipped. Backend 180 passed, 0 skipped (including DB integration tests). Skill checks 4 passed.
- `npm run knip`: passed

## Limits

- The text fields of foods and meals (food name, brand, category, unit, source URL, search term, meal food name) are still counted with `.length` (UTF-16). The DB has no length constraint, so what is rejected is only the case of many emoji, and where it disagrees with the screen notice, it is in the stricter direction. `foods.ts` and `meals.ts` overlap with the #38 (junk food count) work, so they were not changed this time. After #38 is done, they are aligned with the same `charCount` in [#101](https://github.com/sirloinbh/health-log/issues/101).
- The body memo field has no length notice on the screen. If it hits the server limit (500 characters), the server message appears.

## First review — 2026-11-08

After merging `origin/main` (including #38), a separate read-only review was run. There were no merge conflicts, and #38 added no text fields (the scope of #101 stays as it is), so it did not overlap with this PR. Nothing had to be fixed, and the following was applied.

- **A deeply nested body became 500 (to fix):** `hasNul` called itself at every nesting level, so with a 5,000-level array (about 10 KB) within the size limit, the call stack overflowed and it gave 500. `rejectNul` runs before the request rate limit, so it could also be sent repeatedly. Instead of recursion, it was changed to walk once with an explicit stack, and long arrays are also pushed one by one without being expanded. Tests were added that a 10,000-level array and a NUL at the end of an array of 60,000 strings are rejected with 400. On the code before the review, this test fails with 500.
- **Sleep card test:** A test that even pressing "다시 시도" twice gives one request was also added to the sleep card (the other three cards had it from the start).
- **Added explanations**
  - Values in the path (`/api/foods/%00`, a date) are not looked at by `rejectNul`. `parseId` and `parseDate` already reject them with 400.
  - `rejectNul` runs before the request rate limit. It does not reach the DB and works only in proportion to the body size, so it was left.
- **Not applied:** A live character count display in the daily check memo field is optional, so it was left. For now it tells the user when saving. `charCount` exists separately in the frontend and backend because the packages are different.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 190, 0 skipped. Frontend 370 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.

## Second review — 2026-11-08

The first round of fixes and the whole diff were reviewed again by a separate read-only review. There was nothing that must be fixed and nothing that should be fixed. Reviews end here.

- What was confirmed: even the worst bodies just under 256kb (an array of 130,000 levels, an object with 30,000 keys, and so on) finish in about 30ms, in proportion to the body size. A NUL in a `__proto__` key and in a prototype-less object of the query is also caught.
- Three small points were applied.
  - The four "press retry twice" tests wait for the last response to the end. The card does not change after the test ends.
  - It is checked that a 10,000-level body without NUL passes `rejectNul` and is answered by the path's rule (memo format).
  - Fixed the number of tests above.
