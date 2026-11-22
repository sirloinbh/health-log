# #205 Check body measurements on the client like the server does

- Issue: [#205](https://github.com/sirloinbh/health-log/issues/205)
- Branch: `fix/205-body-client-checks`
- Parent: #189 Reliable daily cards and forms

## Purpose

The body form in `frontend/src/body.tsx` only checked that each number was readable. `70.555` kg or a systolic of `120.5` was sent and came back as a 400, and the blood-pressure pair rule and "at least one value" were not checked locally, unlike the habits, meals and combos forms. `BodySummary` showed blood pressure when only systolic was set, so a legacy row would read `120/nullmmHg`.

## Changes

- `readForm` in `frontend/src/body.tsx` returns the request body or the first reason the server would refuse it, with the server's own wording from `backend/src/body.ts`:
  - Weight, body fat and waist: greater than 0, at most 500 / 100 / 300, at most 2 decimal places (`hasTwoDecimalsAtMost`).
  - Systolic and diastolic blood pressure: whole numbers, 50–300 and 20–200.
  - The note: at most 500 characters after trimming (`charCount`, as on the server).
  - Both blood pressure values or neither; systolic higher than diastolic; at least one value (the note counts).
- `BodySummary` shows blood pressure only when both values are present.
- `frontend/src/body.test.tsx`:
  - New `test.each` with 11 named cases, one per message, each checking the message and that nothing is sent.
  - New: values at the edges the server takes (500 kg, 0.01 %, 300/200 mmHg, a 500-character note) are sent as typed.
  - New: a saved row with only systolic shows no blood pressure and no `null`.
  - "a server rejection keeps the form and the typed values" now sends a valid pair and gets a rejection the client cannot predict, since a lone systolic is now refused before sending.

## Verification

- `node ../node_modules/vitest/vitest.mjs run src/body.test.tsx` (in `frontend/`): 37 passed.
- Against the old `body.tsx`, the 12 new tests fail (11 validation cases and the summary guard); with the change they pass.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Format, lint, contract, typecheck, and build passed; backend tests 154 passed, 129 skipped (DB integration tests need `health_test`, not set locally; CI runs them); frontend 744 passed, 3 skipped; skills tests 4 passed.

## Limits

- The rules are copied from `backend/src/body.ts`, not shared; a change there must be mirrored here. There is no shared contract module for body input yet.
- No browser check at 390×844 and 1440×900: running the app locally needs the `health` database, which this worktree does not have. The only visible change is which message appears in the existing alert, and it appears without a round trip.

## Review round 1

- Approve, no blocking comments. One non-blocking nitpick (the `Partial` + cast in `readForm`) left as is; the copied rules are noted under Limits.
