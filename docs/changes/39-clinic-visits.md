# #39 Clinic visits and dermatology procedure records

- Issue: [#39](https://github.com/sirloinbh/health-log/issues/39)
- Branch: `feat/39-clinic-visits`

## Purpose

Keep in one place when, at which clinic, and what was received, so it can be checked at the next visit. For dermatology procedures, the type, body area, dose or session count, and the time of the next procedure are kept together.

## Decisions

Decided without asking the user. The same content was left as an issue comment.

- **Sensitive information:** The contents of visits and procedures are not left in logs. This API does not write requests to the log, and rejection messages do not repeat the entered value (confirmed by tests). The server error log is, as before, only one line with an internal message. Tests and documents use only made-up values marked "가상" (fictional).
- **A procedure is an item attached to a visit.** One visit holds 0 to 10 procedures. When a visit is deleted, its procedures are deleted too (`ON DELETE CASCADE`).
- **Dose or session count is text** (units vary, as in "100유닛" (100 units) and "3회차" (3rd session), so it was not split into a number field).
- **Cost is an integer in won** (0 won to 100 million won). On screen both `12000` and `12,000` are accepted, and ambiguous values such as `1.5` or `12,00` are rejected before sending.
- **The next appointment date** cannot be earlier than the visit date (on the screen, the API, and the DB).
- **Search** finds by part of the clinic name or the procedure name. It is case-insensitive, and `%` and `_` are searched as literal characters. The most recent visits are shown first, 20 at a time.
- **Screen**
  - A new "병원" (Clinic) screen is placed in the main menu. It has a list, search, a visit record and edit dialog, and a delete confirmation.
  - The "병원·약" (clinic and medicine) placeholder in the daily record screen was replaced with a real card. It shows that day's visits, and the "이 날 병원 방문 기록" (record a clinic visit for this day) link opens the dialog with that date filled in. Recording and editing are done on the "병원" screen. Medicine will be added to this card in #40.
  - The dialog follows the approach of #78 (on close, focus returns to the button that opened it) and #98 (focus kept during saving and after a failure).
  - Like #71, the daily record card reads after an in-progress visit save finishes, and like #65, after a "다시 시도" (retry) it moves focus to the card title.

## Change — 2026-11-08

- **DB** `database/migrations/015_clinic_visits.sql`
  - `clinic_visits`: date, clinic (1 to 100 characters), department (50), symptom and diagnosis memo (1000), medical fee, next appointment date
  - `clinic_procedures`: visit, order (1 to 10), procedure name (1 to 100), body area (50), dose or session count (50), cost, memo (500)
  - The DB also rejects empty text, an out-of-range cost, and an appointment date earlier than the visit. 014 is used by #32.
- **API** `backend/src/visits.ts`, `backend/src/app.ts`
  - `GET /api/visits?q=&offset=`: search and paging (20 items, `more`)
  - `GET /api/visits?date=`: the visits of that day
  - `POST /api/visits`, `PUT /api/visits/:id`: Writes the visit and the procedure list in one transaction. An edit replaces the whole procedure list.
  - `DELETE /api/visits/:id`: 404 if it does not exist.
  - Character counts are done with `charCount`, as in #92 and #101. Dates follow the API range of #50, and the screen follows the daily record range (2000 to 2099) (after the first review).
- **Screen**
  - `frontend/src/visits.tsx`: the "병원" screen and the visit dialog
  - `frontend/src/visit-card.tsx`: the "병원·약" card in the daily record
  - `frontend/src/visit-text.ts`: formatting and reading cost in won
  - `frontend/src/app.tsx`: the route and the main menu
  - `frontend/src/daily.tsx`: replaced the last placeholder with the card.

## Checks

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`, `npm run db:migrate`). Headless Chrome (debugging port 9673) was driven over CDP. Only made-up values ("가상NN피부과" = fictional NN dermatology clinic, "가상NN레이저" = fictional NN laser) were used. At 320×700, 390×844, and 1440×900, the sequence below passed as it was.

1. The "병원·약" card of a daily record (2026-05-NN) shows "이 날 병원 방문 기록이 없습니다" (there is no clinic visit record for this day) and the record link.
2. Pressing the link opens the dialog on the "병원" screen with that date. The dialog fits within the screen width.
3. Enter a clinic, a department, a medical fee "12,000", and 2 procedures, and save. A card appears in the list, and focus is on the page title (because the link that opened it was on a different screen).
4. Searching by a procedure name finds it, and a name that does not exist shows "찾는 기록이 없습니다" (there is no record you are looking for).
5. The daily record card shows the clinic, two procedure lines ("…레이저 · 50,000원" = "…laser · 50,000 won"), and "진료비 12,000원" (medical fee 12,000 won).
6. Confirming the delete removes it from the list and the API, and focus is on the page title. After the confirmation, `clinic_visits` and `clinic_procedures` in the DB had 0 rows.

- At all three widths there was no horizontal overflow and no console errors.
- In the first run at 320, the script pressed the button before the dialog was fully drawn and stopped. It passed in a rerun with a longer wait.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

- `backend/test/visits.test.ts` (7 tests, no DB)
  - A date and a clinic name are required. The character limit is the same for emoji.
  - Cost accepts only integers from 0 to 100 million won. The appointment date cannot be earlier than the visit. A procedure needs a name and at most 10 are allowed.
  - Rejection messages do not repeat the entered value.
  - The ID, date, search term, and list position are validated before the DB.
- `backend/test/visits.integration.test.ts` (7 at first, 9 after the first review, 1985-07 to 08, using `testDatabaseSkip`)
  - A visit and procedures are saved in order and read back by that day.
  - Searching by clinic name and procedure name works, and `%` is searched as a literal character.
  - Saving again replaces the whole procedure list. A visit that does not exist gives 404.
  - Deleting a visit also deletes its procedures.
  - If saving the second procedure fails, the new visit does not remain at all.
  - If saving the second procedure fails during an edit, the previous visit stays as it was.
  - The DB rejects an empty clinic name, an early appointment date, and a negative cost.
- `frontend/src/visits.test.tsx` (13 at first, 16 after the first review)
  - Opens from the menu and shows the list. Checks the body that sends a new visit. An edit starts from the existing values and a procedure can be removed.
  - Checks the input validation before sending. Checks the 10-procedure limit, the search term encoding and "찾는 기록이 없습니다", and the delete confirmation and focus.
  - `?new=date` opens the dialog with that date. Input and focus stay after a save failure.
  - Daily record card: checks that day's visits and the link, the notice for no visits, focus after "다시 시도", and reading after waiting for an in-progress visit save.

### Commands

- After merging `origin/main` (including #32's 014 and #104), a temporary `health_test` was created fresh with `npm run db:migrate` (001 to 015), and `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed
  - Backend 238 passed, 0 skipped (including DB integration tests). Frontend 419 passed, 2 skipped. Skill checks 4 passed.
- `npm run knip`: passed

## Limits

- Visits are recorded and edited only on the "병원" screen. The daily record card shows them and only offers a link.
- Search looks only at the clinic name and the procedure name. It does not search the department or memo.
- It was not checked with a real screen reader, Firefox, or Safari.

## First review — 2026-11-08

A separate read-only review was run. Nothing had to be fixed, and the following was applied.

- **"더 보기" (show more) could mix two lists (should fix):** If "결과 더 보기" (show more results) was pressed while a new search or a re-read after save or delete was in progress, the part read with the old search term and position could be attached after the new list. While the list is being read, "더 보기" is set to busy (`aria-disabled`).
- **Daily record range (should fix):** The dialog did not apply the daily record range (#50, 2000 to 2099) to the visit date and the next appointment date, so a visit could be created for a day that cannot be opened in the daily record. The range is checked before sending, and a `?new=` link outside the range opens with today. If today is not yet known, it waits until it is.
- **Test additions (should fix):** Added integration tests for paging by 20 (21 items → 20 and `more`, `offset=20` → 1 item) and for searching `_` in the search term as a literal character.
- **Small points applied**
  - The character count (`charCount`) and the cost limit (100 million won) are checked before sending.
  - Even when the 10th procedure is added, the "시술 추가" (add procedure) button does not lose focus (`aria-disabled`).
  - Adding a procedure moves focus to the name field of the new row, and removing one moves it to the "시술 추가" button.
  - Removed a duplicate scroll class in the dialog.
- **Not applied:** After a delete, the re-read returns a list that was extended with "더 보기" to the first page. Keeping the position after the order or count of the list changes behaves the same as other screens (foods and combos), so it was left. An index key on a read-only list is harmless, so it was kept.
- On the code before the review, 5 new or changed screen tests fail.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 240, 0 skipped. Frontend 422 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.

## Second review — 2026-11-08

The first round of fixes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed. Reviews end here.

- **Confirmed:** The busy state of "더 보기" is released only by the newest read, so it does not stay stuck. The focus of a procedure row moves only once right after add or remove is pressed. Even when edited twice at the same time, the visit row is locked, so procedure lists do not get mixed.
- **Notice wording (should fix):** The first round of fixes produced awkward notices such as "진료비은(는)" and "1번째 시술 메모은(는)" (the Korean topic particle written in its generic "은(는)" form after a noun). The screen picks 은 or 는 to match the last character of the name (`withTopic`, for example "진료비는", "병원 이름은"). Server notices keep the same "은(는)" form as the other APIs.
- **`?new=` link hardening**
  - If the server could not tell today, the link might never open. Now it opens with an empty date and lets the user pick one.
  - Tests were added along with the case of waiting for today and then opening. Added 2 new tests and `visit-text.test.ts` (은/는, reading cost in won).
- **Added to limits**
  - A visit created through the API with a date before 2000 (for example the 1985 test data) cannot be saved on the screen until the date is changed.
  - If the re-read after a delete fails, "더 보기" can read one visit twice. It was left because it is rare.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 240, 0 skipped. Frontend 426 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.
