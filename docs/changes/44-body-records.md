# #44 Weight and body records

- Issue: [#44](https://github.com/sirloinbh/health-log/issues/44)
- Branch: `feat/44-body-records`

## Purpose

To see whether the calorie and sleep records lead to a real change in the body, we need weight records. Record body values by date and see the change by period.

## Changes: 2026-11-02

- **DB:** `database/migrations/006_body_records.sql`. One row per date, and the primary key is `record_date`. A value that was not measured is `NULL`, not 0. The DB also enforces the ranges and the blood pressure rule.
- **API:** `backend/src/body.ts`. `GET /api/body/:date`, `PUT` (overwrites the same day), `DELETE` (404 if there is none), `GET /api/body?from&to` (366 days or less). The request rate limit works like the other APIs.
- **Screen:** `frontend/src/body.tsx`. Added a body card to the daily record. It shows the entry, the summary, edit, delete, and a table of changes by period. If loading fails, the entry form is hidden, so we do not overwrite a record we could not see. Even if the change table cannot be loaded, you can still enter values.
- **Change calculation:** `frontend/src/body-change.ts`. The difference between the first and the last measurement within 7, 30, and 90 days ending on the date you are viewing. If there are fewer than 2 measurements, it shows `not enough records` (`기록 부족` on the screen).

## What we decided

These are rules that were not in the issue. We recorded them in a #44 comment and went on without user confirmation. If the user says to change them, we fix them in a follow-up issue.

- **One per day:** saving again for the same date overwrites everything.
- **Ranges:** weight above 0 and up to 500 kg, body fat above 0 and up to 100%, waist above 0 and up to 300 cm, systolic 50 to 300, and diastolic 20 to 200 mmHg. These are standards to filter out abnormal values, not standards for a health judgement.
- **Numbers:** weight, body fat, and waist go to two decimal places, and blood pressure is an integer.
- **Blood pressure:** enter systolic and diastolic together, and systolic must be higher than diastolic.
- **A day with only a memo:** can be saved. It is rejected if there is no value at all.
- **Future dates:** not blocked. The range is decided in #50.
- **Change table:** the base day is the date you are viewing, not today. Blood pressure is not in the change table.

## Verification

- Tests added: `backend/test/body.test.ts` (input rejection), `backend/test/body.integration.test.ts` (real DB), `frontend/src/body.test.tsx` (screen), `frontend/src/body-change.test.ts` (change calculation), `frontend/src/number-input.test.ts` (number parsing)
- Migrations: applied everything twice to a temporary PostgreSQL (port 55902, `health_test`) with no errors. We did not touch the existing local DB.
- `npm run check` (temporary `health_test`): the result is written in the PR.

### Browser check

Headless Chrome, viewports 390×844 and 1440×900. The API ran the real server code connected to a temporary DB on port 3993.

| Item                                                                               | 390×844 | 1440×900 |
| ---------------------------------------------------------------------------------- | ------- | -------- |
| Enter only weight and save                                                         | pass    | pass     |
| The change table after saving on another day (−1.5 kg)                             | pass    | pass     |
| A Korean error and the input kept for a negative value or one blood pressure value | pass    | pass     |
| The existing values on edit, cancel                                                | pass    | pass     |
| The form comes back after delete confirmation, the change table refreshes          | pass    | pass     |
| Horizontal overflow, console errors                                                | none    | none     |

## First review fixes: 2026-11-02

Of the 8 findings of the independent review, we fixed 7 in this PR, and split the other screens with the same problem into [#70](https://github.com/sirloinbh/health-log/issues/70). Adding `body_records` to the restore check list is done in PR #68 after this PR is merged.

- **Comma input:** a `type="number"` field in Chrome removes the comma at the input stage. `49,5` became `495`, and `badInput` was not turned on either, so 495 kg was saved with no warning. The `badInput` guard we first added did not work in this case, and the test forced a value in, so it did not prove the wrong assumption. We changed to a text input and strict parsing (`frontend/src/number-input.ts`). A comma, `70.5.1`, `1e5`, and a negative number are not saved and are explained. In real Chrome with key input, we confirmed that `49,5` stays visible in the field and is not saved.
- **Change table retry:** if only the change table fails, a dedicated retry button appears, and if the record also fails, a single `다시 시도` ("Try again") button reads both again. The wording also says which side failed.
- **Measurement span:** so that a change within a day is not read as "−2 kg over 90 days", each cell shows the compared dates (`3/9~3/10`) as text. Before, they showed only on mouse hover.
- **Tests:** checks the `not enough records` display, a slow response order, a save failure after moving the date, the retry, and the DB constraint of the blood pressure range.
- **Docs:** fixed a wrong item in the next work document, and added the future date rule to the #44 comment.

## Second review fixes: 2026-11-02

We fixed 5 of the 7 findings and split 2 into [#71](https://github.com/sirloinbh/health-log/issues/71). The review is at most 2 rounds, so there is no third review.

- **Narrow screens:** because of the measurement span text, the grid column stretched to the width of its content, so the page overflowed horizontally at 360px and 375px and the table scroll did not work. The earlier "no horizontal overflow" was true only at 390px. We fixed it by specifying the columns.
- **A very long number:** a 400-digit number went through `Infinity` to `null` and erased the saved weight. We limited the digits and changed it to a notice.
- **Old numbers:** if the change table cannot be read again, the old values are hidden.
- **Retry:** added a progress display and disabling, a new notice if it fails again, and the focus moves to the card title when it ends.
- **Docs:** wrote the missing test files and the to-do of #68, and fixed the order numbers in the next work table.

## Limits and follow-up

- There is no graph. The change graph is handled in the #43 change report.
- If you move the date and come back during a slow save, the saved record can look like an empty form (#71).
- We did not check dark mode, a real phone, Firefox, or Safari.
- If you enter a negative number, you get the number format notice, not a range error.
- Automatic Garmin and scale integration is outside this issue.
