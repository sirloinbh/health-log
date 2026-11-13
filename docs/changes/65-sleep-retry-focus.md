# #65 Move focus to the card title after retrying on the sleep card

- Issue: [#65](https://github.com/sirloinbh/health-log/issues/65)
- Branch: `fix/65-sleep-retry-focus`

## Purpose

When loading fails on the sleep card, a "다시 시도" ("Try again") button appears. When you press the button, the button disappears together with the notice, and the keyboard focus falls to `<body>`. A keyboard user has to press Tab again from the very top of the page.

## What we decided

We followed the tasks in the issue and decided without user confirmation. We left the same content in an issue comment.

- **Method:** the same as the meal card (#30, PR #64): when "다시 시도" is pressed, move focus to the card title. We use the title focus mechanism that the cards already have (`setMoveFocus`).
- **Scope:** the body, alcohol and cigarette, and daily check cards also have a "다시 시도" button of the same structure, and we confirmed the same problem in the browser, so we fixed them together. The issue named only the sleep card.

## Changes: 2026-11-06

- `frontend/src/sleep.tsx`, `body.tsx`, `habits.tsx`, `checks.tsx`: when "다시 시도" is pressed, it loads again and moves focus to the card title.

## Verification

### Browser

We started the real API (3973) and Vite (5273) on a temporary DB (port 5473, `health_browser`). We drove headless Chrome (debugging port 9673) with CDP.

1. Open the daily record of 2026-04-01. At this point the first load of the four cards returns 500 through CDP.
2. Press "다시 시도" of each card with the keyboard (focus, then Enter) and with the mouse.
3. After 0.6 seconds, look at where focus is.

| Case                                                           | Sleep      | Body       | Alcohol and cigarettes | Daily check |
| -------------------------------------------------------------- | ---------- | ---------- | ---------------------- | ----------- |
| Before the fix (1440×900), keyboard and mouse                  | `<body>`   | `<body>`   | `<body>`               | `<body>`    |
| After the fix (320×700, 390×844, 1440×900), keyboard and mouse | Card title | Card title | Card title             | Card title  |

- We actually confirmed the focus loss that the issue had inferred from the code.
- After the fix there was no horizontal overflow and no console error at all three widths.
- After the check, we turned off the temporary DB, the API, Vite, and Chrome.

### Tests

We added one test "focus goes to the card title after retry" to each of `frontend/src/sleep.test.tsx`, `body.test.tsx`, `habits.test.tsx`, and `checks.test.tsx`. They have the same shape as the same test on the meal card. We confirmed that all 4 fail on the code before the fix and pass after it.

### Commands

- `TEST_DATABASE_URL= npm run check`: passed
  - 355 frontend tests passed, 2 skipped. 93 backend tests passed, 77 DB tests skipped. 4 skill checks passed.
  - `TEST_DATABASE_URL` in the shell pointed to the DB of another project, so we ran it with it emptied. It is a change in the frontend only.
- `npm run knip`: passed

## Limits

- "Load the changes again" on the body card already moves focus in the same way, so it is unrelated to this change.
- We did not check with a real screen reader, Firefox, or Safari.

## First review: 2026-11-06

We ran a separate read-only review. There was nothing to fix, so we end the review here.

- What was confirmed: on all four cards, `load()` clears the notice before the first `await`, so the button disappears in the same render as the click, and the title focus comes after that. If it fails again, the notice is read again as `role="alert"`, and the button appears at the Tab position after the title. It is the same behavior as the meal card.
- Optional items not applied: a test for two failures in a row, a check that the body card asks again for the change by period after a retry, and writing the four cards in the document title. They are existing behavior or already written in "Scope", so we left them.
