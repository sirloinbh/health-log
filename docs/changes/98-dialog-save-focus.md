# #98 Keep focus during a save and after a save failure in the food and combo dialogs

- Issue: [#98](https://github.com/sirloinbh/health-log/issues/98)
- Branch: `fix/98-dialog-save-focus`

## Purpose

When save is pressed in the food or combo dialog, the save button became `disabled`, lost focus, and focus went to `<body>`. Even when the save failed and a notice appeared, focus stayed on `<body>`. A keyboard user had to go back into the dialog. When the save succeeds, #78 returns focus to the button that opened it.

## Decisions

- **During a save:** The save button is set to `aria-disabled` (and `aria-busy`) instead of `disabled`. Focus stays on the button, and the button name changes to "저장 중…" (saving…). It is the same approach as the "결과 더 보기" (show more results) button already in use (`more-foods-button.tsx`). Even if pressed again during a save, or Enter is pressed in a field, no more requests are sent.
- **After a save failure:** Focus stays on the save button (now "저장" again). The failure reason is read out by the notice inside the dialog (`role="alert"`).
  - The issue said "a suitable place such as the notice or the save button". The save button, where it is easy to save again, was chosen.
  - If it was saved with Enter, focus stays on that field.
- **Cancel button:** During a save it is set to `aria-disabled` like the save button and does not close even when pressed. Safari does not move focus to a button pressed with the mouse, so focus may be on cancel when save is pressed (changed after the first review).
- **Failure notice:** Every time it saves, the previous notice is cleared first. Even if it fails twice for the same reason, the notice appears anew and is read again (added after the first review).

## Change — 2026-11-08

- `frontend/src/foods.tsx`
  - Save button: `disabled={saving}` → `aria-disabled`, `aria-busy`, a dimmed look (`aria-disabled:` class)
  - `submit`: Does nothing if a save is in progress. Clears the previous notice before saving (after the first review).
  - Cancel button: During a save it is `aria-disabled` and does not close even when pressed (after the first review).
- `frontend/src/combos.tsx`: The save button, `save`, and the cancel button were changed in the same way.

## Verification

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`). Headless Chrome (debugging port 9673) was driven over CDP. All write requests were delayed by 1 second.

- Add food: Save with a name that already exists and get 409 "이미 등록된 항목입니다" (this item is already registered).
- Edit combo: Change to the same name as another combo and get 409 "같은 이름의 조합이 이미 있습니다" (a combo with the same name already exists).
- Save was pressed with the mouse, and focus was looked at 0.4 seconds later (during the save) and after the response.

| Case                                       | During the save                     | After the failure               |
| ------------------------------------------ | ----------------------------------- | ------------------------------- |
| Before the fix (1440×900), both dialogs    | `<body>`                            | `<body>`                        |
| After the fix (320×700, 390×844, 1440×900) | The "저장 중…" button in the dialog | The "저장" button in the dialog |

- The results were the same in both dialogs, and the failure notice was also visible.
- At all three widths there was no horizontal overflow and no console errors.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.
- The browser check was done before `012_goals.sql` and `013_foods_franchise.sql` were applied to the temporary DB. 012 only creates a new goals table and 013 only inserts food data, so they are unrelated to the behavior of the two dialogs.

### Tests

In `frontend/src/foods.test.tsx` and `frontend/src/combos.test.tsx`, 1 each at first and 1 each added after the first review, making 2 each. All fail on the code before the fix and pass after.

- During a save, the same save button is "저장 중…", `aria-disabled`, and has focus.
- Even if pressed again, there is one write request.
- If the save fails, the notice appears and focus is on the "저장" button in the dialog.

### Commands

- With a temporary `health_test` (001 to 013 applied with `npm run db:migrate`), `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed
  - Backend 220 passed, 0 skipped (including DB integration tests). Frontend 397 passed, 2 skipped. Skill checks 4 passed.
- `npm run knip`: passed

## Limits

- Even during a save, the input fields can be changed. A value changed during a save does not go into the request that was sent. This is the same behavior as before (the daily check card was blocked with `readOnly` in #37).
- It was not checked with a real screen reader, Firefox, or Safari.

## First review — 2026-11-08

A separate read-only review was run. Nothing had to be fixed, and the following was applied.

- **What was confirmed:** A second save is not started anywhere (pressing again, form submit, a quick double click). If the save succeeds, the mechanism of #78 returns focus to the opening button. Closing during a save is still blocked.
- **The same failure not being read again (should fix):** The failure notice stayed during the next attempt, so when it failed again with the same content, the screen did not change and the screen reader said nothing. Since focus does not move, there was no way to know either. The notice is cleared before saving.
- **Cancel button focus:** In browsers such as Safari that do not give focus to a pressed button, the cancel button that became disabled during a save could drop focus. Cancel was also changed to `aria-disabled`.
- **Test additions**
  - A form submit during a save (Enter in a field) does not send more requests.
  - The same failure twice comes out as a new notice each time (both screens).
  - Pressing cancel during a save does not close (an existing test was changed to be based on `aria-disabled`).
  - 3 fail on the code before the review.
- **Not applied:** The `aria-busy` of the button was matched to "결과 더 보기", and the background changing when the mouse is hovered during a save is only a matter of look, so it was left.
- After applying, `npm run check`: passed (frontend 399 passed, 2 skipped. Backend 117 passed, 98 DB integration tests skipped. Skill checks 4). This time it was run without a temporary DB, and `testDatabaseSkip` skipped a DB that is not `health_test`, so the DB of another project was not touched. What was applied changes only the screen. `npm run knip`: passed.

## Second review — 2026-11-08

The first round of fixes and the whole diff were reviewed again by a separate read-only review. There was nothing that must be fixed. Reviews end here.

- **What was confirmed**
  - The input validation notice appears and returns before `clear()`, so it is not lost.
  - The notice is cleared and then comes back in as a new element and is read.
  - Cancel closes only through the blocked `onClick`, not through Radix's close element. The X, Esc, and clicking outside are still blocked during a save.
- **Test addition:** The combo test only checked that cancel during a save has `aria-disabled`. Now it checks that the dialog stays even when actually pressed.
- **Docs:** Wrote the cancel button and the notice clearing in "Change" and fixed the number of tests.
- **Not applied:** The look where the background changes when the mouse is hovered during a save is left as it is. If `pointer-events-none` were used, the click-blocking handling would no longer be reached.
- After applying, `npm run check`: passed (frontend 399 passed, 2 skipped. Backend was run without a temporary DB, so DB integration tests were skipped. Skill checks 4). `npm run knip`: passed.
