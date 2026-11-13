# #32 Register nutrition facts for Bibigo retort foods

- Issue: [#32](https://github.com/sirloinbh/health-log/issues/32)
- Branch: `feat/32-bibigo-foods`

## Purpose

Let the user search and record Bibigo retort foods using the official nutrition facts on the product label. The same product line comes in different weights, so the data is stored in a way that tells whether the nutrition facts are per total content or per part of the weight.

## Decisions

Decided without asking the user. The same content was left as an issue comment.

- **Scope:** Single shelf-stable retort soups, stews, and hot pots of the Bibigo brand.
  - The list was picked from the "국 · 탕 · 찌개" (soups, hot soups, stews) category (`ctgrId=004012`, 57 items) of CJ The Market, the official CJ CheilJedang shop.
  - Bundles, sets, and pick-and-mix products were left out because they are the same products as the single items.
  - Chilled and frozen products (5 items of the Yunjumo series) were left out because they are outside the shelf-stable scope. Yunjumo Samgyetang is described as a retort in product reviews, but it is shipped and stored chilled.
  - Porridge is now sold under the "Hetbahn" brand (`ctgrId=003604`), so it is outside the Bibigo scope. As the issue's reference note says, other brands are a separate issue.
- **Values:** The values are the ones shown by the "영양성분" (nutrition facts) button on the CJ The Market product page. These values come from the official API `/the/api/product/v1/nutritions/<product code>`. It is the label of the CJ CheilJedang official shop, so it is `official`.
  - For each menu item, the product page URL (`https://www.cjthemarket.com/the/product/product-main?prdCd=<product number>`) and the check date (2026-11-08) are recorded.
  - Energy, carbohydrate, protein, fat, sugars, and sodium are all filled in.
  - Values given only as a range, such as "less than 4g" (4g 미만), are not exact, so they are left NULL. These are the carbohydrate of Galbitang (less than 4g), the carbohydrate of Low-sodium Sagol Gomtang (less than 1g), and the sugars of Beef-rich Seaweed Soup and Siraegi-rich Jangteo Soup (less than 1g).
- **Telling total content from the label basis:** The total content is written at the end of the name (`갈비탕 400g`), and the serving size holds the reference amount of the nutrition label.
  - The API gives the total content (`totAmt`) and the label reference amount (`totCalPerAmt`) separately.
  - If the two are equal, the facts are per total content; if the serving size is smaller, they are per part of the weight.
  - All 27 items this time are per total content.
  - This rule is written in `docs/food-data.md`.
- **Names:** The leading "비비고 " (Bibigo) was removed from the product name and `비비고` was put in the brand field. On screen it shows as "비비고 갈비탕 400g", and it is found by searching "갈비탕" (Galbitang). The category is `국·탕·찌개` (soups, hot soups, stews) as in the source.
- **Junk food:** Under the #38 rule these are not franchise fast food, so they are inserted with `is_junk = false`. It is not in `DO UPDATE SET`.
- **Migration number:** `014_foods_bibigo.sql`. Right before the PR it was confirmed that main's highest number is 013.

## Sources and terms of use

- CJ The Market robots.txt (checked 2026-11-08): for `User-agent: *` it blocks only the my-page, customer-service, order, and cart paths (`/pc/…`, `/mo/…`) and the employee gift set path. Product pages (`/the/product/…`) are not blocked.
- Paths that need login, CAPTCHA, or a file download were not used. A 2-second pause was kept between requests.
- Product pages carry a copyright notice for images, text, and detail pages. This work copied only the nutrition numbers, for personal records. Images and descriptions were not stored.
- **How it was read:**
  1. The category page was scrolled to the end in headless Chrome to get the product list.
  2. The product codes were found from the structured data (`sku`, `mpn`, `brand`) in the product page HTML, and only shelf-stable products were chosen by the storage temperature mark.
  3. The nutrition response was fetched by product code.
  4. A working script generates the SQL. It stops if the total content in the name differs from the total content in the response, or if the unit is not g.

## Registered products (27, all shelf-stable, per total content)

The names are kept in Korean because they are the data values stored in the DB. In order: Galbitang 400g, Sagol Gomtang 500g, Sagol Gomtang 300g, Hanwoo Sagol Gomtang 500g, Low-sodium Sagol Gomtang 500g, Yukgaejang 500g, Beef-rich Yukgaejang 460g, Beef Seaweed Soup 500g, Beef-rich Seaweed Soup 460g, Hwangtae-rich Haejangguk 460g, Beef-rich Radish Soup 500g, Chadol Doenjang Stew 460g, Beef-rich Seolleongtang 460g, Seolleongtang 500g, Siraegi Gamjatang 460g, Dogani Gomtang 460g, Kkori Gomtang 460g, Spam Budae Stew 460g, Pork Kimchi Stew 460g, Tofu-rich Kimchi Stew 460g, Tofu-rich Doenjang Stew 460g, Tofu-rich Cheonggukjang Stew 460g, Siraegi-rich Jangteo Soup 500g, Siraegi-rich Doenjang Soup 460g, Namdo-style Chueotang 460g, Dak Gomtang 500g, Nutrition Samgyetang 800g.

갈비탕 400g, 사골곰탕 500g, 사골곰탕 300g, 한우사골곰탕 500g, 저염 사골곰탕 500g, 육개장 500g, 소고기듬뿍 육개장 460g, 소고기 미역국 500g, 소고기듬뿍 미역국 460g, 황태듬뿍해장국 460g, 소고기듬뿍무국 500g, 차돌된장찌개 460g, 소고기듬뿍 설렁탕 460g, 설렁탕 500g, 시래기 감자탕 460g, 도가니곰탕 460g, 꼬리곰탕 460g, 스팸부대찌개 460g, 돼지고기김치찌개 460g, 두부듬뿍 김치찌개 460g, 두부듬뿍 된장찌개 460g, 두부듬뿍 청국장찌개 460g, 시래기듬뿍 장터국 500g, 시래기듬뿍 된장국 460g, 남도식 추어탕 460g, 닭곰탕 500g, 영양삼계탕 800g.

## Products not found or left out

| Product                                                                                                                           | Reason                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 비비고 윤주모 삼계탕 850g (Bibigo Yunjumo Samgyetang 850g)                                                                        | Chilled product (outside the shelf-stable scope) |
| 비비고 윤주모 셰프 황태국·감자탕·부대찌개·육개장 200g (Bibigo Yunjumo Chef Hwangtae soup, Gamjatang, Budae stew, Yukgaejang 200g) | Frozen product (outside the shelf-stable scope)  |
| 비비고 윤주모 셰프 부대찌개·육개장 200g (Bibigo Yunjumo Chef Budae stew, Yukgaejang 200g)                                         | (Note) the nutrition response also had no values |
| Bundle and set products (for example `비비고 갈비탕 400g, 6개`, a 6-pack)                                                         | Same product as the single item                  |

Among the shelf-stable single Bibigo items in the `ctgrId=004012` list, there is none for which official numbers could not be found. `비비고 순대곱창전골 550g` (Bibigo Sundae Gopchang Jeongol 550g) is only inside a set (40239023) in this category, and its single-item page was not checked, so it was not included.

## Change — 2026-11-08

- **DB** `database/migrations/014_foods_bibigo.sql`: 27 items. It follows the format in docs/food-data.md (`ON CONFLICT … WHERE EXCLUDED.checked_on > foods.checked_on`), and Korean text is written with `U&` escapes.
- **Docs** `docs/food-data.md`: A "less than" mark ("미만") is left as NULL. For packaged products, the total content goes in the name and the label reference amount goes in the serving size.

## Checks

- **Random cross-check of 10** (completion criterion of the issue): The product pages and nutrition responses of 10 randomly chosen products were fetched again. Product code, total content, label reference amount, energy, carbohydrate, protein, fat, sugars, and sodium all equaled the registered values.

  | Product                  | Registered values (total/reference/energy/carb/protein/fat/sugars/sodium) | Values fetched again         | Result |
  | ------------------------ | ------------------------------------------------------------------------- | ---------------------------- | ------ |
  | 도가니곰탕 460g          | 460/460/100/0/19/2.4/0/950                                                | 460/460/100/0/19/2.4/0/950   | Match  |
  | 시래기듬뿍 장터국 500g   | 500/500/120/11/10/3.8/-/1750                                              | 500/500/120/11/10/3.8/-/1750 | Match  |
  | 두부듬뿍 청국장찌개 460g | 460/460/310/23/25/13/4/1690                                               | 460/460/310/23/25/13/4/1690  | Match  |
  | 시래기듬뿍 된장국 460g   | 460/460/150/13/13/5/1/1690                                                | 460/460/150/13/13/5/1/1690   | Match  |
  | 닭곰탕 500g              | 500/500/145/2/21/6/0/1360                                                 | 500/500/145/2/21/6/0/1360    | Match  |
  | 설렁탕 500g              | 500/500/110/2/16/4.1/0/1070                                               | 500/500/110/2/16/4.1/0/1070  | Match  |
  | 소고기 미역국 500g       | 500/500/115/8/7/6/0/1710                                                  | 500/500/115/8/7/6/0/1710     | Match  |
  | 시래기 감자탕 460g       | 460/460/270/18/31/8/2/1530                                                | 460/460/270/18/31/8/2/1530   | Match  |
  | 차돌된장찌개 460g        | 460/460/240/19/19/10/4/1830                                               | 460/460/240/19/19/10/4/1830  | Match  |
  | 소고기듬뿍 육개장 460g   | 460/460/205/11/22/8/4/1740                                                | 460/460/205/11/22/8/4/1740   | Match  |

  (`-` is a value left NULL because the source gave a "less than" mark.)

- **Energy consistency:** It was also checked that the source values agree with each other. The difference between the energy computed from carbohydrate, protein, and fat (4, 4, 9 kcal/g) and the stated energy is as follows.
  - 25 items with exact carbohydrate: within ±2.4kcal. This is the evidence that no column was shifted or value mistyped.
  - 2 items whose carbohydrate is a "less than" mark are not computed in the test.
    - Low-sodium Sagol Gomtang: −5.2kcal. With carbohydrate less than 1g included, it is 39.8 to 43.8kcal, which agrees with the stated 45kcal within the rounding range.
    - Galbitang: protein 13g and fat 4.8g alone give 95.2kcal. Even with the rounding lower bounds (12.5g, 4.75g) it is 92.75kcal, above the stated 85kcal (below 87.5). The official label itself seems not to add up, and the value was left as in the source.
- The product photos do not show the nutrition table on the package, so a direct comparison with the package label was not possible.
- Tests
  - `backend/test/bibigo-foods.test.ts` (no DB)
    - Checks that all 27 are the Bibigo brand, `official`, have their own product page URL, the check date, and `is_junk = false`.
    - Checks that the total content in the name equals the serving size.
    - For products with carbohydrate, checks that the computed energy is within 5kcal of the stated one.
  - `backend/test/foods.integration.test.ts`: checks that the 27 items on an applied DB have source, date, and values. It also checks that searching "갈비탕" (Galbitang) through the API returns the "less than" carbohydrate still as NULL.
- Temporary PostgreSQL 17 cluster (port 5472, `health_test`): everything was applied with psql as CI does, then applied again with `npm run db:migrate` (001 to 014). There were no errors.
- After merging `origin/main` (64e4568), `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: passed.
  - Backend: 224 passed, 0 skipped.
  - Frontend: 395 passed, 2 skipped. The 2 skipped are existing conditional tests unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Review

- **First:** Nothing had to be fixed. The review compared all 27 rows with the original data separately, and all matched. No shelf-stable single item was missing from the `ctgrId=004012` list (except the Sundae Gopchang Jeongol inside a set). What was applied:
  - The integration test was narrowed to the `국·탕·찌개` category so it does not break when other Bibigo products (dumplings, seaweed, and so on) come in later (run again with the DB and passed).
  - Corrected the text to say that the energy difference for Galbitang is not explained by rounding. The official label itself seems not to add up, and the value is kept as in the source.
  - Corrected the reason for leaving out the Yunjumo series to "outside the shelf-stable scope". Wrote that the Sundae Gopchang Jeongol that exists only inside a set was not checked.
  - Added a sentence to `docs/food-data.md` that the label of a manufacturer's official shop is `official`.
  - Left as it was
    - A swap of sugars and sodium cannot be caught by the file check. Full cross-checking stands in for it.
    - It is not found by other names such as "저나트륨" (low sodium) or "소고기듬뿍미역국" (the name written without spaces). If needed, it is handled in a separate issue.
- **Second:** Nothing had to be fixed. To avoid confusion with the registered Nutrition Samgyetang (shelf-stable), it is written as "윤주모 삼계탕" (Yunjumo Samgyetang), and the "nothing missing" range in the first review summary is limited to the category list.
