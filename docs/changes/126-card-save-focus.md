# #126 Keep focus after a save fails on the daily record cards and goal settings

- Issue: [#126](https://github.com/sirloinbh/health-log/issues/126)
- Branch: `fix/126-card-save-focus`

## Purpose

On the daily record cards and goal settings, pressing Save made the save button `disabled`, so it lost focus and focus went to `<body>`. Even when the save failed and a message appeared, focus stayed on `<body>`. A keyboard user had to Tab in again from the start of the page. The food and combo dialogs had the same problem fixed in #98.

## Decisions

- **Shared button `BusyButton` (`frontend/src/busy-button.tsx`):**
  - While saving, it uses `aria-disabled` and a dimmed look instead of `disabled`. Focus stays on the button.
  - A press during saving is ignored, and for a submit button the form submission is blocked too.
  - #98 used the same code on each screen, but this time there are six places, so it was put into one component.
  - `disabled` stays only for buttons that cannot be used at all (a combo with no foods).
- **Duplicate prevention in the save functions:** pressing Enter in a field submits the form without going through the button. So each save function also does nothing while saving.
- **After a save fails:** focus stays on the button that was pressed. The reason for the failure is read out by the message inside the card (`role="alert"`). If the save was done with Enter, focus stays in that field.
- **Announcing the same failure again:** on each save, the previous message is cleared first. Even if it fails twice for the same reason, the message appears anew and is read again (same as #98). The add function of the meal card already did this.
- **After a save succeeds:** unchanged. Focus moves to the card title (the #65 way).
- **Out of scope:**
  - "검색" (Search) and "조합에서 고르기" (Pick from combos) on the meal card are reads, not saves, so they were not changed this time. These two also become `disabled` while reading.
  - The "지킴" (kept) and "잠" (sleep) buttons of the daily check are left `disabled` while saving, because focus is not on these buttons when Save is pressed.

## Change — 2026-11-08

| File                                                             | Content                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/busy-button.tsx`                                   | New shared button                                                                                                                                                                                         |
| `frontend/src/sleep.tsx`, `body.tsx`, `habits.tsx`, `checks.tsx` | Save and cancel buttons changed to `BusyButton`, and `submit` got ignoring while saving and clearing the message                                                                                          |
| `frontend/src/goals.tsx`                                         | The Save and "시작일부터 목표 끄기" (turn the goal off from the start date) buttons, and the same handling in `submit` and `save`                                                                         |
| `frontend/src/meals.tsx`                                         | "추가" (Add) of search results and recent foods, "기록" (Record) of a combo, "복사" (Copy), and "바로 기록" (Record directly) changed to `BusyButton`, and each add function ignores a press while adding |
| `frontend/src/save-focus.test.tsx`                               | Failure scenarios of six forms, form submission while saving, and `BusyButton` unit tests                                                                                                                 |
| `frontend/src/*.test.tsx`                                        | Changed the `toBeDisabled()` check during saving to an `aria-disabled` check                                                                                                                              |

## Verification

### Automated tests

- `save-focus.test.tsx` checks the same sequence for each of the six forms: sleep, body, alcohol and tobacco, daily check, meal direct record, and goal settings.
  1. Put focus on the Save button and press it.
  2. While saving, the button is `aria-disabled`, enabled, and has focus.
  3. Pressing again sends only 1 request.
  4. When it fails with 500, the message appears and focus stays on the button.
  5. Saving again makes the message disappear and then appear again with the same failure.
- Run against the code before the fix (`origin/main`), 12 of the 13 tests in this file failed. Only the button unit test passed.
- `npm run check` passed. After merging `origin/main`, 521 of 523 frontend tests passed, 2 skipped. `npm run knip` also passed.

### Browser — 2026-11-08

Checked on a temporary PostgreSQL 17 (5472, `health_test`), API 3972, Vite 5272, and headless Chrome 9672. The save request was delayed by 1.2 seconds with the DevTools protocol and then failed with 500. The results were the same at widths 1440px and 390px.

| Form                | Focus while saving                     | Focus after failure | Enter again while saving | Focus after success          |
| ------------------- | -------------------------------------- | ------------------- | ------------------------ | ---------------------------- |
| Sleep               | Save (`aria-disabled`, not `disabled`) | Save, message shown | 1 request                | Card title                   |
| Body                | Save                                   | Save                | 1 request                | Card title                   |
| Alcohol and tobacco | Save                                   | Save                | 1 request                | Card title                   |
| Daily check         | Save                                   | Save                | 1 request                | Card title                   |
| Meal direct record  | "바로 기록" (Record directly)          | "바로 기록"         | 1 request                | "바로 기록" (same as before) |
| Goal (calories)     | Save                                   | Save                | 1 request                | Card title                   |

Before the fix, the same procedure left focus on `<body>` after every failure (the #126 reproduction).

The handling that clears the message first was added after this browser check, and was checked with automated tests.

## Review changes — 2026-11-08

- The first review found no defects.
- The test for form submission while saving (Enter in a field) was widened from sleep only to all six forms.
- jsdom does not take focus away from a button that became `disabled`. So the check that actually catches the problem is "the button is enabled while saving", and this was written in a test comment.
- Left as it is: the hover style still applies to a button that is saving. It has the same look as the #98 dialog, so it was not changed.
