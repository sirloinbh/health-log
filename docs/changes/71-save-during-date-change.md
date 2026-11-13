# #71 Show the saved record even after changing the date and coming back during a save

- Issue: [#71](https://github.com/sirloinbh/health-log/issues/71)
- Branch: `fix/71-save-during-date-change`

## Purpose

The cards of the daily record are created anew for each date. If a save is slow and the user goes to another day and comes back, the new card reads that day before the save finishes. Then the DB has the value but the screen shows an empty form and does not read again. If only a memo is saved from this empty form, it is a save that replaces the whole day, so the weight is erased.

## Decisions

It was done as the issue's to-do items said, and decided without asking the user. The same content was left as an issue comment.

- **Method:** Before a card reads that day, it waits until the saves and deletes sent for that day finish. While waiting, "불러오는 중" (loading) is shown instead of the form.
  - Even if the save fails, the waiting ends and it reads what is on the server as it is. The failure notice appears as a toast as now.
  - There was also a way of remembering the response outside the card and using it. But it was hard to match changes from another tab and failed saves, so reading again from the server after it ends was chosen.
- **Scope:** It was put into the sleep, body, alcohol and tobacco, and daily check cards, which have the same structure. The meal card also showed a list missing the food just recorded if the user came back during recording, so it was fixed too. The backend, the API shape, and `daily.tsx` were not changed.
- **Body period change:** On any day, if a body record is being saved, it waits. If it reads before a save of another day inside the 90-day range finishes, the amount of change comes out with the old value. Waiting even for saves of days outside the range is the result of choosing the simplicity of not considering the date range.

## Change — 2026-11-06

- **New file** `frontend/src/pending-writes.ts`
  - `trackWrite(path, write)`: Remembers save and delete requests by API path until they finish. The result and failure are passed on as they are.
  - `writesSettled(prefix)`: Waits until all requests that start with that path finish. If it had to wait, it also waits for requests that started in the meantime. If there is no request in progress, it ends right away, so a save that started at the same moment as the read is not waited for. While reading there is no form, and the meal card counts changes separately to prevent this case.
- **Cards** `sleep.tsx`, `body.tsx`, `habits.tsx`, `checks.tsx`, `meals.tsx`
  - Wrapped save (PUT, POST) and delete (DELETE) with `trackWrite`.
  - Before reading that day, they wait for `writesSettled`. The body period change waits for all of `/api/body/`.

## Verification

### Browser reproduction and fix check

A real API (3973) and Vite (5273) were started on a temporary DB (port 5473, `health_browser`). Headless Chrome was driven over CDP. For the debugging port, 9373 is in the Windows reserved range (9367 to 9466), so 9673 was used.

The scenario is as follows.

1. On a date of 2026-03-1x, put values in four cards. Sleep 23:00 to 07:00, weight 70.5, cigarettes 3, and a daily check memo.
2. With the browser holding the PUT requests for 1.5 seconds, press "저장" (save) of the four cards with mouse events.
3. Right away press "다음 날" (next day) and "이전 날" (previous day), and after 3 seconds look at the screen and the API values.

| Step                                                                      | Sleep       | Body        | Alcohol/tobacco | Daily check |
| ------------------------------------------------------------------------- | ----------- | ----------- | --------------- | ----------- |
| Before the fix, 1440×900: values saved in the API                         | Present     | Present     | Present         | Present     |
| Before the fix, 1440×900: the screen after coming back                    | Empty form  | Empty form  | Empty form      | Empty form  |
| After the fix, 1440×900 / 390×844 / 320×700: the screen after coming back | Saved value | Saved value | Saved value     | Saved value |

- Before the fix, when the memo "메모만" (memo only) was saved from the empty body form after coming back, the weight in the API changed from `70.5` to `null`. The overwrite that had been inferred from code in the issue was confirmed in practice.
- After the fix, at all three widths there was no horizontal overflow and no console errors.
- The meal card was not checked in the browser. There are many steps of food search and input, so screen tests stood in.
- After the check, the temporary DB, API, Vite, and Chrome were all shut down.

### Tests

- `frontend/src/pending-writes.test.ts` (5 new)
  - If there is nothing to wait for, it ends right away.
  - It waits until the save of the same day ends, and passes the save result on as it is.
  - A failed save also ends the waiting, and the failure goes to the caller as it is.
  - It does not wait for saves of other days or other records. A prefix path waits for all days.
  - It also waits for a save that started while waiting.
- One test per card: "if a card of the same day is created again during a save, it does not read until the save ends and shows the saved value after it ends". These are the sleep, body, alcohol and tobacco, daily check, and meal cards. It was confirmed that all five fail on the code before the fix and pass after.
- Filled in the test gaps noted in the issue.
  - Delete failure: On the body, alcohol and tobacco, and daily check cards, the reason appears as a toast and the record and dialog stay. Sleep already had it.
  - Old failure response: In the body period change, a late old failure does not overwrite the new amount of change received after the save.
  - Focus: Pressing "수정" (edit) on the body card moves focus to the card title. Sleep already had it.
- The test "기록 전에 시작된 읽기가 화면을 되돌리지 않는다" (a read that started before recording does not turn the screen back) in `frontend/src/meals.test.tsx` was fixed. This test gives responses in request order, but the read went out after waiting one round, so the order changed. It was changed to give responses to reads and writes separately. What it checks is the same.

### Commands

- `TEST_DATABASE_URL= npm run check`: passed
  - Frontend 338 passed, 2 skipped. Backend 83 passed, 75 DB tests skipped. Skill checks 4 passed.
  - The `TEST_DATABASE_URL` of this shell pointed to the DB of another project (`study_test`), so it was run with it emptied. This change changed only the frontend, so it is unrelated to the DB tests.
- `npm run knip`: passed

## Limits

- It waits only for requests inside the same browser tab. It does not wait for a value being saved in another tab.
- If a save takes a long time with no response, the card that came back also stays in "불러오는 중" in the meantime. There is no request time limit in this change.
- The problem of a late "다시 시도" (retry) response overwriting a new response is handled in #92.
- Reads outside the daily record are not waited for. There is no risk of overwriting data.
  - The recent foods list of the meal card (`/api/foods/recent`) may still be missing the food being recorded.
  - If the user goes to the overview screen (`/api/report`) during a save, a report missing that save may be shown.

## First review — 2026-11-06

A separate read-only review was run. Nothing had to be fixed, and the following was applied.

- **State between tests:** The list of requests in progress remains for the whole test file. If one test fails before finishing a save, the following tests that use the same date stay in "불러오는 중" and also fail together. A test-only `forgetPendingWrites()` was made and is emptied in `afterEach` of `frontend/src/test/setup.ts`.
- **Correcting the description:** The code comment and the document were fixed to say that the body period change waits for all body saves, not just the 90-day range. The point that it reads right away if there is no request in progress was also written in the `writesSettled` comment and the document.
- **Limits added:** Wrote in the limits that the recent foods list and the overview report are not waited for.

## Second review — 2026-11-06

The first round of fixes and the whole diff were reviewed again by a separate read-only review. Nothing had to be fixed, and two small points were applied. Reviews end here.

- **Leaving again while waiting:** If, while the card that came back is waiting for a save, the user goes to yet another day, the card that disappeared still sent a read request after the save ended. It has no effect on the screen, but it is a useless request. All five cards check after waiting whether the card still exists, and do not read if it does not. A test was added to `frontend/src/sleep.test.tsx`.
- **A request that finished late after being emptied:** Added to `frontend/src/pending-writes.test.ts` a test that an old request that finished late after `forgetPendingWrites()` does not end the waiting of a new request (6 tests).
- After applying, `TEST_DATABASE_URL= npm run check`: passed (frontend 340 passed, 2 skipped. Backend 83 passed, 75 DB tests skipped. Skill checks 4 passed). `npm run knip`: passed.
