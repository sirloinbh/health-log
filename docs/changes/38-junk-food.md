# #38 Count how often and how much junk food was eaten

- Issue: [#38](https://github.com/sirloinbh/health-log/issues/38)
- Branch: `feat/38-junk-food`

## Purpose

Meal records alone do not show right away how often and how much junk food was eaten. Put a junk food mark on foods, and see the count, the number of days eaten, and the calorie total by week and month.

## Decisions

The recommendation in the issue was followed and decided without asking the user. The same content was left as an issue comment.

- **Criterion:** The user marks each food directly. A newly created food starts unmarked.
- **Default:** Only franchise fast food menu items are inserted with the mark on.
  - The seed foods (005) in the repository now have no menu item with a brand, so this PR turns on no food.
  - From now on, research migrations that insert franchise data (for example #31 burger franchises) insert with `is_junk = true`. The rule is written in `docs/food-data.md`.
  - The mark is decided only at the first insert. Even if it is updated by a new research migration, a mark the user changed stays.
- **Aggregation rule:** A meal record **copies the mark at the time of recording**, like the nutrition facts. Even if the food's mark is changed later, the totals of past records do not change, and records made after the change follow the new mark.
  - A combo record follows each food's mark at the time of recording. When copying from another day, the mark recorded on that day is carried over as it is.
- **Foods not in the food store:** Marked with a "정크푸드" (junk food) checkbox at direct entry. It is off by default, and turns off again after recording.
- **Counting:** One meal record line is one time. The quantity (1.5 servings and so on) is reflected only in the calories, not in the count. Eating twice on the same day gives a count of 2 and 1 day eaten.
  - The calorie total works the same way as the daily total. For each record, `calories × quantity` is rounded to two decimal places and added.
  - A record with unknown calories is counted in the count. It is excluded from the calories and reported as "칼로리 모르는 기록 n개 제외" (n records with unknown calories excluded).
- **Periods:** The same as the other week and month totals. A week is Monday to Sunday, a month is the 1st to the last day, based on Asia/Seoul calendar dates.
- **Location:** Shown as "정크푸드 / 이 주 / 이 달" (junk food / this week / this month) in the meal card of the daily record, below the nutrition totals.
  - The report (`report.ts`, `report.tsx`) was not touched in this PR so as not to overlap with #45.

## Change — 2026-11-06

- **DB** `database/migrations/011_junk_food.sql`
  - Added `foods.is_junk` and `meal_entries.is_junk`. Both are `boolean NOT NULL DEFAULT false`.
  - Created a partial index for the period totals.
  - It does not depend on 010 (#45). However, there is a constraint on the merge order. The runner rejects a new file numbered below an already applied one. So if 011 is merged first and `npm run db:migrate` is run on some DB, and then 010 comes, 010 is rejected on that DB (CI uses an empty DB, so this does not show up). In that case, following the central rule, whichever is merged later changes to the next number (012 and so on). #45 was told in a comment. The server is not deployed yet.
- **API** `backend/src/foods.ts`
  - Foods now have `isJunk`.
  - If the value is left out when adding, it is `false`, and if left out when editing, the existing value is kept. This is so that an older screen that does not know the mark cannot erase it.
  - Values that are not yes or no are rejected.
- **API** `backend/src/meals.ts`
  - Food store foods, combos, and copied records copy `is_junk` along with them.
  - Direct entry takes `isJunk`. If `isJunk` is sent together with a food store food, it is rejected.
  - The day response contains each record's `isJunk` and `junk.week` and `junk.month` (period, `times`, `days`, `calories.value` and `missing`).
  - A read is done from one snapshot. A request that changes data reads again in the same transaction and answers, and that change is always reflected in the response. A record saved by another tab at the same moment may show in the totals before the list, and is matched at the next read (wording corrected after the first review).
  - The separate transaction function inside the file was replaced with the shared function of `day-records.ts`.
- **Screen** `frontend/src/foods.tsx`: Put a "정크푸드" checkbox and a description in the add and edit food dialog. A food card with the mark gets a "정크푸드" badge.
- **Screen** `frontend/src/meals.tsx`, `frontend/src/junk-text.ts`
  - Added the badge to records, search results, and recently eaten foods.
  - Put the checkbox in direct entry.
  - Shows the totals in the form "이 주 11.02~11.08: 3회 · 먹은 날 2일 · 1300kcal" (this week 11.02 to 11.08: 3 times, 2 days eaten, 1300kcal). If there are none, it shows "없음" (none).
- **Docs** `docs/food-data.md`: Put `is_junk` in the research data example and wrote the rule. The test runs the example as it is.
- **Test setup** `frontend/src/test/setup.ts`: Filled in `ResizeObserver`, which jsdom lacks, with an implementation that does nothing. The checkbox inside a form uses it.

## Checks

- Tests
  - `backend/test/junk.integration.test.ts` (dates in 1983, a different month for each test, `testDatabaseSkip`)
    - Twice on the same day is 2 times and 1 day. The quantity is reflected only in the calories, and foods not marked and direct entries are not counted.
    - Turning a food's mark off or on leaves past records as they are, and records after that follow the new mark. Leaving the mark out when editing keeps it.
    - Totals break at the week boundary (1983-02-27 Sunday / 02-28 Monday) and the month boundary (02-28 / 03-01).
    - Combo records and copies from another day carry over the recorded mark.
    - A record with unknown calories is counted but left out of the calories. Deleting removes it from the totals.
  - `backend/test/foods.integration.test.ts`: Research data goes in with the mark on, and a mark the user turned off stays even after a new research migration.
  - `backend/test/foods.test.ts`, `meals.test.ts`: Check the mark value validation, the default when adding, keeping the value left out when editing, and rejection when the mark is sent together with a food store food.
  - `frontend/src/junk-text.test.ts`: Checks the totals text, "없음", and the text when calories are unknown.
  - `frontend/src/meals.test.tsx`: Checks the mark at direct entry and its release after recording, that a food store food is sent without the mark, the badge, and the this week and this month text.
  - `frontend/src/foods.test.tsx`: Checks the checkbox description, saving, the card badge, and that editing starts from the existing mark.
- Temporary PostgreSQL 17 cluster (port 5472)
  - Applied to `health_test` with psql as CI does, then recorded with the runner. 001 to 009 and 011, all with no errors.
  - `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: passed.
    - Backend: 184 passed, 0 skipped.
    - Frontend: 363 passed (364 after the first round of fixes), 2 skipped. The 2 skipped are existing conditional tests unrelated to this change.
    - Skill checks: 4 passed.
- `npm run knip`: passed.
- Before the PR, `origin/main` (38ada63) was merged and checked. There were no new commits, so no conflicts.

### Browser check

A real API (3972) and Vite (5272) were started on a temporary DB (`health_browser`), and headless Chrome (CDP 9672) was driven. Buttons and checkboxes were pressed with mouse events, and text was entered by key input. All 18 items passed.

| Item                                                                                                                            | Result |
| ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 390×844: An empty week and month show "없음" (none)                                                                             | Pass   |
| 390×844: Junk food twice on the same day and a salad → "2회 · 먹은 날 1일 · 1000kcal", the badge only on two lines              | Pass   |
| 390×844: Marking a direct entry on another day → "3회 · 먹은 날 2일 · 1300kcal" (week and month), mark released after recording | Pass   |
| 1440×900: The food card badge, the edit dialog starts with it on, and saving with it off removes the badge                      | Pass   |
| 1440×900: Even after turning the mark off, past totals stay, and new records are not counted                                    | Pass   |
| 320×700, 390×844, 1440×900: No horizontal overflow and no console errors on the daily record and food screens                   | Pass   |

- After the check, the API, Vite, Chrome, and the temporary DB were all shut down.
- Not checked: dark mode, a real phone, Firefox and Safari.

## Review

- **First:** There was nothing in the code that had to be fixed. The merge order constraint (the DB item above) was pointed out as something that must be settled, and it was written in this record and in the #45 comment. What was applied:
  - `meals.ts`: A comment that described a request that changes data as if it also reads at a single moment was corrected to match the real behavior. If the write transaction were changed to REPEATABLE READ, a record deleted at the same time could become a serialization error (500) instead of 404, so the isolation level was not changed.
  - `meals.tsx`
    - The totals area was given a visible heading (`h3`) as its name. It also shows up in heading navigation.
    - Added the description "위의 이 주·이 달 정크푸드 횟수로 셉니다." (Counted in the junk food counts for this week and this month above.) to the direct entry checkbox.
  - `meals.test.tsx`: Added a test that checks that a mark changed while waiting for a record stays as that of the next record. It is the same rule as name and calories.
  - Not applied
    - The case where the mark is turned off and on again while waiting and is cleared: It is the same rule as name and calories, so it was left.
    - Making the totals a live region: the record notice is already read.
    - The way the fake DB in the unit tests picks a response by the SQL string: if it changes, the test fails and it shows up.
- **Second:** Nothing had to be fixed. What was applied:
  - The weight of the junk food heading was matched to the meal heading (`h3`).
  - The test counts were fixed to those after the first round of fixes.
  - The "the main session was told" written in the PR body was corrected to the #45 comment that was actually left. A message sent to the main session expired while waiting for approval and was not delivered.
