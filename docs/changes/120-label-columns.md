# #120 Two-column tables and the remaining table shapes in nutrition label paste

- Issue: [#120](https://github.com/sirloinbh/health-log/issues/120)
- Branch: `feat/120-label-columns`

## Purpose

Read the table shapes left over from the nutrition label paste in #35. First fix the two-column table that still gave **wrong values**: a table where the first column has no size and the second column has a size.

Korean label words that the parser matches on are kept as they are, with a gloss on first use. Main ones: "총 내용량당" (per total amount), "1회 제공량당" (per serving), "1회 제공량" (serving size), "총 내용량" (total amount), "열량" (calories), "당류" (sugars), "나트륨" (sodium), "단백질" (protein).

## Decisions

The items the issue left to judgment were decided as follows. They were also left as an issue comment.

- **Two-column table:** values are always read from the first column, so the basis amount also comes from the first column of the header row.
  - If the first column is "총 내용량당" with no size, the size of "총 내용량 300g" is used.
  - If there is no total amount size either, the basis amount is treated as unknown.
- **"1회 제공량당" with no size:** the size is borrowed from the nearest "1회 제공량 30g" in the same table, whether it comes before or after. The total amount size is not borrowed, because it is not a serving size.
- **When values are read without a basis amount:** no field is changed. The values read are shown as a list, and the user is told to check the serving size and enter it by hand.
  - Putting values of unknown basis next to a serving size from another source would mix two sources (for example 310 kcal of unknown amount next to 120g from an official source).
  - In #35, only the fields that were found were changed in this case.

## Change — 2026-11-08

- **`frontend/src/nutrition-label.ts`**
  - Basis candidates now have a kind (`per`, `serving`, `total`). A "총 내용량당" with no size is also read as a candidate.
  - When a header row has several basis amounts, the first candidate of the same row is used as the basis amount.
  - A "1회 제공량당" with no size borrows the size of the nearby "1회 제공량 N".
  - It reads the 2021 notation format: total amount and calories come above the "총 내용량당" header.
    - In this case the table is read from the "총 내용량 N" line.
    - The "next basis amount" that ends a table is looked for only after the line of the chosen basis amount.
  - It skips the column separator bar (`|`) between name and value, line breaks, and a leading ratio (`15%`).
  - A line with only a value (`300mg`) is also treated as a table line.
- **`frontend/src/foods.tsx`:** when values are read without a basis amount, no field is changed, and `alert` shows "1회 제공량을 찾지 못해 아무 칸도 바꾸지 않았습니다" (the serving size was not found, so no field was changed) and the list of values read. A branch that is no longer used after that was cleaned up too.

## Change — 2026-11-08 (first review applied)

The first review of PR #121 (a read-only review separate from the authoring context) fed about 40 identical inputs to the new parser and to the main parser and compared them. It found 4 paths that newly give **wrong values** because of this PR's change. The first note below that "no case of a wrong value remains" was not true.

- **Applied 1 (high)** Column bars were skipped however many there were, so for a row whose first column is empty (`당류 | 5g`, `당류 | | 5g`) the second column value was read as the first-column basis amount.
  - Now a row with bars is split into columns, and only the name and the first-column value are kept (`firstColumn`).
  - The number of columns is counted with the number of columns of the header row. If the count equals the header's, name and first value are in one column; if it is one more, the name is in its own column. If it does not match, the value is not trusted.
  - Skipping bars between values was removed.
- **Applied 2 (high)** The "first candidate of the same row" rule also applied to text pasted on one line, so `1회 제공량 1개(30g) 총 내용량 60g 100g당 열량 500kcal` was read with a 30g basis.
  - Now heads are treated as one header row only when there are only separators (space, tab, `|`, `/`) between them (`headRow`). A lead-in word of the next head ("총 내용량(", "1회 제공량(", "1개(", that is 1 plus 1 to 3 Hangul characters) is allowed.
  - A line break is not a separator.
- **Applied 3 (medium to high)** Size borrowing reached outside the table, so it borrowed sizes from a product review ("1회 제공량 30g 정도 먹어요", about 30g a serving) or from another product.
  - Now it borrows only within the range where the table was actually cut. The range runs from the heading to the end of the table, and if there is no heading, from the table lines that continue right above the table.
  - The "(1회 제공량 50g)" that ended the table is included.
- **Applied 4 (medium)** The size of "총 내용량당" was taken from the first "총 내용량 N" of the whole document, so it used the whole bundle above the heading (500g). Now it uses the "총 내용량 N" nearest to that head after the heading. The start line of the 2021 format is decided by the same value.
- **Applied 5 (low)** "1회 섭취참고량 30g" (reference intake per serving) lent its size to "1회 제공량당". Now it borrows only from "제공량". This matches the decision comment.
- **Applied 6 (low, an old problem)** A table with two heads on upper and lower lines and the columns copied one line at a time (`100g당\n1회 제공량(30g)당\n열량\n250kcal\n75kcal`) cannot tell which value belongs to which column. Now the basis amount is treated as absent. The screen changes no field and only shows the values read.
- While fixing, two regressions were found with probes and fixed. One was that the `\s` of the separator pattern between heads accepted a line break and tied even the upper line "1회 제공량 30g" into one header row. The other was that, as a result, the row's column count did not match and the value was thrown away.
- Tests: added 5 to `frontend/src/nutrition-label.test.ts` with the inputs that reproduce the review (32 tests).
- All of the review's probes (about 40) and the probes of the two reviews of PR #119 (about 40) were run again.
  - The probes run then were all correct values or empty fields. The inputs of review items 1, 2, 3, and 4 became correct or empty.
  - It was written that "no case got worse than main", but the second review found 2 wrong-value paths created by this fix (second review, applied 1 and 2 below).
- Check: `npm run check` without a DB passed (frontend 483 passed, 2 skipped; backend 133 passed, 118 DB integration skipped), `npm run knip` passed.

## Change — 2026-11-08 (second review applied)

The second review (the last) confirmed that the 4 first-review fixes hold (74 tests passed). But it found 2 **wrong-value** paths newly created by the first-review fixes, and 2 wrong values in the two-column table that had existed before. All four are within the two-column table scope of this PR, so they were fixed here.

- **Applied 1 (high, created by this PR)** It borrowed a size from "영양정보 1회 제공량 50g" (nutrition information, serving 50g) of the next product that ended the table. Now a size notation that ended the table is borrowed only if no values follow it. The footnote "(1회 제공량 50g)" at the end of a table is still borrowed.
- **Applied 2 (medium, created by this PR)** When there was no heading, the "table lines" continuing above the table were taken too broadly, and it borrowed a size from a review stuck above it ("1회 제공량 40g씩 먹어요", I eat 40g servings). Now, with no heading, it borrows only when the single line right above is a line with only a size ("1회 제공량 30g", "(1회 제공량 1개(30g))").
- **Applied 3 (high, old)** When a web table is copied, columns are split by tabs, but tabs were turned into spaces, so the second column value went into an empty first column ("당류 5g").
  - Now tabs are turned into column bars and read column by column, like a bar table.
  - A ratio column on its own ("300mg 15%") is not counted as a value column.
- **Applied 4 (high, old)** When the first column head of a bar header row was not recognized (`총 내용량 500ml | 100ml당`, `1병 | 100ml당`), the first column value was paired with the second column basis amount.
  - Now, if the chosen head is not the first value column, the basis amount is treated as absent.
  - If the first column of the header row is a name column (empty, or 구분, 항목, 영양성분, 영양정보, 성분), the next column is the first value column.
  - The same fix also makes a table like "구분 | 100g당 | …" read correctly without shifting columns.
- **Fixed along with it (part of review item 5)** A row with bars at both ends of the line (Markdown table shape) does not count the end bars as columns.
- **Split off** The rest of review item 5 and item 6 were split into [#122](https://github.com/sirloinbh/health-log/issues/122) (P4, under #83).
  - Item 6, `1회 제공량 30g (100g당)`, gives the same wrong value on main.
  - The rest are the Markdown `|---|` line, rows whose column count differs from the header row, and the 2021 Coupang header row. For now they end as empty fields.
- The review's probes (compared side by side with main) and the earlier probes were all run again.
  - The inputs of review items 1 to 4 are now "no basis amount". No field is changed.
  - Of the 4 whose result changed from the first-review state, 3 changed from a correct value to "no basis amount" (ambiguous header rows and footnotes). None became a wrong value.
  - 1 (the ratio column of a tab table) was a regression, fixed in applied 3 above.
- Tests: added 5 to `frontend/src/nutrition-label.test.ts` (37 tests). They check the next product's size and footnote, a size line right above, the empty first column and ratio column of a tab table, an unrecognized first column head, and the name column and Markdown end bars.
- Check: `npm run check` without a DB passed (frontend 488 passed, 2 skipped; backend 133 passed, 118 DB integration skipped), `npm run knip` passed.

### Browser re-check after the review changes

After the second-review changes, it was checked again in the "Add food" dialog by the same method (temporary DB, real API 127.0.0.1:3971, Vite 5271, headless Chrome 9671).

| Pasted table                                                                    | Result                                                  | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------- | -------- |
| Two-column table `총 내용량당 \| 100g당`                                        | 300g, 900kcal, 600mg                                    | passed  | passed   |
| "1회 제공량당" with no size, "1회 제공량 30g" above it, rows with bars and ratios first | 30g, 150kcal, 90mg, a notice about 2x                   | passed  | passed   |
| Two-column table split by tabs, `당류\t\t5g` (empty first column)               | 100g, 250kcal, 300mg, sugars left empty                 | passed  | passed   |
| `열량 310kcal 단백질 12g` (no basis amount)                                     | Fields unchanged, a warning and the list of values read | passed  | passed   |
| Horizontal overflow of the dialog                                               | none                                                    | passed  | passed   |

- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.

## Verification

- Tests
  - `frontend/src/nutrition-label.test.ts`: added 4 (27 tests).
    - Two-column table: first column without a size, no total amount either, a size in the first column
    - Borrowing the size for "1회 제공량당": before, after, and the total amount is not borrowed
    - Values with bars, line breaks, and a ratio before them, and the 2021 format
  - `frontend/src/foods.test.tsx`
    - Changed to "values without a basis amount are shown and no field is changed" (replacing the "leave as is" test of #35).
    - Changed the input of the "when only the basis amount is read and there are no values" test. The earlier input (`나트륨 15% 300mg`) is now a readable shape and no longer shows that case.
- About 40 reproduction inputs from the two reviews of PR #119 were run again with the new parser.
  - All were correct values or empty fields.
  - The pipe table, the line-break table, the percent-first table, and the two-column table with a size-less "1회 제공량당", which were empty fields in #35, now read correct values.
  - No case of a wrong value remains (the first and second reviews found wrong-value paths created by this PR and they were fixed; see the review sections above).
  - Along the way, a regression where calories dropped out of the 2021 format was found by this rerun and fixed.
- `npm run check` (without a DB, no server change): passed.
  - Backend: 133 passed, 118 skipped (DB integration tests)
  - Frontend: 478 passed, 2 skipped (dark-only conditions, unrelated)
  - Skills check: 4 passed
- `npm run knip`: passed.

### Browser check

The real API (127.0.0.1:3971) and Vite (5271) were started on a temporary PostgreSQL 17 (5471), and the "Add food" dialog was opened with headless Chrome (9671).

| Pasted table                                                                                     | Result                                                                                                              | 390×844 | 1440×900 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `총 내용량당 \| 100g당`, `총 내용량 300g`, `열량 900kcal \| 300kcal`, two columns of sodium     | Serving size 300g, calories 900, sodium 600                                                                         | passed  | passed   |
| `1회 제공량 30g`, `1회 제공량당 \| 총 내용량당`, `열량 \| 150kcal \| …`, `나트륨 15% 90mg \| …` | 30g, 150, 90, a notice about 2x the total amount                                                                    | passed  | passed   |
| `열량 310kcal 단백질 12g` (no basis amount)                                                      | Fields unchanged, a warning and "읽은 값: 칼로리 310kcal, 단백질 12g" (values read: calories 310kcal, protein 12g) | passed  | passed   |
| Horizontal overflow of the dialog                                                                | none                                                                                                                | passed  | passed   |

- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.
