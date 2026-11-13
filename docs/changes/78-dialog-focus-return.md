# #78 Return focus to the opening button when the food and combo dialogs close

- Issue: [#78](https://github.com/sirloinbh/health-log/issues/78)
- Branch: `fix/78-dialog-focus-return`

## Purpose

The add and edit dialogs of the food and combo screens are opened without a `DialogTrigger`. So when they close, Radix has no place to return focus to, and it goes to `<body>`. A keyboard user has to press Tab again from the top of the page.

## Decisions

It was done as the issue's to-do items said, and decided without asking the user.

- **Where to return:** The button that opened the dialog. For add it is "음식 추가" (add food) or "조합 추가" (add combo), and for edit it is the "수정" (edit) button of that card.
- **When the button has disappeared:** Send it to the page heading (`h1`). For example, if an edited food no longer matches the current search term, the card drops out when the list is read again.
  - If the button is already gone when closing, it goes to the heading right away.
  - If it existed at closing but dropped out of the list read again, focus is sent to the heading only if it fell to `<body>` after the list was redrawn. Focus that the user moved elsewhere in the meantime is not touched.
- **Why `returnFocusRef` of the shared `confirm-dialog.tsx` was not used:** These two dialogs are not confirmation dialogs, and the shared file is a centrally managed file. The same idea was made as a hook on the screen side.

## Change — 2026-11-06

- **New file** `frontend/src/return-focus.ts`: `useReturnFocus(fallback)`
  - `remember(element)`: Remembers the opening button.
  - `returnFocus()`: Called when closing. After the dialog moves focus with its own timer, it sends focus to the remembered button if it is still on screen, or to `fallback` if not.
  - An effect that runs every time the screen is redrawn: after closing, if the opening button has disappeared from the screen and focus is on `<body>`, it sends focus to `fallback`. It stops watching when the opening button has disappeared, when the user moved focus elsewhere after focus was returned, and when a new dialog is opened (changed after the first and second reviews).
- **Screens** `frontend/src/foods.tsx`, `frontend/src/combos.tsx`
  - The add and edit buttons pass the pressed button and open the dialog.
  - When closed by cancel, Esc, clicking outside, or saving, `returnFocus()` is called.
  - A `ref` and `tabIndex={-1}` were put on the food screen heading. The combo screen heading already had them because of delete.

## Verification

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`). Headless Chrome (debugging port 9673) was driven over CDP. A food "브라우저김밥" (browser gimbap) and a combo "브라우저 세트" (browser set) were put in, and three cases were checked on each screen.

| Case                                                    | Before the fix (1440×900) | After the fix (320×700, 390×844, 1440×900) |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------ |
| Add button with keyboard Enter → Esc                    | Add button                | Add button                                 |
| "수정" of a card with the mouse → cancel with the mouse | `<body>`                  | The "수정" button of that card             |
| "수정" of a card with the mouse → save with the mouse   | `<body>`                  | The "수정" button of that card             |

- The results were the same on both the food and combo screens.
- Even before the fix, opening with the keyboard and closing with Esc returned focus in Chrome. Opening and closing with the mouse went to `<body>`.
- After the fix, at all three widths there was no horizontal overflow and no console errors.
- After the first review, the case "saving makes the card drop out of the list" was checked more. A food was found with a search term, saved with a name that does not match the search term, and the list read after saving was delayed by 1.2 seconds.
  - It was the same at 320×700, 390×844, and 1440×900. While the list was being read, focus was on the "수정" button of that food, and after the card dropped out, it was on the heading "음식" (foods).
  - Right after pressing save, during the save, focus was on `<body>`. This is the original behavior where the save button becomes `disabled` and loses focus, and it is the same even after a save failure. It is outside the scope of this PR, so it was split into [#98](https://github.com/sirloinbh/health-log/issues/98).
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

In `frontend/src/foods.test.tsx` and `frontend/src/combos.test.tsx`, 4 each at first and 1 each added after the first review, making 5 each. It was confirmed that the first 8 fail on the code before the fix, and the 2 after the first review fail on the code before the first review, and all pass after the fix.

- Cancelling the add dialog returns to the add button.
- Closing the edit dialog with Esc returns to the edit button of that card. There are two cards, so it also checks that it does not go to the other card.
- Closing by saving returns to the edit button of the card that remains in the list.
- If the card drops out of the list read again after saving, it goes to the page heading, not `<body>`.
- Even if the list read finishes after the dialog closes and the card drops out, it goes to the page heading (added after the first review).

### Commands

- `TEST_DATABASE_URL= npm run check`: passed
  - Frontend 350 passed, 2 skipped (after applying the first review). Backend 89 passed, 77 DB tests skipped. Skill checks 4 passed.
  - The `TEST_DATABASE_URL` of the shell pointed to the DB of another project, so it was run with it emptied. This change changed only the frontend.
- `npm run knip`: passed

## Limits

- Other dialogs such as the meal card of the daily record screen were not looked at this time. Confirmation dialogs are already handled with `trigger` or `returnFocusRef`.
- It was not checked with a real screen reader, Firefox, or Safari.
- Focus inside the dialog during a save and after a save failure is handled in [#98](https://github.com/sirloinbh/health-log/issues/98).

## First review — 2026-11-06

A separate read-only review was run. One must-fix point came up and was fixed.

- **Checking before the list was redrawn (must fix):** If the list read after saving is later than the dialog closing, then at the moment of the check right after the read finished, the opening button was still on screen. After that, React removed the card and focus fell to `<body>`. The fake response in the test came right away and could not catch this case. The check was moved to an effect that runs after the screen is redrawn, and a slow list read test was added to both screens.
- **Heading focus indicator:** A `focus-visible` border was put on the headings of both screens so that keyboard users can see where focus went.
- **Correcting descriptions:** The delete focus comment of the combo screen now writes its relation to this hook. The test helper comment was aligned to the real behavior (put focus on the button first and then press).
- **Not applied:** The duplication of `openDialog` and `closeDialog` in the two screens is only a few lines, so it was left.

## Second review — 2026-11-06

The first round of fixes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed, and the following was applied. Reviews end here.

- **Watching that did not end:** If the dialog was closed by cancel or Esc and the opening button remained, watching continued until the page was left. If later, for another reason, focus was on `<body>` and the card dropped out by a search, focus went to the heading without notice. For example, in Safari, pressing "검색" (search) with the mouse does not give the button focus. Watching ends if the user moves focus elsewhere after focus was returned. Tests were added to `frontend/src/foods.test.tsx` (6 for food, 5 for combo), and it was confirmed that they fail on the code before the second review.
- **Test addition:** The slow list read test finishes the response after checking that the list request actually went out. This prevents it from silently doing nothing if another step comes in before the request.
- **Correcting descriptions:** The condition for ending the watching was fixed to match "Change" above.
- **Not applied:** The duplication of `openDialog` and `closeDialog` was left, for the same reason as in the first review.
- After applying, `TEST_DATABASE_URL= npm run check`: passed (frontend 351 passed, 2 skipped. Backend 89 passed, 77 DB tests skipped. Skill checks 4 passed). `npm run knip`: passed.
