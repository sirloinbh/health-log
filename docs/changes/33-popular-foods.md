# #33 Research and register nutrition facts of popular foods

- Issue: [#33](https://github.com/sirloinbh/health-log/issues/33)
- Branch: `feat/33-popular-foods`

## Purpose

So that foods do not have to be typed in every time a meal is recorded, register the nutrition facts of commonly eaten foods in advance from official data. The user decided to research and add popular foods instead of a personal list (2026-10-31).

## Change — 2026-11-02

- **Data:** `database/migrations/005_foods_popular.sql` inserts 95 items: 73 dishes and 22 raw ingredients, drinks, and alcohol.
- **Source:** All from the [MFDS Food Nutrient DB](https://various.foodsafetykorea.go.kr/nutrient/) (식약처 식품영양성분 DB). The detail page URL of each food is stored as `source_url`, so values can be compared directly. The Public Data Portal marks this DB's Open API as "no restriction on the scope of use". The values were read from the public detail pages without a key, and those pages themselves carry no separate notice.
- **Rules document:** Added to `docs/food-data.md` the conversion to total content, the criteria for choosing data, the naming rules, and how to query.
- **Tests:** Added to `backend/test/foods.integration.test.ts` tests that check the source, the category, converted values for representative foods, and search by common names.

### Selection criteria

Only `품목대표` (item representative) data, which is a nationwide representative average with no manufacturer, was used. When one food had several data entries, they were chosen in this order.

1. Actual analyzed value → collected value → calculated value
2. Data whose total content differs from the reference amount. If the total content is `100g` or `-`, it is treated as having no per-serving information
3. Eating out → home cooking → industrial catering → school meals
4. Latest creation date
5. If there are still several, the median energy (pizza, hot dog, americano)

Even when the name in the source was written differently, it was taken as a candidate if it was the same food. Examples: `자장면`, `돼지고기볶음(제육볶음)`, `김밥_참치`, `볶음밥_김치`, `닭튀김_양념`.

At first eating out was put ahead of analyzed values. The first review showed that the sodium of ramen was stored at about 1/4 of the analyzed data (342mg versus 1,557mg analyzed) and that one serving of bibimbap was taken as 100g, so the criteria were changed. The second review showed that data with a different name were missed, so 10 calculated values were replaced and 4 foods that had been called not found were added. As a result there are 70 analyzed values, 3 calculated values, and 22 raw ingredients.

### Conversion and names

- The data is per 100g (or 100mL). It was converted using the total content of the data and stored to two decimal places. Kimchi stew is 61kcal per 100g with a total content of 400g, so it is `400g`, `244kcal`.
- Names were arranged in the words people search for. The official name of the source is on the `source_url` page. Examples: `닭고기, 가슴, 삶은것` (chicken, breast, boiled) → `닭가슴살(삶은것)`, `탄산 음료, 콜라` (carbonated drink, cola) → `콜라`, `돈가스` → `돈가스(돈까스)`.

### Registered list

The food names are kept in Korean because they are the data values stored in the DB.

- **Rice:** 쌀밥, 현미밥, 잡곡밥, 비빔밥, 볶음밥, 김치볶음밥, 제육덮밥, 오므라이스, 카레라이스, 김밥, 참치김밥
- **Noodles:** 라면, 짜장면(자장면), 짬뽕, 칼국수, 잔치국수, 물냉면, 비빔냉면, 우동(일식), 쫄면, 스파게티(토마토소스)
- **Soups and stews:** 김치찌개, 된장찌개, 순두부찌개(김치), 부대찌개, 미역국, 갈비탕, 설렁탕, 삼계탕, 육개장, 떡국, 만두국(만둣국), 콩나물국, 감자탕, 추어탕, 황태해장국
- **Meat and fried food:** 소불고기, 제육볶음, 삼겹살구이, 돼지갈비구이(간장), 돼지갈비찜, 소갈비구이(양념), 닭볶음(닭갈비), 닭찜, 찜닭(안동찜닭), 돈가스(돈까스), 탕수육, 닭튀김(치킨), 양념치킨, 족발
- **Snack-bar and eating-out food:** 떡볶이, 순대, 군만두, 김치만두, 고기만두, 오징어튀김, 핫도그, 피자, 샌드위치, 햄버거, 토스트(식빵), 아메리카노
- **Side dishes:** 배추김치, 깍두기, 달걀말이(계란말이), 달걀찜(계란찜), 달걀후라이(계란후라이), 두부조림, 잡채, 고등어구이, 오징어볶음, 멸치볶음, 시금치나물
- **Raw ingredients and drinks:** 바나나, 사과, 귤, 우유, 요구르트(액상), 플레인 요거트(요구르트), 달걀(계란), 생것, 삶은 달걀(계란), 닭가슴살(삶은것), 두부, 고구마(찐것), 감자(찐것), 토마토, 콜라, 사이다, 오렌지주스, 체다치즈, 볶은아몬드, 우유식빵
- **Alcohol:** 맥주, 소주(17.8%), 막걸리

## Checks

- Migration: The whole set was applied twice to a temporary PostgreSQL cluster (port 55901, `health_test`). 95 items with no errors and no duplicate names. The existing local DB was not touched.
- Source comparison: All 95 stored items were compared again with the detail pages, and there were 0 differences in serving size and the 6 nutrients.
- The full `npm run check` result is written in the PR.
- There is no screen change, so no browser check was done.

## First review fixes — 2026-11-02

- **Selection criteria:** Changed to choose analyzed values first as above, and everything was chosen again.
- **Wrong category:** Fixed a parser bug where the next item's name (`품목대표/상용제품`) was stored as the category for 4 data entries that have no category. It is now NULL.
- **Search:** Names were arranged so that common words such as `닭가슴살` (chicken breast), `계란` (egg), `치킨` (fried chicken), `콜라` (cola), and `돈까스` (pork cutlet) find them.
- **Foods left out:** `제육(돼지고기 수육)` has only a school-meal calculated value and was confused with 제육볶음 in a `제육` search, so it was left out.
- **Tests:** Fixing the exact count would break with the #31 and #32 data, so it was changed to a lower bound.
- **Split off:** The list limit of 100 was split into [#67](https://github.com/sirloinbh/health-log/issues/67).

## Second review fixes — 2026-11-02

All 8 points were fixed in this PR. Reviews are limited to two rounds, so there is no third review.

- **Missed analyzed data:** 10 of the 13 calculated values had analyzed data under a different name, so they were replaced. For the replaced data, the name, item representative status, and analyzed status were checked directly on the detail pages.
- **Foods not found:** Added 김치볶음밥, 제육덮밥, 참치김밥, and 양념치킨.
- **Jjimdak:** The general `닭찜` has 1.8g of carbohydrate per 300g, so searching for jjimdak would record far too little. It was split into `닭찜` and `찜닭(안동찜닭)`.
- **Docs:** Wrote the criteria for judging total content and the `searchOrderby` needed to list items, and fixed wrong statements.
- **Tests:** Fixed the values of 짜장면 and 제육볶음, and the common-word searches check that the expected foods come up.

## Limits and follow-ups

- **The 3 calculated values are reference values.** 탕수육, 오징어튀김, and 토스트(식빵) have no analyzed data for the same food. The source also treats calculated values as reference. On screen they are not distinguished from analyzed values.
- **Numbers are as written in the data.** Values that look wrong were not corrected. Some values may be unmeasured rather than a real 0, such as the sugars 0 of gimbap, and some look low, such as the sodium 110mg of 설렁탕 500g, but this cannot be judged from the data alone.
- **Foods whose one serving is not one portion:** Pizza is 558g, 1,440kcal, close to a whole pie. Jjimdak is 1500g, 1,365kcal, several portions. Chueotang 1000g is also large. For 쌀밥, 돈가스, 배추김치, 달걀말이, and 돼지갈비구이(간장), the total content in the data is 100g (a bowl of rice is about quantity 2). Fried squid 77mL is a school-meal amount. The serving size is visible on screen, so adjust it with the quantity.
- **Foods where a sub-type represents the dish:** Spaghetti is tomato sauce, udon is Japanese style, steamed egg is the data with salted shrimp, and grilled mackerel is the broiled data. Values may differ from other cooking methods.
- **Units:** Calculated-value data uses mL even for solids (탕수육 343mL and so on). Among the raw ingredients, cola, cider, orange juice, beer, soju, makgeolli, milk, and liquid yogurt are liquids but are per 100g, as in the data.
- **Foods not found:** Bossam was not added because the only pork boiled-meat data is a school-meal calculated value. It was not added as an estimate.
- **When applied to an existing DB:** If a food with the same name (no brand) has a check date earlier than 2026-11-02, it is replaced with these values. Foods without a date are kept. If there is user data made so far, check foods with overlapping names before applying. The values of meal records already registered do not change.
