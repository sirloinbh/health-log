# #48 Reminders for clinic appointments and the end of medication

- Issue: [#48](https://github.com/sirloinbh/health-log/issues/48)
- Branch: `feat/48-reminders`

## Purpose

The next appointment date of #39 and the medicine end date of #40 can only be known by opening those screens directly. When a date gets close, show it first inside the app so it is not missed.

## Decisions

Decided with the default plan without asking the user. The same content was left in an [issue comment](https://github.com/sirloinbh/health-log/issues/48#issuecomment-6718651227).

- **Reminder means:** Shown only inside the app screen. External services (push, mail) are not used. Phone push is handled as a separate issue after the server is deployed.
- **Where it is shown:** A "다가오는 일정" (upcoming schedule) card is placed at the very top of the dashboard and in the daily record of **today's date**. It is not put in the daily record of other dates, because the schedule is counted from the real today.
- **Targets**
  - The next appointment date of a clinic visit (`next_visit_on`). For a visit that had a procedure, "지난번 시술: …" (last procedure: …) is shown together. The timing of a procedure is handled by this appointment date. A procedure has no date field of its own.
  - The end date of a medicine (`end_on`). A medicine with no end date is not a target.
- **Starting day of reminders:** Shown from 7 days before. From the service's today (Asia/Seoul) to 7 days later, both ends included. The screen divides them into "오늘" (today), "내일" (tomorrow), and "N일 뒤" (in N days). A schedule whose date has passed is not shown.
- **Done and hiding:** Handled with one "완료" (done) button.
  - The handled record is saved together with that date. So if the appointment date or end date is changed to another day, it is announced again with the new date.
  - If, after the date was changed on another screen, a done is sent with the old date, the API returns 404 "알림을 찾을 수 없습니다" (the reminder cannot be found). After reading the list again, the card says "다른 화면에서 날짜가 바뀌었거나 지워진 일정이라 목록을 새로 불러왔습니다" (the schedule had its date changed or was deleted on another screen, so the list was reloaded).
  - There is no undo button. The original record stays as it is on the clinic and medicine screens.
  - If a visit or medicine record is deleted, its done record is deleted too (`ON DELETE CASCADE`).
- **Sensitive information:** The reminder API does not leave the content of requests in logs. Rejection messages do not repeat the entered value. Tests and documents use only made-up values marked "가상" (fictional).

## Change — 2026-11-08

- **DB** `database/migrations/017_reminders_done.sql`: `reminders_done`
  - It has exactly one of the visit ID or medicine ID, and the date it was done (`due_on`).
  - The same date of the same target is saved only once.
- **API** `backend/src/reminders.ts`, `backend/src/app.ts`
  - `GET /api/reminders`: `{ today, until, leadDays: 7, reminders }`. In date order, and on the same day, visits come before medicines. Each item has `daysLeft` (0 for today).
  - `POST /api/reminders/done` `{ kind: 'visit' | 'medication', id, dueOn }`: 204. Sending twice gives the same result. If the target does not exist or the date differs from the current record, it is 404.
- **Screen**
  - `frontend/src/reminders.tsx`: the "다가오는 일정" card.
    - Each schedule shows when, the date, what, a link to the record screen, and a "완료" button.
    - While a done is in progress, including while reading again after a 404, all the done buttons are `aria-disabled` (#98).
    - The button name is "… 알림 완료" (… reminder done), and while processing it is "… 알림 완료 처리 중" (… reminder done, processing). A screen reader can also tell that it only hides the reminder and that it is processing.
    - When the button that was done disappears, focus moves to the card title (#65). "다시 시도" (retry) is the same.
    - Before reading, it waits for clinic and medicine saves to finish (#71).
  - `frontend/src/reminder-text.ts`: types and text (`whenText`, `reminderTitle`, `reminderDetail`).
  - `frontend/src/report.tsx`: places the card below the dashboard heading. The service's today is used as the key, so it reads again after midnight.
  - `frontend/src/daily.tsx`: placed at the front of the card list only when the date is today. Today uses the date the server gave last. So the card does not disappear even if one server check fails.
- **Tests**
  - `backend/test/reminders.integration.test.ts` (November to December 1985)
    - Today, tomorrow, and 7 days later appear, and 8 days later, past days, and no date are left out.
    - If today is changed, the range moves along.
    - A schedule marked done does not appear again, and sending twice gives the same result.
    - If the date is changed it appears again, and it cannot be marked done with the old date. If the date is set back to the original, that done is kept.
    - A deleted record cannot be marked done, and deleting it deletes the done record. Even if a visit ID is sent as a medicine, it is 404.
  - `backend/test/reminders.test.ts`: A wrong request is 400 before reaching the DB. The end date of the range is right even across the end of a month and the end of a year.
  - `frontend/src/reminders.test.tsx`
    - Checks the text, the list display, and the notice for an empty list.
    - Checks that a duplicate send during done is blocked, what is sent, removal from the list, and the focus move.
    - On 404, it announces after reading again, and does not send another done while reading again. On other failures, the schedule stays. During processing, the button name changes.
    - Even if only the reminders cannot be loaded, the rest of the dashboard stays as it is.
    - Checks retry and focus move after a load failure, and waiting for saves.
    - The card appears on the dashboard.
  - `frontend/src/daily.test.tsx`: The card is only in today's daily record, and for other days reminders are not requested. Even if one server check fails, the card stays.
  - `/api/reminders` was added to the fake responses of the existing dashboard, daily record, and app tests.

## Verification

- `TEST_DATABASE_URL=<temporary PG17 health_test> npm run check`: passed (backend 263, 0 skipped. Frontend 498 passed, 2 skipped. Skill checks 4).
- `npm run knip`: passed.
- A real browser (headless Chrome 156, widths 320, 390, 1440, temporary DB `health_browser`, today 2026-11-08)
  - It was checked with fake records: an appointment today (with a procedure), a medicine ending tomorrow, an appointment 7 days later, and an appointment 8 days later.
  - Only the first three appeared on the dashboard, in the order today, tomorrow, 7 days later. The appointment 8 days later did not appear. There was no horizontal overflow.
  - "완료" of the medicine was pressed with the keyboard (Enter). The done notice appeared, focus went to the card title, and the schedule was removed. It did not appear again after a refresh.
  - In today's daily record, the card appeared at the front. In yesterday's date, there was no card. Console errors were 0.
  - After the check, the fake records were deleted and the DB, server, and Chrome were all shut down.
- Not checked: a real screen reader, Firefox, Safari.

## Review

### First (independent read-only review)

- **[medium] Sorting on the same day:** Kinds were compared alphabetically, so medicines came before visits. It was fixed so that visits come first, as in the document. An integration test checks that a medicine saved earlier comes after a visit on the same day.
- **[low] A late list brought back a schedule that was done:** If another schedule was marked done while reading again after a 404, the late list showed that schedule again. At first it was fixed by remembering schedules that were done and removing them from the list. When the second review was applied, the done buttons were changed to be locked until the re-read after a 404 finishes, so this race can no longer happen, and that memory was removed. A test checks that no other done is sent while reading again.
- **[low] Test comment:** The comment "a visit ID is not a medicine ID" claimed more than the test actually proves. It was fixed to match what is checked ("the kind chooses the table: if a visit ID is sent as a medicine, no medicine ends that day").
- **[very low] Overlapping index:** `UNIQUE (medication_id, due_on)` already plays the same role, so `reminders_done_medication_id_idx` was removed. 017 was not yet merged, so the file was fixed, and the temporary DB was created anew and applied again.
- After applying, `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed (backend 263, 0 skipped. Frontend 499 passed, 2 skipped. Skill checks 4). `npm run knip`: passed.

### Second (independent read-only review)

There was no problem that had to be blocked. The following was applied.

- **[medium] The daily record card flickered:** If one server check failed, today's date was lost and the card disappeared and came back. Focus was lost in between too. It was fixed to use the last today the server gave, as the dashboard does, and a test was added.
- **[low to medium] The notice and focus after a 404:** "알림을 찾을 수 없습니다" did not match the list read again. Also, the focus move could interrupt reading the reminders. Now after the re-read finishes, a status notice ("…목록을 새로 불러왔습니다" = …the list was reloaded) is shown, and focus moves then. While reading again, the done buttons are locked.
- **[low] Processing was not audible, [low] The name was confusing:** The button name was changed to "… 알림 완료", and while processing it becomes "… 알림 완료 처리 중".
- **[low] Missing tests:** Added the scene where the rest of the dashboard stays even if only the reminders fail, and the scene where the server check fails in the daily record.
- **Not applied**
  - Allowing done for a date outside the display range [very low]: It is harmless and can be used to hide in advance, so it is left as it is.
  - An index on the date column [very low]: Not needed at the scale of one user. If records grow, a partial index is added to 015 and 016.
- Checks after applying
  - `TEST_DATABASE_URL=<temporary health_test> npm run check`: passed. Backend 263 (0 skipped), frontend 502 (2 skipped), skill checks 4.
  - `npm run knip`: passed.
  - It was checked again in a real browser (widths 320, 390, 1440). The results are as above: keyboard done, focus move, staying hidden after a refresh, the card only on today, no overflow, console errors 0. After the check, the DB, server, and Chrome were shut down.
