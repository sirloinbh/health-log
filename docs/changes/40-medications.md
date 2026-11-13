# #40 Medication prescriptions and intake records

- Issue: [#40](https://github.com/sirloinbh/health-log/issues/40)
- Branch: `feat/40-medications`

## Purpose

Record prescribed medicines and the period taken, and see at a glance what is being taken now. This lets the user say exactly which medicines are being taken now and which were taken in the past when seeing a doctor.

## Decisions

Decided without asking the user. The same content was left as an issue comment.

- **Only the period is recorded.** As the issue recommended, a daily intake check is not included. If needed, it is made a separate issue.
- **Linking to a clinic visit is optional.**
  - A medicine bought without a prescription is recorded with no link.
  - If the linked visit is deleted, the medicine record stays and only the link is cut (`ON DELETE SET NULL`).
  - A "처방 약" (prescribed medicine) link is placed on the visit card of the "병원" screen, to record the medicine linked to that visit directly with the visit date.
  - In the dialog, the user chooses from the 20 most recent visits.
- **Judging "currently taking":** Based on the service's today (Asia/Seoul, `serviceDate`).
  - If the start date ≤ today and the end date is missing or after today, it is "복용 중" (currently taking). The end date itself is included.
  - If the start date is after today, it is "시작 예정" (starting soon), and if the end date is before today, it is "지난 약" (past medicine).
- **Dose and directions are text** ("500mg", "하루 2번 식후" = twice a day after meals). The end date cannot be earlier than the start date (on the screen, the API, and the DB).
- **Screen**
  - A new "약" (Medicine) screen is placed in the main menu. It is shown in the order currently taking, starting soon (only when there are some), and past medicine.
  - Added "이 날 먹은 약" (medicine taken on this day) to the "병원·약" card of the daily record. It shows the medicines whose period includes that day.
  - Dates on the screen follow the daily record range (#50, 2000 to 2099). The dialog follows the #78 and #98 approach, and the card follows `writesSettled` of #71 and the retry focus of #65.
- **Sensitive information:** The contents of medicines are not left in logs. Rejection messages do not repeat the entered value (confirmed by tests). Tests and documents use only made-up values marked "가상" (fictional).

## Change — 2026-11-08

- **DB** `database/migrations/016_medications.sql`: `medications`
  - Medicine name (1 to 100 characters), dose (50), directions (100), start date, end date (on or after the start date), memo (500)
  - Clinic visit (references `clinic_visits`, NULL when deleted)
- **API** `backend/src/medications.ts`, `backend/src/app.ts`
  - `GET /api/medications`: `{ today, current, upcoming, past }`. Today is the `today()` of `createApp` (Asia/Seoul by default).
  - `GET /api/medications?date=`: the medicines taken on that day
  - `POST`, `PUT /:id`, `DELETE /:id`. Linking a visit that does not exist gives 400 "연결할 병원 방문을 찾을 수 없습니다" (the clinic visit to link cannot be found).
- **Screen**
  - `frontend/src/medications.tsx`: the "약" screen and the medicine dialog
  - `frontend/src/med-text.ts`: formatting
  - `frontend/src/visit-card.tsx`: "이 날 먹은 약"
  - `frontend/src/visits.tsx`: the "처방 약" link on the visit card
  - `frontend/src/app.tsx`: the route, the main menu, and the today value shared by the two screens

## Checks

### Browser

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`, `npm run db:migrate`). Headless Chrome (debugging port 9673) was driven over CDP.

- Only made-up values were used. A visit "가상N내과" (fictional N internal medicine) two days before today (2026-11-08) and "가상N지난약" (fictional N past medicine) that ended a month ago were created through the API.
- At 320×700, 390×844, and 1440×900, the sequence below passed as it was.

1. Pressing "처방 약" on a visit card of the "병원" screen opens the dialog on the "약" screen. The start date is the visit date and the visit is chosen as that visit. The dialog fits within the screen width.
2. Entering the medicine name, dose, and directions and saving shows, under "복용 중 1" (currently taking 1), "…부터" (from …), "500mg · 하루 2번 식후", and "…가상N내과 처방" (prescribed by fictional N internal medicine). Past medicine is also shown separately, and focus is on the page title.
3. The daily record card of that visit day shows the visit and "이 날 먹은 약: 가상N정 · 500mg · 하루 2번 식후" (medicine taken on this day: fictional N tablet · 500mg · twice a day after meals).
4. Deleting the visit leaves the medicine as it is under "복용 중", and only the "처방" (prescribed) line disappears.

- At all three widths there was no horizontal overflow and no console errors. The records the script created were deleted at the end, so none remained in the DB.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

- `backend/test/medications.test.ts` (6 tests, no DB)
  - Rejects an end date earlier than the start date. A date must be a real date.
  - A name is required, and the character count is the same for emoji.
  - Checks the visit ID format. Rejection messages do not repeat the entered value. The ID and dates are validated before the DB.
  - If `serviceDate` passes 15:00 UTC, it becomes the next day in Seoul.
- `backend/test/medications.integration.test.ts` (7 at first, 9 after the first review, 1985-09 to 10, using `testDatabaseSkip`)
  - Saves and reads back.
  - Divides by the service's today (1985-09-10, injected): the end date itself is currently taking, starting today is currently taking, starting tomorrow is starting soon, ending yesterday is past medicine.
  - Checks the medicines of a day. Deleting the linked visit leaves the medicine and cuts only the link. A visit that does not exist cannot be linked.
  - Saving again changes all fields. Checks 404. The DB rejects an end earlier than the start.
- `frontend/src/medications.test.tsx` (10 at first, 14 after the first review)
  - Opens from the menu and shows sections divided. A new medicine starts today and is sent with a visit link. In an edit, cutting the link gives `visitId: null`.
  - Checks the input validation before sending, the dialog opened from the visit card link, delete and focus, and focus after a save failure.
  - Checks the "처방 약" link on the visit card, and that day's medicine and "기록 없음" (no record) on the daily record card.

### Commands

- With a temporary `health_test` (`npm run db:migrate`, 001 to 016), `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed
  - Backend 254 passed, 0 skipped (including DB integration tests). Frontend 440 passed, 2 skipped. Skill checks 4 passed.
- `npm run knip`: passed

## Limits

- Past medicine is all shown with no paging. It was judged that the number is small because these are personal records.
- The visits that can be chosen in the dialog are the 20 most recent. An older visit is linked through the "처방 약" link on that visit's card.
- It was not checked with a real screen reader, Firefox, or Safari.

## First review — 2026-11-08

A separate read-only review was run. Nothing had to be fixed, and the following was applied.

- **Confirmed**
  - Currently taking, starting soon, and past medicine neither overlap nor leave anything out.
  - Linking a visit that does not exist is told apart by the constraint name and becomes 400.
  - The row content (detail) of a CHECK violation is not in the 500 log.
- **Test additions (should fix)**
  - When saving again, checks that the visit link can be kept, changed, or released, and that changing to a visit that does not exist gives 400 and the record stays as it was.
  - Checks that a one-day medicine is caught on both the first day and the last day.
  - Checks that on the daily record card, even if only the medicine request fails, both parts come back after "다시 시도" and focus goes to the title.
  - Checks that it reads after waiting for an in-progress medicine save.
  - Checks a linked visit outside the 20 most recent, the "선택한 방문" (selected visit) for a link with no date, and the starting soon list.
- **Correcting an existing test:** The fake response in `visits.test.tsx` was giving a wrong value to the medicine request, so it was fixed to receive the medicine request separately.
- **Small points applied**
  - In a link that passed only the visit with no date, today's date is not attached to the "선택한 방문".
  - The loading name of the card was changed to "병원·약 기록 불러오는 중" (loading clinic and medicine records).
  - The time in a test comment was corrected.
- **Not applied**
  - The behavior of hiding the visit too when only the medicine request fails is left as it is (both come back together with retry).
  - There is no notice when the visit list could not be loaded (it can be saved with no link).
  - The "약 기록 보기" (view medicine records) link being always visible is left as it is.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 256, 0 skipped. Frontend 444 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.

## Second review — 2026-11-08

The first round of fixes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed. Reviews end here.

- **Confirmed**
  - The date of the visit link (`visitDate`) is attached only when there is a date usable for the link.
  - The tests clean up every time, so no requests or timers remain.
  - The three lists do not overlap.
- **Small points applied:** Removed the blank before the "선택한 방문" with no date, and removed an unused type field.
- **Not applied:** The behavior of hiding the visit too when only the medicine request fails is left as it is, for the same reason as in the first review.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 256, 0 skipped. Frontend 444 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.
