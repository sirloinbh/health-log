# #31 Register nutrition facts for 5 burger franchises

- Issue: [#31](https://github.com/sirloinbh/health-log/issues/31)
- Branch: `feat/31-franchise-foods`

## Purpose

Let the user search and record menu items from McDonald's, Burger King, Lotteria, KFC, and Mom's Touch using the official nutrition facts each brand publishes, not estimates.

## Decisions

The recommendation in the issue was followed and decided without asking the user. The same content was left as an issue comment.

- **Scope:** Single burgers sold in Korea, plus the sides and drinks that come in sets.
  - Burgers: all single burgers on each brand's menu page.
  - Sides: the french fries that come with a set by default, per set size.
  - Drinks: the set soft drinks (cola, cider/Sprite, Fanta, zero drinks), per set size.
  - Set menus themselves, desserts, coffee, sauces, bottled drinks, and breakfast items (McMorning and so on) were not included.
  - KFC's Twister (wrap) and All That Cheese Dog are classified as burgers because the source puts them in the BURGER section.
- **Values:** Only official data is used (`source_type = 'official'`). Each menu item has a source URL and a check date (2026-11-08).
  - The serving size is the weight in the source. McDonald's drinks use `ml`, as the source states. For KFC and Mom's Touch, drinks also use `g`, following the table headers ("제공량(g)" = serving (g), "중량(g)" = weight (g)). Lotteria's "총중량" (total weight) has no unit, so using `g` for its drinks and fries is an assumption of this work.
  - None of the five publish total fat and carbohydrate, only saturated fat. Saturated fat is not total fat, so `fat` and `carbs` are NULL (unknown). Only energy, sugars, protein, and sodium are filled in.
  - Names follow the source. McDonald's ® and ™ marks were removed to match search terms. For Lotteria, the names from the brand's menu list were used. So the "(버터번)" (butter bun) added to the product page title is not in Classic Cheese Burger and Double Classic Cheese Burger.
- **Junk food:** Following the #38 rule, all are inserted with `is_junk = true`, and it is not in `DO UPDATE SET`.
- **Migration number:** `013_foods_franchise.sql`. main has up to 011, and 012 is used by agent1 (#45, PR #103). The runner rejects a new file numbered below an already applied one, so a number after it is used.
  - **Merge order:** Merging #103 (012) first is preferable. If this PR goes in first and 013 is applied to some DB, the later 012 is rejected on that DB. In that case, change #45's number to 014.

## Sources and how they were read

On 2026-11-08, the robots.txt of the five sites was checked. Sources that need login, CAPTCHA, or a file download were not used.

- McDonald's, Burger King: `User-agent: *` / `Allow: /`.
- KFC, Mom's Touch: the robots.txt URL returns the site's front page HTML. There is no rules file.
- Lotteria: for the AI/LLM crawler group (`ClaudeBot`, `anthropic-ai`, and others) it has `Crawl-delay: 5`, `Allow: /brand/`, `Allow: /products/`, `Disallow: /api/`, and so on.

| Brand       | Source                                                                                                                                                           | Form                                                             | Update mark                    | Menu items |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ---------- |
| McDonald's  | [Nutrition information](https://www.mcdonalds.co.kr/kor/menu/information/nutrition)                                                                              | Table on the page (official API `/api/v1/kor/product/nutrition`) | 2026.11.07                     | 33         |
| Burger King | Nutrition popup on the menu detail page `https://www.burgerking.co.kr/menu/detail/<menu code>`                                                                   | Table in a popup (official API `BKR0347`)                        | None                           | 37         |
| Lotteria    | Product introduction `https://www.lotteeatz.com/products/introductions/<product ID>`                                                                             | Table rendered by the server for each product                    | None                           | 33         |
| KFC         | "영양정보표" (nutrition table) popup image on the menu detail page [info_nutrition.png](https://www.kfckorea.com/nas/kfcimg/info/info_nutrition.png)             | One table image                                                  | Ver. 20261103                  | 26         |
| Mom's Touch | "영양성분" (nutrition facts) popup image on the menu detail page [1793066787-WGNKI.jpg](https://www.momstouch.co.kr/upload_file/delv_guide/1793066787-WGNKI.jpg) | One table image                                                  | Issued 2026.10.22 ("배포일자") | 35         |

- **McDonald's, Burger King:** The official pages were opened in headless Chrome, and the responses of the official APIs the pages called and the rendered tables were read.
- **Lotteria:** robots.txt allows AI crawlers only `/products/`, forbids `/api/`, and asks for a 5-second request interval. Only the product introduction pages were fetched, at 5-second intervals.
- **KFC, Mom's Touch:** They publish only a table image shown inside the page. The image was enlarged 3 to 4 times in Chrome and cut into sections to read. Three checks were done to prevent misreading.
  - **Double entry:** Another agent read the same enlarged image separately. Weight, energy, sugars, protein, and sodium all matched for all 61 rows.
  - **Ratio cross-check:** The daily value ratios printed in the table (protein 55g, sodium 2,000mg) were automatically checked against the transcribed values to within 2.5 percentage points, for all 61 rows.
  - **Names:** Blurry menu names were confirmed against the text on each brand's menu page (칰폴레맵, 올댓, 쿵파오, 휠렛, and so on).
- Extraction and SQL generation were done with working scripts. If a value was empty or a name was duplicated within the same brand, the script stopped without generating SQL.

## Menu items not found

| Brand       | Menu item                                                                                                                               | Reason                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Burger King | 프렌치프라이(R), 프렌치프라이(L) (French fries R, L)                                                                                    | No row in the official nutrition table                                                                        |
| Burger King | 코카콜라·코카콜라 제로·스프라이트·스프라이트 제로·닥터페퍼 제로 (R, L) (Coca-Cola, Coca-Cola Zero, Sprite, Sprite Zero, Dr Pepper Zero) | No row in the official nutrition table, or all values in the "코카콜라" (Coca-Cola) row are 0 (not published) |
| Burger King | 트러플 머쉬룸 와퍼 (Truffle Mushroom Whopper)                                                                                           | The official table has two rows with different values (735kcal, 761kcal), so it is unclear which is right     |
| Lotteria    | 한우불고기버거 (Hanwoo Bulgogi Burger)                                                                                                  | The product page has only an energy range (684~1,320kcal) and no other values                                 |

- Other duplicate rows in the Burger King table were included. The Hot Truffle Mushroom Whopper differed only in the caffeine column, and the Beef Bulgogi Burger was the same except for one row with all values 0.
- KFC "트위스터 (범계역)" (Twister, Beomgye Station) was not included because it is a value for one store only.

## Change — 2026-11-08

- **DB** `database/migrations/013_foods_franchise.sql`: 164 menu items. It follows the format in docs/food-data.md (`ON CONFLICT … WHERE EXCLUDED.checked_on > foods.checked_on`), and Korean text is written with `U&` escapes.
  - McDonald's: burgers 21, sides 2, drinks 10.
  - Burger King: burgers 37.
  - Lotteria: burgers 28, sides 2, drinks 3.
  - KFC: burgers 12, sides 2, drinks 12.
  - Mom's Touch: burgers 29, sides 2, drinks 4.
- **Docs** `docs/food-data.md`: Added rules for entering official franchise data (when only saturated fat is given, and tables published only as images).

## Checks

- **Random cross-check** (completion criterion of the issue): 5 random items were picked per brand, and their sources were fetched again and compared. All 25 matched.
  - McDonald's, Burger King, Lotteria: the source was fetched again and compared with a script.
  - KFC, Mom's Touch: the image was fetched again and confirmed to be byte-identical to the first file. The relevant row was cut out again and re-read.

  | Brand       | Menu item                      | Registered values (weight/energy/sugars/protein/sodium) | Re-read values     | Result |
  | ----------- | ------------------------------ | ------------------------------------------------------- | ------------------ | ------ |
  | McDonald's  | 환타 미디엄                    | 425/62/16/0/16                                          | 425/62/16/0/16     | Match  |
  | McDonald's  | 코카 콜라 제로 미디엄          | 425/0/0/0/34                                            | 425/0/0/0/34       | Match  |
  | McDonald's  | 코카 콜라 제로 라지            | 610/0/0/0/47                                            | 610/0/0/0/47       | Match  |
  | McDonald's  | 슈비버거                       | 269/573/15/22/951                                       | 269/573/15/22/951  | Match  |
  | McDonald's  | 맥치킨                         | 206/515/7/19/1148                                       | 206/515/7/19/1148  | Match  |
  | Burger King | 불고기 롱치킨버거              | 234/691/7/23/1434                                       | 234/691/7/23/1434  | Match  |
  | Burger King | 통새우와퍼주니어               | 168/414/5/17/658                                        | 168/414/5/17/658   | Match  |
  | Burger King | 통새우슈림프버거               | 190/512/8/16/1077                                       | 190/512/8/16/1077  | Match  |
  | Burger King | 쯔란로제 크리스퍼              | 233/660/11/27/1694                                      | 233/660/11/27/1694 | Match  |
  | Burger King | 더오치 맥시멈2                 | 375/1018/9/53/2045                                      | 375/1018/9/53/2045 | Match  |
  | Lotteria    | 미라클버거                     | 181/382/7/15/600                                        | 181/382/7/15/600   | Match  |
  | Lotteria    | 더블 한우불고기버거            | 352/802/18/39/1150                                      | 352/802/18/39/1150 | Match  |
  | Lotteria    | 전주 비빔라이스 버거           | 285/574/8/17/1450                                       | 285/574/8/17/1450  | Match  |
  | Lotteria    | 나폴리 모짜렐라버거 토마토바질 | 240/733/10/27/1080                                      | 240/733/10/27/1080 | Match  |
  | Lotteria    | 포테이토                       | 98/284/2/3/500                                          | 98/284/2/3/500     | Match  |
  | KFC         | 콜라 제로(L)                   | 522/0/0/0/57                                            | 522/0/0/0/57       | Match  |
  | KFC         | 스프라이트(M)                  | 348/157/39/0/31                                         | 348/157/39/0/31    | Match  |
  | KFC         | 콜라(L)                        | 522/224/56/0/16                                         | 522/224/56/0/16    | Match  |
  | KFC         | 징거더블다운                   | 368/842/5/67/1868                                       | 368/842/5/67/1868  | Match  |
  | KFC         | 콜라 제로(M)                   | 348/0/0/0/38                                            | 348/0/0/0/38       | Match  |
  | Mom's Touch | 새우불고기버거                 | 252/601/20/19/1054                                      | 252/601/20/19/1054 | Match  |
  | Mom's Touch | 제로콜라                       | 380/0/0/0/51                                            | 380/0/0/0/51       | Match  |
  | Mom's Touch | 불고기버거                     | 164/403/14/14/615                                       | 164/403/14/14/615  | Match  |
  | Mom's Touch | 통새우버거                     | 178/449/9/12/707                                        | 178/449/9/12/707   | Match  |
  | Mom's Touch | 스모키스매쉬버거               | 252/634/11/32/945                                       | 252/634/11/32/945  | Match  |

- Tests
  - `backend/test/franchise-foods.test.ts` (no DB): checks that all 164 rows are `official`, have an https URL on the brand's official site, have the check date 2026-11-08, have `is_junk = true`, and have NULL carbohydrate and fat. It also checks that each brand uses its designated official site, that sodium or a whole row has not shifted into other columns (the energy from protein and sugars does not exceed the stated energy, and protein in soft drinks is 0), and that `is_junk` is not in `DO UPDATE SET` (added after the first review).
  - `backend/test/foods.integration.test.ts`: on an applied DB, checks counts per brand and category, and that no source, date, label, or value is empty. It also checks that one menu item per brand has the values from the source (column shifts).
- Temporary PostgreSQL 17 cluster (port 5472, `health_test`): everything was applied with psql as CI does, then applied again with `npm run db:migrate`. There were no errors and the row counts per brand and category were the same as above.
- After merging `origin/main` (2ee3364), `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: passed.
  - Backend: 193 passed, 0 skipped. After the second review fixes it was run again: 195 passed, 0 skipped.
  - Frontend: 370 passed, 2 skipped. The 2 skipped are existing conditional tests unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Limits

- None of the five publish total fat and carbohydrate, so these two values are empty. In the daily total, they are shown as "foods with unknown values".
- If a value in a source changes, it must be entered again with a new check date. KFC and Mom's Touch are images, so they cannot be compared automatically.

## Review

- **First:** Nothing had to be fixed. The review compared all 164 rows with the original data and all matched. What was applied:
  - The merge order (#103 first) was written in this record and the PR checklist.
  - Three things were added to `franchise-foods.test.ts`.
    - Checks that each brand uses its designated official site.
    - Checks that sodium or a whole row has not shifted into other columns. The energy from protein and sugars (4kcal/g) must not exceed the stated energy, and protein in soft drinks must be 0. It does not catch swaps between values of similar size (protein↔sugars, weight↔energy).
    - Checks that `is_junk` is not in `DO UPDATE SET`.
  - Wrote in the docs that the Lotteria unit is an assumption, the "(버터번)" (butter bun) mark, the scope (breakfast items excluded, the classification of KFC Twister and All That Cheese Dog), and the robots.txt content.
  - Left as it was: a swap of sugars and protein within one row cannot be caught from the file alone. Full-row cross-checks (double entry, ratio cross-check, and the review's full comparison) stand in for it.
- **Second:** Nothing had to be fixed. What was applied:
  - Fixed the `is_junk` test, which passed even when it could not find `DO UPDATE SET`. It now first checks that the clause exists.
  - The name decoding also accepts lowercase hexadecimal.
  - Wrote exactly what the column check catches in the comment and in this record.
  - Fixed the test counts to match the rerun results.
