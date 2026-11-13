# #122 Remaining table shapes in nutrition label paste

- Issue: [#122](https://github.com/sirloinbh/health-log/issues/122)
- Branch: `feat/122-paste-more-shapes`

## Purpose

Read the table shapes that were split off in the second review of PR #121. First fix `1회 제공량 30g (100g당)` (serving 30g (per 100g)), which put in **wrong values**. After that, read the shapes that now end as empty fields. Shapes that cannot be read still change no field, as now.

Korean label words that the parser matches on are kept as they are, with a gloss: "1회 제공량" (serving size), "총 내용량" (total amount), "…당" (per …), "기준" (basis), "열량" (calories), "당류" (sugars).

## Decisions

- **`1회 제공량 30g (100g당)`:** the basis amount is treated as absent. The screen changes no field and only shows the values read.
  - It says serving size, and the parentheses say per 100g. One line of values cannot be the values of both, and the text alone does not tell which.
  - The opposite shape `100g당 (1회 제공량 30g)` is still read as 100g. "당" is attached only to 100g, and the parentheses add the serving size.
  - If the parentheses hold the same size (`1회 제공량 30g (30g당)`), it is read as 30g.
- **Rows with too few columns:** only when the other rows of the table write the name in its own column (`열량 | 250kcal | 75kcal`) is the value of a short row (`열량 | 250kcal`) read as the first-column value.
  - It is assumed that copying drops empty columns at the end of a row, while an empty column in the middle stays as an empty column like `당류 | | 5g`.
  - In a table that writes the name and the first value in one column (`열량 250kcal | 75kcal`), `당류 | 2g` means "the first column is empty", so it is left empty as now.
  - If every row is short, it cannot tell which case it is, so it is left empty.

## Change — 2026-11-08

- **`frontend/src/nutrition-label.ts`**
  - The size of a serving is read first from the size written right after it. Before, it looked for the `1개(30g)` form and skipped ahead to `30g (100g`, reading 100g as the serving. A size in parentheses is used only when there is no size before it (`1회 제공량 1개(30g)`).
  - If another basis amount is inside the parentheses right after the serving head, the basis amount is treated as absent (`bracketedBasis`, widened in the first-review changes).
  - It reads the 2021 Coupang format `1회 제공량당 | 1일 영양성분 기준치에 대한 비율` (per serving | percent of the daily nutrient reference value).
    - The head of the ratio column is not counted as a value column (`shareHead`).
    - When checking whether values follow, that head is skipped. So "1회 제공량당" becomes the basis amount, and the size is borrowed from "1회 제공량 30g" in the same table (the #120 rule).
    - An empty column at the end of a row (`열량 150kcal |`) is not counted as a column.
  - The `|---|` line of a Markdown table is removed. A `---` line without bars can be a line that separates two products, so it ends the table as now.
  - Rows with too few columns are read as in "Decisions" above (`namesInOwnCell`).
  - The list of name columns was widened: 구분, 항목, 내용, 영양성분(명), 영양정보, 영양소(명), 성분(명), and those with "(단위)" (unit) after them.

## Shapes that are not read (empty fields)

The shapes below still change no field. They can be entered by hand. The same list was left as an issue comment.

- A serving head that has a size different from the serving size together with it (the rule after the second review)
  - Examples: `1회 제공량 30g (100g당)`, `… (100g 기준)`, `… (100g 중)`, `… (100g)`, `… (100ml당)`, `약 30g (100g당)`, `30g, 100g당`, `1회 제공량 2개(30g) 기준 1개 15g`
  - The same holds when the basis amount of the heading line (`영양정보 (100g당)`) is a size different from the serving.
  - The total amount (`총 내용량 300g`, `총 2회 제공량(60g)`), a price (`100g당 2,211원`), and a weight in another unit (`200ml (206g)`) are not seen as a different size.
- A table in which every row has fewer columns than the header row
- A row with too few columns in a table that writes name and first value in one column (`당류 | 2g`)
- A table where the unit is attached to the name instead of the value (`열량(kcal) | 250`)
- A size-less "1회 제공량당" table with no "1회 제공량 N" in the same table (the #120 rule)
- Name columns other than those listed above (for example "영양성분 함량")
- A row with an empty ratio column in a table where the ratio column sits between value columns (`열량 | 250kcal | | 75kcal`)

## Verification

- Tests: added 5 to `frontend/src/nutrition-label.test.ts` (42 tests).
  - Another basis amount in parentheses gives "no basis amount", while `100g당 (1회 제공량 30g)` and `1회 제공량 1개(30g)` stay as they are
  - The bar table and tab table of the 2021 format, and `열량 | 120kcal` after the ratio column head
  - The `|---|` line of a Markdown table, and the table ending at a `---` without bars
  - Rows with too few columns: a table that writes names separately, a tab table, a table that writes name and value in one column, and a table where every row is short
  - 5 widened name columns
- The reproduction inputs of the issue and the two reviews of PR #121 were run side by side with the main parser.
  - Of the old reproduction inputs run then, the only one whose result differs from main was `1회 제공량 30g (100g당)` (100g became "no basis amount"). The newly read shapes (2021 format, Markdown, short rows, name columns) naturally differ from main.
  - About 30 new inputs are all correct values or empty fields.

## Change — 2026-11-08 (first review applied)

The first review of PR #123 (a read-only review separate from the authoring context) ran about 50 inputs side by side with the main parser. There were no wrong values in the newly read shapes (2021 format, Markdown, short rows). But the parentheses rule slipped through depending on how the text was written.

- **Applied 1 (high, created by this PR)** `1회 제공량 30g (100g 기준)` has no "당", so it was not a basis candidate, and after the size regex change it became 30g (main gave 100g).
- **Applied 2 (high, same on main)** For `1회 제공량 약 30g (100g당)` (about), `1회 제공량은 30g …` (is), and `1회 제공량 1/2봉지 30g …` (half a bag), the size regex read the 100g in the parentheses as the serving. Then the parentheses rule had no second head to compare. The "fixed" in the first note was true only when the size comes right after the word.
- **Applied 3 (high, same on main)** For `1회 제공량 1개(30g) (100g당)` and `1회 제공량(30g) (100g당)`, `) (` was not accepted as a separator between heads, so they became 30g.
- **Applied 4 (medium, same on main)** `(1봉지 100g당)` (per bag, 100g), `[100g당]`, `, 100g당`, `/ 100g당`, and a serving under the heading line `영양정보 (100g당)` became 30g.
- How it was fixed: `bracketedBasis`, which compared candidates with each other, was replaced by a rule that looks at the whole text of the serving head.
  - The head runs from the serving size to just before the calorie or nutrient name on that line. A header row with bars is a column header row, so it is excluded.
  - If the head has two or more sizes and one of them is a basis amount ("…당", "… 기준"), there is no basis amount.
  - If the "총 내용량당" inside the head is a size different from the serving, there is no basis amount.
  - If the heading line has a basis amount of a size different from the serving, there is no basis amount.
  - Sizes without a basis mark, like `1회 제공량 200ml (206g)`, `1회 제공량 1개(30g)`, and `1회 제공량(30g)당`, are seen as the same serving and read as they are.
- **Applied 5 (medium)** The "shapes that are not read" and the "only one differs from main" sentences in this document were corrected to match the facts.
- **Applied 6 (low)** The change of `1회 제공량 200ml (206g)` from 206g to 200ml was fixed with a test.
- **Left (low)** A row whose ratio column sits between value columns and is empty gets an empty calories field. It is not a wrong value, so it is written under "shapes that are not read".
- Tests: added the 11 inputs above plus 200ml and `1회 제공량(30g)당` to the existing tests (still 42 tests).
- The review's probes and the earlier probes were all run again. All are correct values or empty fields. `1회 제공량: 1개 (30g) / 100g당` is also "no basis amount" now.

## Change — 2026-11-08 (second review applied)

The second review (the last) ran about 120 inputs side by side with the main parser. There were no wrong values in the newly read shapes (ratio column, Markdown, short rows, name columns). Two things came out of the first-review rule.

- **Applied 1 (high, created by this PR)** Words that are not "당" or "기준" (`(100g 중)` (of), `(100g에 대해)` (about), `(100g 함량)` (content), `(100g 대비)` (compared with), `(100g/당)`) were not seen as basis marks. So after the size regex change, values for a 100g basis were paired with 30g (main gave 100g).
  - Now if the serving head has another size of the same unit, there is no basis amount even without a basis mark. `1회 제공량 30g (100g)` is the same.
  - Another size with a basis mark means no basis amount even if the unit differs (`30g (100ml당)`).
- **Applied 2 (medium, created by this PR)** Tables that were correct became empty fields.
  - A head that writes the serving's own "30g당" together with the total amount (`1회 제공량 30g당 (총 내용량 300g)`)
  - A price on the heading line (`영양정보 총 내용량 300g (100g당 2,211원)`)
  - Now the total amount (the size right after `총 …`, including `총 2회 제공량(60g)`) and a price ("가격" (price), "N원" (N won)) are not seen as another basis amount.
- **Applied 3 (medium)** The "shapes that are not read" in this document were corrected to match the rule above.
- **Left (low)**
  - A dash line that contains bars, like `--- | ---`, is removed as a Markdown separator line. This is as decided.
  - The short-row rule relies on the assumption that "copying drops only the empty columns at the end of a row". The assumption is written under "Decisions" above.
  - `1회 제공량 2개(30g) 기준 1개 15g` and `1회 제공량 3g 2봉(6g)` are now "no basis amount". They have two sizes, so they are left empty.
- Tests: added the 12 inputs above to the existing tests (still 42 tests).
- The review's probes, the earlier probes of this PR, and the probes of the PR #121 review were all run again. All are correct values or empty fields.
- By the rule, there is no third review.
