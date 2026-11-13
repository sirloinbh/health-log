# Nutrition data writing rules

Food nutrition values must be verifiable later. These rules apply to the research issues (#31, #32, #33) and to manual entry.

## Values

- Store nutrition **per serving**. If the product label is per 100g, write the serving as `100`, `g`.
- For sources such as the Ministry of Food and Drug Safety (MFDS) food nutrition DB, which give values per 100g (or 100mL) together with the total content, **convert to the total content** and store that. If there is no total content, store it as 100g (100mL). When you compare with the source, convert back to a per-100 value first.
- A food name may be written in the words people search for. If it differs from the official name, confirm it on the source page. For example `돈가스(돈까스)` (pork cutlet) and `닭가슴살(삶은것)` (chicken breast, boiled).
- If there are several records for the same food, choose in this order: **measured analysis value → collected value → calculated value, records whose total content differs from the reference amount, eating out → home cooking → institutional meals, newest creation date**. The source itself calls calculated values reference values, so use them only when there is no analysis record. A total content of `100g` or `-` means there is no per-portion information.
- When you look for candidates, also look for the other spellings in the source. Spacing and word order differ, so the exactly matching name misses them. For example `짜장면` (jajangmyeon) is `자장면`, `참치김밥` (tuna gimbap) is `김밥_참치`, and `제육볶음` (stir-fried pork) is `돼지고기볶음(제육볶음)`.
- Calories are in kcal, carbs, protein, fat, and sugars in g, and sodium in mg.
- **Leave an unknown value as NULL. Do not write 0.** Use 0 only when it really is 0. A value given only as a range, such as "less than 1g", is also NULL.
- For a packaged product (#32), write the total content at the end of the name (`갈비탕 400g`, galbitang, beef rib soup), and write the reference amount of the nutrition label as the serving. If the two are the same, the label is per total content, and if the serving is smaller, the label is per part of the weight.
- Store numbers to two decimal places. The screen and the API reject finer values.
- The checked date cannot be in the future.
- If the same menu item comes in different sizes, tell them apart by name. For example `와퍼` (Whopper) and `와퍼 주니어` (Whopper Junior).
- Foods are told apart by the combination of name and brand, and cannot be registered twice.

## Sources

| `source_type` | Meaning                                 | Source URL | Checked date |
| ------------- | --------------------------------------- | ---------- | ------------ |
| `official`    | Official data of the maker or the brand | Required   | Required     |
| `public`      | Public food nutrition data              | Required   | Required     |
| `label`       | What is printed on the product package  | Optional   | Required     |
| `estimate`    | An estimate                             | Optional   | Optional     |
| `manual`      | Manual entry (source unknown)           | Optional   | Optional     |

- Do not write an estimate as `official`.
- Numbers copied onto a shopping site or a blog are not `official`. If you cannot find the original, write `estimate`. The product label on an official shop run directly by the maker (for example CJ CheilJedang CJ The Market, #32) is `official`.
- The official tables of franchises (#31) usually have only saturated fat and no total fat or carbs. Do not put saturated fat in `fat`. Leave a missing value as NULL.
- If a table is published only as an image, enlarge it and read it, then read it once more separately to match. Also compare with the daily value percentages written in the table (protein 55g, sodium 2,000mg). Write the URL of that image as the source URL. The method and the result are in the [#31 record](changes/31-franchise-foods.md).

## Adding research data

Add research data with a `database/migrations/NNN_foods_<name>.sql` migration. The form below does not create a duplicate food with the same name and brand when it runs again, and it changes the values **only when the checked date of the research is newer than the checked date of the existing values**.

What happens to a value fixed on the screen after a rerun depends on what was fixed.

| What was fixed on the screen                      | When the same research is run again           |
| ------------------------------------------------- | --------------------------------------------- |
| Checked date left as it is or made newer          | The fixed value stays                         |
| Checked date cleared                              | The fixed value stays                         |
| Checked date changed to earlier than the research | Overwritten with the research value           |
| Name or brand changed                             | One more food appears from the research value |

```sql
INSERT INTO foods (name, brand, category, serving_size, serving_unit, calories, carbs, protein, fat, sugars, sodium, source_type, source_url, checked_on, is_junk)
VALUES
  (U&'\C608\C2DC', U&'\BE0C\B79C\B4DC', NULL, 100, 'g', 250, NULL, 10, 8, NULL, 500, 'official', 'https://example.com/nutrition', '2026-10-31', true)
ON CONFLICT (name, COALESCE(brand, '')) DO UPDATE SET
  category = EXCLUDED.category,
  serving_size = EXCLUDED.serving_size,
  serving_unit = EXCLUDED.serving_unit,
  calories = EXCLUDED.calories,
  carbs = EXCLUDED.carbs,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  sugars = EXCLUDED.sugars,
  sodium = EXCLUDED.sodium,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  checked_on = EXCLUDED.checked_on,
  updated_at = now()
WHERE EXCLUDED.checked_on > foods.checked_on;
```

- **The junk food flag (`is_junk`, #38) is set only on the first insert.** Franchise fast food menu items (burger, pizza, and chicken franchises and so on) go in as `true`, and other foods as `false`. Do not put it in `DO UPDATE SET`. That way a flag the user changed on the screen stays when a new research updates the food. A meal record keeps its own flag from when it was recorded, so changing the flag does not change the totals of past records.
- `backend/test/foods.integration.test.ts` runs the example above as it is and checks it. If you change the form, check the test too.
- **Write a checked date in research data whatever the source type is.** Without a date, a later research cannot update it.
- **A food with no date is not changed by research data.** This protects values entered by hand on the screen. To change it to the research value, use the correction method below.
- **Do not use the form above to correct a value with the same date.** With the same date the row is ignored without an error, and the wrong value stays. Correct it with an `UPDATE` migration as below, with a condition so that it changes only when the wrong value is still there. That way a value fixed later is kept when it runs again.

  ```sql
  UPDATE foods SET calories = 510, updated_at = now()
  WHERE name = U&'\C608\C2DC' AND brand = U&'\BE0C\B79C\B4DC' AND calories = 500;
  ```

- Write Korean in SQL as `U&'\C608\C2DC'` (the example word 예시, "example"), with one backslash before each code value.

When you apply it to an existing DB, **a food of the same name with an earlier date is changed to the research value.** If there is user data, check the foods whose names overlap before you apply it. The values of meal records that are already registered do not change.

## Looking up the MFDS DB

- Detail page (source URL): `https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd=<food code>&searchRegionCd=ZZ&searchMonthCd=AVG`
- For the list, give `listJson.do` on the same path `searchText`, `dbGrpCm=D` (food) or `dbGrpCm=R` (raw material), `searchDetailMode=all`, `searchOper=AND`, `searchOrderby=CAL`, `pagenum`, `pagesize`, and `searchPageCnt`. Without `searchOrderby`, an empty result comes back with no error.
- When you read the public pages, leave a gap between requests. If you must fetch a lot, it is more stable to use a key for the Open API of the public data portal (`FoodNtrCpntDbInfo03`).
- Windows `curl` can garble Korean in its arguments. Use Node `fetch`.

## Verification

For a research issue, compare a sample with the source again as the done criteria of that issue say, and record the result in the change record.
