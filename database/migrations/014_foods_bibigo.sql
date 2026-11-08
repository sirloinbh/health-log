-- Bibigo shelf-stable (retort) soups and stews (#32), from the nutrition facts CJ CheilJedang's
-- own store shows on each product page, checked on 2026-11-08. The name ends with the total
-- content; serving_size is the amount the facts are given for. Every product here states its facts
-- for the whole package, so the two are equal; a product labelled per part of the package would
-- show a smaller serving_size than its name. A value the label gives only as "less than" is NULL.
-- Sources and the products left out are listed in docs/changes/32-bibigo-foods.md. Not franchise
-- fast food, so not junk food (#38); the mark is set only when a food is first added.
INSERT INTO foods (name, brand, category, serving_size, serving_unit, calories, carbs, protein, fat, sugars, sodium, source_type, source_url, checked_on, is_junk)
VALUES
  (U&'\AC08\BE44\D0D5 400g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 400, 'g', 85, NULL, 13, 4.8, 0, 810, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145162', '2026-11-08', false),
  (U&'\C0AC\ACE8\ACF0\D0D5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 30, 0, 3, 2.1, 0, 1180, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40111256', '2026-11-08', false),
  (U&'\C721\AC1C\C7A5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 165, 16, 12, 6, 2, 1690, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145144', '2026-11-08', false),
  (U&'\C18C\ACE0\AE30 \BBF8\C5ED\AD6D 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 115, 8, 7, 6, 0, 1710, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145146', '2026-11-08', false),
  (U&'\D55C\C6B0\C0AC\ACE8\ACF0\D0D5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 30, 2, 2, 1.4, 0, 760, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40111282', '2026-11-08', false),
  (U&'\C18C\ACE0\AE30\B4EC\BFCD \BBF8\C5ED\AD6D 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 105, 7, 12, 3.3, NULL, 1120, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40173596', '2026-11-08', false),
  (U&'\D669\D0DC\B4EC\BFCD\D574\C7A5\AD6D 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 145, 2, 18, 7, 1, 1070, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40211523', '2026-11-08', false),
  (U&'\C18C\ACE0\AE30\B4EC\BFCD\BB34\AD6D 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 75, 4, 11, 1.5, 4, 1470, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40209316', '2026-11-08', false),
  (U&'\CC28\B3CC\B41C\C7A5\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 240, 19, 19, 10, 4, 1830, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145159', '2026-11-08', false),
  (U&'\C18C\ACE0\AE30\B4EC\BFCD \C124\B801\D0D5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 130, 5, 19, 4, 0, 920, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40173597', '2026-11-08', false),
  (U&'\C2DC\B798\AE30 \AC10\C790\D0D5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 270, 18, 31, 8, 2, 1530, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145156', '2026-11-08', false),
  (U&'\B3C4\AC00\B2C8\ACF0\D0D5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 100, 0, 19, 2.4, 0, 950, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145163', '2026-11-08', false),
  (U&'\C2A4\D338\BD80\B300\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 330, 15, 23, 20, 4, 1830, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145161', '2026-11-08', false),
  (U&'\C18C\ACE0\AE30\B4EC\BFCD \C721\AC1C\C7A5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 205, 11, 22, 8, 4, 1740, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40173598', '2026-11-08', false),
  (U&'\B3FC\C9C0\ACE0\AE30\AE40\CE58\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 270, 18, 16, 15, 7, 1820, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145160', '2026-11-08', false),
  (U&'\C2DC\B798\AE30\B4EC\BFCD \C7A5\D130\AD6D 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 120, 11, 10, 3.8, NULL, 1750, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40217245', '2026-11-08', false),
  (U&'\B0A8\B3C4\C2DD \CD94\C5B4\D0D5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 195, 17, 12, 9, 3, 1670, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145154', '2026-11-08', false),
  (U&'\B450\BD80\B4EC\BFCD \AE40\CE58\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 255, 20, 14, 13, 6, 1930, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40188638', '2026-11-08', false),
  (U&'\B2ED\ACF0\D0D5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 145, 2, 21, 6, 0, 1360, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145149', '2026-11-08', false),
  (U&'\AF2C\B9AC\ACF0\D0D5 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 135, 8, 19, 3.2, 0, 890, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145164', '2026-11-08', false),
  (U&'\C800\C5FC \C0AC\ACE8\ACF0\D0D5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 45, NULL, 5, 2.2, 0, 430, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40190112', '2026-11-08', false),
  (U&'\C124\B801\D0D5 500g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 500, 'g', 110, 2, 16, 4.1, 0, 1070, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40145145', '2026-11-08', false),
  (U&'\B450\BD80\B4EC\BFCD \CCAD\AD6D\C7A5\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 310, 23, 25, 13, 4, 1690, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40213441', '2026-11-08', false),
  (U&'\B450\BD80\B4EC\BFCD \B41C\C7A5\CC0C\AC1C 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 165, 16, 14, 4.8, 7, 1540, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40184574', '2026-11-08', false),
  (U&'\C2DC\B798\AE30\B4EC\BFCD \B41C\C7A5\AD6D 460g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 460, 'g', 150, 13, 13, 5, 1, 1690, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40217246', '2026-11-08', false),
  (U&'\C601\C591\C0BC\ACC4\D0D5 800g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 800, 'g', 600, 28, 77, 20, 0, 2090, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40227811', '2026-11-08', false),
  (U&'\C0AC\ACE8\ACF0\D0D5 300g', U&'\BE44\BE44\ACE0', U&'\AD6D\00B7\D0D5\00B7\CC0C\AC1C', 300, 'g', 20, 0, 2, 1.2, 0, 710, 'official', 'https://www.cjthemarket.com/the/product/product-main?prdCd=40184737', '2026-11-08', false)
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
