# #35 Register foods by pasting a Coupang link and a nutrition facts table

- Issue: [#35](https://github.com/sirloinbh/health-log/issues/35)
- Branch: `feat/35-coupang-paste`

## Purpose

Reduce the effort of typing in food bought on Coupang one item at a time while looking at its nutrition facts table.

## Decisions

- The user decided this on 2026-11-08, after the #34 research ([#34 comment](https://github.com/sirloinbh/health-log/issues/34#issuecomment-6715972057)). The user confirmed again before this PR was started.
  - Approaches E and C are used together.
    - E: The Coupang link is stored only as a source URL, and the source type is `label` (product label).
    - C: When the text of a nutrition facts table is pasted, the app reads it and fills the fields.
  - Automatic collection of Coupang pages (A) and the Partners API (B) are not used.
  - Tables that exist only as images are handled in #47.
  - Linking with the MFDS DB (F) was left as [#118](https://github.com/sirloinbh/health-log/issues/118) (P4, needs-user, under #83).
- **Interpreting the pasted text was implemented inside this issue.**
  - E (the source URL and the `label` type) already existed on the food screen. So after the decision, most of what remained in #35 was interpreting the pasted text.
  - The interpretation is a small change that is done by one pure function in the screen. It needs no server, DB, or migration.
  - If it were split into a separate issue, only the guidance text would remain in #35, so it was not split.
- **The issue's to-do items and completion criteria were changed to match the decision.** Because the approach changed, the to-do items and completion criteria changed as below.
  - "Extract the product name and nutrition facts with the approach chosen in the research": The serving size and nutrition facts are read from the pasted table. The product name is not in the table, so it is typed in.
  - "A test that extracts from a sample response": Changed to samples of nutrition facts table text.
  - "A test that the server rejects non-Coupang addresses and internal network addresses": This criterion applies only when the server opens the link. In this approach neither the server nor the app opens the link, so it does not apply. A screen test confirms that the app makes no requests other than to its own API.
  - "Check with a real product link": Following the decision, the Coupang page was not opened. It was confirmed that only the link string is stored as the source.
  - "Calculate calories from the total content and the amount eaten": It tells how many times the serving size the table's total content is, and the calories for that amount. If a meal is recorded with that number of servings, the calories are calculated (the quantity of an existing meal record).

## Change — 2026-11-08

- **`frontend/src/nutrition-label.ts` (new file)**
  - `readNutritionLabel`: Reads the reference amount from the pasted text. It recognizes "100g당" (per 100g), "1봉지(45g)당" (per 1 bag (45g)), and "1회 제공량 1개(30g)" (1 serving, 1 piece (30g)), and if there is only a total content, it uses the total content as the reference amount.
  - The same function also reads the total content, calories, carbohydrate, protein, fat, sugars, and sodium.
    - The value that comes after the reference amount is preferred. Even if the table also has the whole-bag value, the value for the reference amount is chosen.
    - Trans fat and saturated fat (including when written with a space) are not read as fat. "4g 당류" (4g sugars) is not read as the "g당" reference amount.
    - Sodium is in mg and the others are converted to g, rounded to two decimal places.
    - Full-width characters (㎉, ㎎, ｇ) and thousands separators are read.
    - "1g 미만" (less than 1g) is not stored as a number and is reported separately.
  - `packageText`: "총 내용량 90g은(는) 1회 제공량(45g)의 2배, 약 460kcal입니다. 한 봉지를 다 먹었으면 식사에 2회분으로 기록하세요." (The total content of 90g is 2 times the serving (45g), about 460kcal. If you ate the whole bag, record it as 2 servings in the meal.)
  - `isCoupangUrl`: Decides only by string whether the address is a Coupang address (`coupang.com` and its subdomains). It does not open the address.
- **`frontend/src/foods.tsx` add and edit food dialog**
  - Added a "영양성분 표 붙여넣기" (paste nutrition facts table) field and a "표 읽어 채우기" (read table and fill) button at the top.
  - Reading fills only the fields it found. If the source type is "직접 입력" (manual entry), it changes it to "제품 표기" (product label), and if the check date is empty, it fills in today (Asia/Seoul).
  - The result is announced with `role="status"`: the fields filled, the fields left empty because of "미만" (less than), the fields left unchanged because they are not in the table, the total content calculation, and "값을 확인한 뒤 저장을 눌러야 저장됩니다" (it is saved only when you press save after checking the values).
  - If no table is found, it is announced with `role="alert"` and no field is changed. Only text tables can be read, and for image tables it tells the user to enter values by hand.
  - Saving is done only with the existing save button. Reading alone sends nothing to the server.
  - If the source URL is a Coupang link, guidance is shown below the field and linked with `aria-describedby`. The guidance says: stored only as the source, the app does not open it, paste the table text or enter it manually.
- The server, DB, and migrations were not changed.

## Change — 2026-11-08 (first review applied)

The first review of PR #119 (a read-only review separated from the authoring context) copied the interpreter and ran more than 40 inputs through it. It found cases where pasting a whole product page fills **wrong values** instead of empty fields (4 high, 4 medium, 4 low). Using a wrong value is worse than an empty field, so the interpreter was rewritten on the principle "read only inside the table, and only after the reference amount".

- **Applied 1 (high)** Coupang unit price marks such as "100g당 가격 2,211원" (price per 100g 2,211 won) and "(10g당 120원)" were read as a reference amount. Now if a price or "원" (won) follows "당", it is not a reference amount. When there are several reference amount candidates, the one that is followed right away by energy or a nutrient is chosen.
- **Applied 2 (high)** Review sentences before the table ("당류 0g 맞나요?" = "Are sugars really 0g?", "단백질 20g!" = "Protein 20g!") were read as values. Now it reads only from the position of the reference amount, or if there is none, only from the "영양정보/영양성분" (nutrition information/nutrition facts) heading. It does not go back to search earlier text. For energy, a value attached to "열량/에너지" (energy) is chosen first.
- **Applied 3 (high)** "(100g당 500kcal)" after a per-serving table was mixed in, so two bases ended up in one food. Fixed with the reference amount selection above and the ban on searching earlier text.
- **Applied 4 (high)** "당알코올 18g" (sugar alcohol 18g) was read as "18g당", making the reference amount 1g or 0g. Now if Korean text follows "당", it is not a reference amount.
- **Applied 5 (medium)** When there was no energy line, "2,000kcal 기준" (based on 2,000kcal) below the table was put in as calories. Now "kcal 기준" is not read as a value.
- **Applied 6 (medium)** Even when there was a reference like "1회 제공량당" (per serving) with no size, the total content was used as the basis. Now the total content is used only when there is no reference amount expression at all, and the summary says "filled based on the total content". "1회 섭취참고량" (reference intake per serving) is also read as a reference amount.
- **Applied 7 (medium)** A field reported as emptied because of "미만" actually kept its previous value. Pasting again also mixed in values of the previous product. Now "미만" and out-of-range values are actually emptied. When a new reference amount is read, the nutrient fields that are not in the table are also emptied ("fields emptied because they are not in the table"). Only when the reference amount could not be read are the fields not in the table left as they are, and it says so.
- **Applied 8 (medium)** For a food from official or public data, reading a table left the source type and date unchanged. Now reading a table always sets "제품 표기" (product label) and today's date. If the earlier source was official or public, it tells the user to check the source URL.
- **Applied 9 (low)** Decimal comma: "2,5g" is read as 2.5 and "0,125g" as 0.125. The thousands separator applies only to numbers starting with 1 to 9.
- **Applied 10 (low)** The reference amount is also rounded to two decimal places, and a reference amount of 0 or over 99,999 is discarded. A nutrient value over 99,999 is emptied and reported as "fields emptied because the value is too large".
- **Applied 11 (low)** To fit drinks too, "한 봉지를 다 먹었으면" (if you ate the whole bag) was changed to "포장 하나를 다 먹었으면" (if you ate the whole package).
- **Applied 12 (low)** So that a screen reader announces the same result even when it is read again, the result area is redrawn on every press. Editing the text clears the "찾지 못했습니다" (not found) warning.
- "N이하" (N or less) is an upper bound and that number is stored. The review also treated it as an acceptable range.
- Tests
  - `frontend/src/nutrition-label.test.ts`: Added 7 tests from the review's reproduction inputs (18 in total). They are unit price marks, review sentences before the table, a mix of different bases, sugar alcohol, "kcal 기준", a reference with no size and reference intake, a decimal comma and out-of-range values.
  - `frontend/src/foods.test.tsx`: Added 3 tests.
    - When a table is read for a food from official data, old values and "미만" fields are emptied, the source type and date change, and the guidance appears.
    - Reading the same table again announces the result again.
    - A table with no reference amount leaves fields that are not in the table as they are.
- Checks: Since the server was not changed, `npm run check` was run without a DB and passed.
  - Backend: 127 passed, 109 skipped (DB integration tests).
  - Frontend: 454 passed, 2 skipped (dark-only condition).
  - `npm run knip`: passed.
- The browser check below was done with the interpreter before these changes. After them, it was checked only with unit and screen tests.

## Change — 2026-11-08 (second review applied)

The second review (the last) fed about 40 inputs again into the fixed interpreter. It found two more paths to **wrong values** that arise because the end of the table was not defined (2 high, 3 medium, 3 low). The statement in the first round, "reads only inside the table", was still not true.

- **Applied 1 (high)** Values from a review or "함께 보면 좋은 상품" (products you may also like) after the table were put into nutrient fields that are not in the table. Now the end of the table is defined.
  - From the line after the reference amount (or heading), it reads only lines that look like table lines. A table line is a line that has a nutrient, energy, kcal, %, daily value (기준치), or content or serving size.
  - It stops at the first line that is not one.
  - It also stops before another reference amount on a later line. The head of a second column on the same line is left as it is.
- **Applied 2 (high)** Even with a heading, the "100g당" before it (product name or review) was chosen as the reference amount. Now when there is a heading, only the reference amount after the heading is looked at.
  - If there is no reference amount after the heading, the earlier candidates are not used and it is treated as the case with no reference expression (total content assumed, with a notice).
  - In this process, it was found that "1일 영양성분 기준치" (daily value of nutrients) below the table was caught as a heading, so it was excluded from headings.
- **Applied 3 (medium)** "100g당열량" (per 100g energy) written with no space could not be read as a reference amount, so the total content was assumed. If an energy, calorie, or nutrient name follows "당", it is read as a reference amount. Sugars (당류) and sugar alcohol (당알코올) are still excluded.
- **Applied 5 (medium)** Even when only the reference amount was read and no value at all, all fields were emptied. Now if no value can be read, no field is changed and it tells the user. The wording for emptied fields was changed to "fields emptied because they could not be read from the table" (they may be in the table but could not be read because of the shape).
- **Applied 6 (low)** "2000kcal를 기준으로" (based on 2000kcal) was read as calories. "kcal을/를 기준" is not a value either.
- **Split off 4, 7, 8** into [#120](https://github.com/sirloinbh/health-log/issues/120) (P4, under #83).
  - 4: A two-column table with a first column that has no size and a second column that has one. Only this case still pairs wrong values.
  - 7: A "1회 제공량당" header line with no size borrowing a nearby size.
  - 8: Sources getting mixed when only part was read without a reference amount. For now the serving size and the other values stay, the source becomes product label and today, and the guidance appears.
  - Tables where the value is on the next line, pipe tables, and tables where % comes first currently end up empty, so they were written there too.
- Tests
  - `frontend/src/nutrition-label.test.ts`: Added 5 tests (23 in total). They check reviews, other products, and the next reference amount after the table; reviews and product names before the heading; shopping text before the heading; "100g당열량"; and "kcal를 기준으로".
  - `frontend/src/foods.test.tsx`: Added "when only the reference amount is read and there is no value, no field is changed".
- Checks: `npm run check` without a DB passed (backend 127 passed, 109 DB integration skipped; frontend 460 passed, 2 skipped), and `npm run knip` passed. It was not viewed in a browser again.
- The about 40 inputs of the two reviews' reproduction scripts were run again with the new interpreter. All gave correct values or empty fields, and the only wrong value was the one case of the two-column table in #120.

## Change — 2026-11-08 (main merged again right before merging)

After the second review was applied, the #40 medication records (PR #117) were merged into main. `origin/main` was merged with no conflicts. In the README, #40 was moved to done and agent3's in-progress work was changed to #48. On the merged tree, `npm run check` was run without a DB and passed (backend 133 passed, 118 skipped; frontend 474 passed, 2 skipped). `npm run knip` also passed.

## Checks

- Tests
  - `frontend/src/nutrition-label.test.ts` (11 tests)
    - Checks an ordinary per-100g table, telling trans and saturated fat (including written with a space) from "g 당류" (g sugars), and "1회 제공량 1개(30g)" and "1봉지(45g)당".
    - Checks a table with only a total content, preferring the value after the reference amount, unit conversion and rounding, full-width characters and thousands separators, "미만", and text that is not a table.
    - Checks the total content guidance text and the Coupang address check (the spoofed domains `coupang.com.example.com` and `notcoupang.com` are rejected).
  - `frontend/src/foods.test.tsx` (3 added)
    - A pasted table fills the fields and sets the source type and check date. There is no POST before saving.
    - The save body contains the filled values and the Coupang link. The app makes no requests other than to `/api/`.
    - Text that is not a table only gives a notice and changes no field. The Coupang link guidance appears and disappears.
- `npm run check` (without a DB, because the server was not changed): passed.
  - Backend: 127 passed, 109 skipped (DB integration tests).
  - Frontend: 444 passed, 2 skipped (a dark-only condition, unrelated).
  - Skill checks: 4 passed.
- `npm run knip`: passed (at first it failed because one exported type was unused, and it was fixed).

### Browser check

A real API (127.0.0.1:3971) and Vite (5271) were started on a temporary PostgreSQL 17 (5471, `health_test`), and the food screen was opened in headless Chrome (debugging 9671). In "음식 추가" (add food), a potato chip table was pasted (total content 90g, 230kcal per 1 bag (45g), sugars less than 1g, and so on).

| Item                                                                                                                                        | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| After "표 읽어 채우기": serving size 45 g, calories 230, sodium 210, sugars empty, check date 2026-11-08                                    | Pass    | Pass     |
| Source type "제품 표기" (product label), result guidance (fields filled, less than, 2 times and about 460kcal, it is saved only when saved) | Pass    | Pass     |
| Putting a Coupang link in the source URL shows the guidance                                                                                 | Pass    | Pass     |
| The food appears in the list only after pressing save                                                                                       | Pass    | Pass     |
| 0 requests sent by the page to Coupang (`performance.getEntriesByType('resource')`)                                                         | Pass    | Pass     |
| No horizontal overflow in the dialog                                                                                                        | Pass    | Pass     |

- Following the decision, a real Coupang product page was not opened. The link used for the check (`https://www.coupang.com/vp/products/1234567`) was stored only as a string.
- After the check, Chrome, Vite, the API, and the temporary DB were all shut down.

## Limits and follow-ups

- Only text tables are read. Tables that exist only as images are handled in #47 (photo recognition).
- If the table shape is very different, some fields may not be found. In that case it tells the user which fields were not found and has them enter them by hand.
- Filling from the MFDS DB is considered in #118.
