# #207 Fix singular and plural wording in meal, goal and reminder text

- Issue: [#207](https://github.com/sirloinbh/health-log/issues/207)
- Branch: `fix/207-plural-wording`
- Parent: #189 Reliable daily cards and forms

## Purpose

Counts of one read as plurals: a meal entry said "1 servings", the alcohol-free goal range said "must be at least 1 days", a reminder said "Last procedures: laser" for a single procedure, `whenText` would say "In -1 days" for a past date, and the daily check rate said "Kept on 1/1 days".

## Changes

- `frontend/src/meals.tsx` (`EntryRow`) and `frontend/src/combos.tsx` (combo food rows) use `count()` from `plural.ts`: "1 serving", "1.5 servings". The combo rows had the same "1 servings" text as meals, so they are included. Only the one line in `meals.tsx` changed, as another lane is splitting that file (#210).
- `backend/src/goals.ts`: the goal range messages pluralize the unit through `amountText`; only the alcohol-free goal has a separate plural ("at least 1 day", "at most 7 days"). The kcal, g and min messages are unchanged.
- `frontend/src/reminder-text.ts`: "Last procedure: …" for one procedure; `whenText` says "1 day ago" / "3 days ago" for a negative count instead of "In -1 days", and "In 2 days" uses `count()`.
- `frontend/src/check-text.ts`: `rateText` says "Kept on 1/1 day (100%)".
- Tests:
  - `backend/test/goals.test.ts`: an alcohol-free goal of 0 is refused with a message ending "at least 1 day".
  - `frontend/src/reminders.test.tsx`: negative `whenText` values and a one-procedure detail.
  - `frontend/src/check-text.test.ts`: a one-day rate.
  - `frontend/src/meals.test.tsx`: new test "an entry of one serving says "1 serving"".
  - `frontend/src/checks.test.tsx` and `frontend/src/combos.test.tsx`: expected strings updated to the singular.

## Verification

- `tsx --test test/goals.test.ts` (in `backend/`): 9 passed.
- `vitest run` on `check-text`, `checks`, `combos`, `reminders` and `meals` tests (in `frontend/`): 128 passed.
- With the five source files reverted to `origin/main`, 1 backend test and 6 frontend tests fail; with the change they pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 155 passed, 137 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 769 passed, 3 skipped; skills tests 4 passed.

## Limits

- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The visible changes are single words in existing text lines.

## Review round 1

- Approve, no blocking comments. Other count texts in the frontend and backend were checked; none show a count of one in the plural.
