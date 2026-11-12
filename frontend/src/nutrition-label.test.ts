import { expect, test } from 'vitest';

import { isCoupangUrl, packageText, readNutritionLabel } from './nutrition-label';

// The usual layout of a Korean nutrition facts table, copied as text: a basis, then one line each.
const per100g = `영양정보
총 내용량 500 g
100 g당 250 kcal
나트륨 300 mg 15%
탄수화물 30 g 9%
당류 10 g 10%
지방 12 g 22%
트랜스지방 0 g
포화지방 4 g 27%
콜레스테롤 0 mg 0%
단백질 5 g 9%
1일 영양성분 기준치에 대한 비율(%)은 2,000kcal 기준이므로…`;

test('a per-100g table fills the basis and every nutrient it lists', () => {
  expect(readNutritionLabel(per100g)).toEqual({
    basis: { size: 100, unit: 'g' },
    basisFromTotal: false,
    total: { size: 500, unit: 'g' },
    values: { calories: 250, carbs: 30, protein: 5, fat: 12, sugars: 10, sodium: 300 },
    lessThan: [],
    outOfRange: [],
  });
});

test('트랜스지방 and 포화지방 are not read as 지방, with or without a space', () => {
  const spaced = '100g당 120kcal 트랜스 지방 0g 포화 지방 2g 지방 7g 당류 3g';
  expect(readNutritionLabel(spaced).values.fat).toBe(7);
  // Sugars right after a value is not a "g당" basis.
  expect(readNutritionLabel('1회 제공량 30g 포화지방 4g 당류 6g 150kcal').basis).toEqual({
    size: 30,
    unit: 'g',
  });
});

test('a serving written as "1회 제공량 1개(30g)" or "1봉지(45g)당" is the basis', () => {
  expect(readNutritionLabel('1회 제공량 1개(30g) 열량 140kcal').basis).toEqual({
    size: 30,
    unit: 'g',
  });
  const bag = readNutritionLabel('총 내용량 90g 1봉지(45g)당 230kcal 나트륨 210mg');
  expect(bag.basis).toEqual({ size: 45, unit: 'g' });
  expect(bag.values).toEqual({ calories: 230, sodium: 210 });
});

test('with only a package size, the values are for the whole package', () => {
  const reading = readNutritionLabel('총 내용량 250ml 135kcal 단백질 6g 나트륨 120mg');
  expect(reading.basis).toEqual({ size: 250, unit: 'ml' });
  expect(reading.values).toEqual({ calories: 135, protein: 6, sodium: 120 });
});

test('the values after the basis win over the package column before it', () => {
  const reading = readNutritionLabel('총 내용량 500g (1,250kcal) / 100g당 250kcal, 단백질 5g');
  expect(reading.values.calories).toBe(250);
});

test('units are converted: sodium to mg, the rest to g, rounded to two decimals', () => {
  const reading = readNutritionLabel('100g당 50kcal 나트륨 0.35g 단백질 1250mg 당류 0.333g');
  expect(reading.values).toEqual({ calories: 50, sodium: 350, protein: 1.25, sugars: 0.33 });
});

test('full-width signs and thousands commas are read like plain text', () => {
  const reading = readNutritionLabel('１００ｇ당 1,050㎉ 나트륨 1,200㎎ 단백질 ２０g');
  expect(reading.values).toEqual({ calories: 1050, sodium: 1200, protein: 20 });
});

test('"미만" is not a number to store, and is reported instead', () => {
  const reading = readNutritionLabel('100g당 30kcal 당류 1g 미만 나트륨 5mg미만 단백질 2g');
  expect(reading.values).toEqual({ calories: 30, protein: 2 });
  expect(reading.lessThan).toEqual(['sugars', 'sodium']);
});

test('text without a table reads as nothing', () => {
  expect(readNutritionLabel('맛있는 감자칩, 로켓배송')).toEqual({
    basis: null,
    basisFromTotal: false,
    total: null,
    values: {},
    lessThan: [],
    outOfRange: [],
  });
});

test('a package larger than the basis says how many servings it is', () => {
  expect(packageText(readNutritionLabel(per100g))).toBe(
    'The total amount of 500g is 5 times the serving size (100g), about 1,250kcal. If you ate the whole package, record it as 5 servings.',
  );
  // Same size, other units, or no package: nothing to say.
  expect(packageText(readNutritionLabel('총 내용량 250ml 135kcal'))).toBeNull();
  expect(packageText(readNutritionLabel('총 내용량 500g 100ml당 40kcal'))).toBeNull();
  expect(packageText(readNutritionLabel('100g당 40kcal'))).toBeNull();
});

test('only coupang.com and its subdomains count as a Coupang link', () => {
  expect(isCoupangUrl('https://www.coupang.com/vp/products/123?itemId=4')).toBe(true);
  expect(isCoupangUrl('https://link.coupang.com/a/abc')).toBe(true);
  expect(isCoupangUrl('https://coupang.com.example.com/x')).toBe(false);
  expect(isCoupangUrl('https://notcoupang.com/x')).toBe(false);
  expect(isCoupangUrl('쿠팡')).toBe(false);
});

// Regression cases from the first review of PR #119: a whole product page pasted, where a wrong
// number would be worse than an empty field.

test('a unit price such as "100g당 가격 2,211원" is not the basis', () => {
  const page =
    '상품명 감자칩 90g\n100g당 가격 2,211원\n영양성분 1봉지(45g)당 230kcal\n나트륨 210mg';
  const reading = readNutritionLabel(page);
  expect(reading.basis).toEqual({ size: 45, unit: 'g' });
  expect(reading.values).toEqual({ calories: 230, sodium: 210 });
  expect(readNutritionLabel('(10g당 120원)\n총 내용량 90g\n1봉지(45g)당 230kcal').basis).toEqual({
    size: 45,
    unit: 'g',
  });
});

test('words before the table, such as a review, are never read as values', () => {
  const review = '(10g당 120원)\n"당류 0g 맞나요?"\n총 내용량 90g\n1봉지(45g)당 230kcal\n당류 12g';
  expect(readNutritionLabel(review).values).toEqual({ calories: 230, sugars: 12 });
  const headed =
    '리뷰: 당류 0g이라 좋아요 단백질 20g!\n영양정보 총 내용량 300g 300kcal 탄수화물 50g';
  expect(readNutritionLabel(headed).values).toEqual({ calories: 300, carbs: 50 });
  // Without a heading or basis, a labelled energy line still wins over a stray kcal.
  expect(readNutritionLabel('쿠팡 배송 3kcal 아님\n열량 120kcal').values.calories).toBe(120);
});

test('values for another basis after the table are not mixed in', () => {
  const reading = readNutritionLabel(
    '1회 제공량 30g\n열량 150kcal\n나트륨 90mg\n탄수화물 20g\n(100g당 500kcal)',
  );
  expect(reading.basis).toEqual({ size: 30, unit: 'g' });
  expect(reading.values).toEqual({ calories: 150, sodium: 90, carbs: 20 });
});

test('당알코올 is a nutrient, not a "g당" basis', () => {
  const sugarFree = readNutritionLabel('총 내용량 30g\n열량 60kcal\n단백질 1g\n당알코올 18g');
  expect(sugarFree.basis).toEqual({ size: 30, unit: 'g' });
  expect(sugarFree.basisFromTotal).toBe(true);
  expect(readNutritionLabel('1회 제공량 30g 열량 90kcal 당류 0g 당알코올 18g').basis).toEqual({
    size: 30,
    unit: 'g',
  });
});

test('the footer "2,000kcal 기준" is never the energy value', () => {
  const noEnergy = readNutritionLabel(
    '100g당\n나트륨 300mg 15%\n탄수화물 30g\n1일 영양성분 기준치에 대한 비율(%)은 2,000kcal 기준',
  );
  expect(noEnergy.values.calories).toBeUndefined();
  expect(noEnergy.values).toEqual({ sodium: 300, carbs: 30 });
});

test('a named basis without a size is not replaced by the package size', () => {
  const unsized = readNutritionLabel(
    '총 내용량 60g (30g X 2회 제공량)\n1회 제공량당\n열량 150kcal',
  );
  expect(unsized.basis).toBeNull();
  expect(unsized.basisFromTotal).toBe(false);
  expect(unsized.values.calories).toBe(150);
  // 1회 섭취참고량 is a basis too.
  expect(readNutritionLabel('총 내용량 90g\n1회 섭취참고량 30g\n열량 150kcal').basis).toEqual({
    size: 30,
    unit: 'g',
  });
});

test('decimal commas are read as decimals, and amounts a food cannot hold are left out', () => {
  expect(readNutritionLabel('100g당 50kcal 단백질 2,5g 나트륨 0,125g').values).toEqual({
    calories: 50,
    protein: 2.5,
    sodium: 125,
  });
  const huge = readNutritionLabel('1회 제공량 12.345g 열량 100000kcal 단백질 3g');
  expect(huge.basis).toEqual({ size: 12.35, unit: 'g' });
  expect(huge.values).toEqual({ protein: 3 });
  expect(huge.outOfRange).toEqual(['calories']);
  expect(readNutritionLabel('0g당 10kcal').basis).toBeNull();
});

// Regression cases from the second review of PR #119: the table must also end.

test('reviews and other products after the table are not read', () => {
  const review =
    '영양정보\n총 내용량 90g\n1봉지(45g)당 230kcal\n나트륨 210mg\n탄수화물 30g\n\n상품평\n당류 0g이라 좋아요 단백질 20g!';
  expect(readNutritionLabel(review).values).toEqual({ calories: 230, sodium: 210, carbs: 30 });
  const related =
    '영양정보\n100g당 250kcal\n나트륨 300mg\n탄수화물 30g\n\n함께 보면 좋은 상품\n제로콜라 100ml당 0kcal 당류 0g\n단백질바 1개(40g)당 단백질 15g 지방 5g';
  expect(readNutritionLabel(related).values).toEqual({ calories: 250, sodium: 300, carbs: 30 });
  // Another basis on a later line starts other values, even with no line in between.
  const twoBases = readNutritionLabel(
    '1회 제공량 30g\n열량 150kcal\n탄수화물 20g\n(100g당 500kcal 단백질 10g)',
  );
  expect(twoBases.values).toEqual({ calories: 150, carbs: 20 });
});

test('with a heading, a basis in the title or a review above it is not the table', () => {
  const review = readNutritionLabel(
    '리뷰: 이거 100g당 당류 5g이라던데?\n영양정보\n총 내용량 200g\n1회 제공량 50g\n열량 100kcal\n당류 2g',
  );
  expect(review.basis).toEqual({ size: 50, unit: 'g' });
  expect(review.values).toEqual({ calories: 100, sugars: 2 });
  const title = readNutritionLabel(
    '닭가슴살 100g당 단백질 23g 고단백\n영양정보\n1팩(100g)당\n열량 110kcal\n단백질 22g',
  );
  expect(title.values).toEqual({ calories: 110, protein: 22 });
});

test('"100g당열량" written without spaces is the basis', () => {
  const reading = readNutritionLabel(
    '영양정보 총내용량500g 100g당열량250kcal 나트륨300mg 탄수화물30g',
  );
  expect(reading.basis).toEqual({ size: 100, unit: 'g' });
  expect(reading.basisFromTotal).toBe(false);
  expect(reading.values).toEqual({ calories: 250, sodium: 300, carbs: 30 });
});

test('"2000kcal를 기준으로" in the footer is never the energy value', () => {
  const reading = readNutritionLabel(
    '100g당\n나트륨 300mg\n1일 영양성분 기준치에 대한 비율(%)은 2000kcal를 기준으로 한 것',
  );
  expect(reading.values).toEqual({ sodium: 300 });
});

test('a shop line above the heading is ignored even when the table names no basis', () => {
  const reading = readNutritionLabel(
    '무료배송 100g당 최저가\n리뷰 단백질 30g!\n영양정보\n총 내용량 100g\n열량 110kcal\n단백질 23g',
  );
  expect(reading.basis).toEqual({ size: 100, unit: 'g' });
  expect(reading.basisFromTotal).toBe(true);
  expect(reading.values).toEqual({ calories: 110, protein: 23 });
});

// #120: the table shapes left from #35.

test('two columns whose first head has no size are read for the package', () => {
  const reading = readNutritionLabel(
    '영양정보\n총 내용량당 | 100g당\n총 내용량 300g\n열량 900kcal | 300kcal\n나트륨 600mg | 200mg',
  );
  // The values read are the first column's, so the basis is the package, not the second head.
  expect(reading.basis).toEqual({ size: 300, unit: 'g' });
  expect(reading.values).toEqual({ calories: 900, sodium: 600 });
  // With no package size anywhere, the first column's amount is unknown: no basis.
  expect(
    readNutritionLabel('영양정보\n총 내용량당 | 100g당\n열량 900kcal | 300kcal').basis,
  ).toBeNull();
  // A first head with its own size is that column's basis.
  expect(
    readNutritionLabel('총 내용량(60g)당 | 1회 제공량(30g)당\n열량 300kcal | 150kcal').basis,
  ).toEqual({ size: 60, unit: 'g' });
});

test('"1회 제공량당" without a size takes the nearest stated serving', () => {
  const before = readNutritionLabel(
    '영양정보 총 내용량 60g\n1회 제공량 30g\n1회 제공량당 | 총 내용량당\n열량 150kcal | 300kcal\n나트륨 90mg | 180mg',
  );
  expect(before.basis).toEqual({ size: 30, unit: 'g' });
  expect(before.values).toEqual({ calories: 150, sodium: 90 });
  const after = readNutritionLabel('총 내용량 200g\n1회 제공량당\n열량 100kcal\n(1회 제공량 50g)');
  expect(after.basis).toEqual({ size: 50, unit: 'g' });
  expect(after.values).toEqual({ calories: 100 });
  // A package size is never lent to a serving.
  expect(readNutritionLabel('총 내용량 60g\n1회 제공량당\n열량 150kcal').basis).toBeNull();
});

test('values after a column bar, on the next line, or after a percentage are read', () => {
  expect(readNutritionLabel('100g당\n열량 | 250kcal\n나트륨 | 300mg').values).toEqual({
    calories: 250,
    sodium: 300,
  });
  expect(readNutritionLabel('100g당\n열량\n250kcal\n나트륨\n300mg').values).toEqual({
    calories: 250,
    sodium: 300,
  });
  expect(readNutritionLabel('100g당 250kcal\n나트륨 15% 300mg\n탄수화물 9% 30g').values).toEqual({
    calories: 250,
    sodium: 300,
    carbs: 30,
  });
  // The usual order still wins: the value, then its share.
  expect(readNutritionLabel('100g당 250kcal\n나트륨 300mg 15%').values.sodium).toBe(300);
});

test('the 2021 layout, package and energy above a "총 내용량당" head, is read whole', () => {
  const reading = readNutritionLabel(
    '(100g당 3,330원)\n영양정보\n총 내용량 30g\n130kcal\n총 내용량당 1일 영양성분 기준치에 대한 비율\n나트륨 100mg 5%\n탄수화물 20g 6%\n당류 2g\n단백질 2g',
  );
  expect(reading.basis).toEqual({ size: 30, unit: 'g' });
  expect(reading.basisFromTotal).toBe(false);
  expect(reading.values).toEqual({ calories: 130, sodium: 100, carbs: 20, sugars: 2, protein: 2 });
});

// Regression cases from the first review of PR #121.

test('an empty first cell is not filled from the second column', () => {
  const values = (pasted: string) => readNutritionLabel(pasted).values;
  expect(
    values(
      '영양정보\n100g당 | 1회 제공량(30g)당\n열량 250kcal | 75kcal\n나트륨 - | 300mg\n당류 | 5g',
    ),
  ).toEqual({ calories: 250 });
  expect(values('100g당 | 총 내용량(300g)당\n열량 250kcal | 750kcal\n단백질  | 12g')).toEqual({
    calories: 250,
  });
  expect(
    values('총 내용량당 | 100g당\n총 내용량 300g\n열량 | 900kcal | 300kcal\n당류 | | 5g'),
  ).toEqual({ calories: 900 });
  expect(values('100g당 | 1회 제공량(30g)당\n열량 250kcal | 75kcal\n단백질\n| 3g')).toEqual({
    calories: 250,
  });
});

test('a long single line is not a row of column heads', () => {
  const reading = readNutritionLabel(
    '영양정보 1회 제공량 1개(30g) 총 내용량 60g 100g당 열량 500kcal 탄수화물 60g 나트륨 300mg',
  );
  expect(reading.basis).toEqual({ size: 100, unit: 'g' });
  expect(reading.values).toEqual({ calories: 500, carbs: 60, sodium: 300 });
});

test('a serving size is borrowed only inside the table, and only from 제공량', () => {
  const borrowed = (pasted: string) => readNutritionLabel(pasted).basis;
  expect(
    borrowed(
      '영양정보\n1회 제공량당\n열량 150kcal\n나트륨 90mg\n상품평\n저는 1회 제공량 30g 정도 먹어요',
    ),
  ).toBeNull();
  expect(
    borrowed('영양정보\n1회 제공량당\n열량 150kcal\n함께 보면 좋은 상품\n다른 과자 1회 제공량 20g'),
  ).toBeNull();
  expect(borrowed('영양정보\n1회 섭취참고량 30g\n1회 제공량당\n열량 150kcal')).toBeNull();
  // Without a heading, the line right above the table is still part of it.
  expect(borrowed('1회 제공량 30g\n1회 제공량당 | 총 내용량당\n열량 150kcal | 300kcal')).toEqual({
    size: 30,
    unit: 'g',
  });
});

test('"총 내용량당" takes the package size nearest to it, not a bundle above the heading', () => {
  const reading = readNutritionLabel(
    '상품정보 총 내용량 500g (25g x 20봉)\n영양정보\n총 내용량 25g\n130kcal\n총 내용량당\n나트륨 100mg',
  );
  expect(reading.basis).toEqual({ size: 25, unit: 'g' });
  expect(reading.values).toEqual({ calories: 130, sodium: 100 });
});

test('heads stacked on two lines, with cells one per line, claim no basis', () => {
  const reading = readNutritionLabel(
    '100g당\n1회 제공량(30g)당\n열량\n250kcal\n75kcal\n단백질\n\n3g',
  );
  expect(reading.basis).toBeNull();
});

// Regression cases from the second review of PR #121.

test('the next product\'s "1회 제공량 50g" is never borrowed, a footnote after the values is', () => {
  const basis = (pasted: string) => readNutritionLabel(pasted).basis;
  expect(
    basis(
      '영양정보\n1회 제공량당\n열량 150kcal\n나트륨 90mg\n영양정보\n1회 제공량 50g\n열량 300kcal\n나트륨 200mg',
    ),
  ).toBeNull();
  expect(
    basis('[A맛] 영양정보 1회 제공량당\n열량 150kcal\n[B맛] 영양정보 1회 제공량 50g\n열량 300kcal'),
  ).toBeNull();
  expect(basis('영양정보\n1회 제공량당\n열량 100kcal\n나트륨 50mg\n(1회 제공량 50g)')).toEqual({
    size: 50,
    unit: 'g',
  });
});

test('without a heading, only a bare serving-size line right above the table lends its size', () => {
  const basis = (pasted: string) => readNutritionLabel(pasted).basis;
  expect(
    basis('리뷰: 1회 제공량 40g씩 먹어요 맛있음\n1회 제공량당\n열량 150kcal\n나트륨 90mg'),
  ).toBeNull();
  expect(
    basis('하루 1회 제공량 40g 권장해요\n1회 제공량당 | 총 내용량당\n열량 150kcal | 300kcal'),
  ).toBeNull();
  expect(basis('배송비 무료 당류 0g\n1회 제공량 30g\n1회 제공량당\n열량 150kcal')).toEqual({
    size: 30,
    unit: 'g',
  });
});

test('a table copied with tabs keeps an empty first cell empty', () => {
  const reading = readNutritionLabel(
    '영양정보\n100g당\t1회 제공량(30g)당\n열량\t250kcal\t75kcal\n당류\t\t5g\n나트륨\t300mg\t90mg',
  );
  expect(reading.basis).toEqual({ size: 100, unit: 'g' });
  expect(reading.values).toEqual({ calories: 250, sodium: 300 });
  // A daily-value share in its own cell is not a column.
  expect(readNutritionLabel('100g당 250kcal\n나트륨\t300mg\t15%').values.sodium).toBe(300);
});

test('a first column whose head is not recognised claims no basis', () => {
  const basis = (pasted: string) => readNutritionLabel(pasted).basis;
  expect(
    basis('영양정보\n총 내용량 500ml | 100ml당\n열량 200kcal | 40kcal\n당류 20g | 4g'),
  ).toBeNull();
  expect(basis('영양정보\n총 내용량(500ml) | 100ml당\n열량 | 200kcal | 40kcal')).toBeNull();
  expect(basis('영양정보\n1병 | 100ml당\n열량 | 200kcal | 40kcal')).toBeNull();
});

test('a name cell and Markdown edge bars do not shift the columns', () => {
  const named = readNutritionLabel('구분 | 100g당 | 1회 제공량(30g)당\n열량 | 250kcal | 75kcal');
  expect(named.basis).toEqual({ size: 100, unit: 'g' });
  expect(named.values).toEqual({ calories: 250 });
  const markdown = readNutritionLabel(
    '| 100g당 | 1회 제공량(30g)당 |\n| 열량 250kcal | 75kcal |\n| 당류 | 5g |',
  );
  expect(markdown.basis).toEqual({ size: 100, unit: 'g' });
  expect(markdown.values).toEqual({ calories: 250 });
});

test('"1회 제공량 30g (100g당)" claims no basis: one column cannot be for both', () => {
  const reading = readNutritionLabel('영양정보\n1회 제공량 30g (100g당)\n열량 75kcal\n나트륨 90mg');
  expect(reading.basis).toBeNull();
  expect(readNutritionLabel('1회 제공량 30g (100g당)\n열량 250kcal').basis).toBeNull();
  expect(
    readNutritionLabel('영양정보\n총 내용량 60g\n1회 제공량 30g (총 내용량당)\n열량 150kcal').basis,
  ).toBeNull();
  // However the serving and the other basis are written (PR #123 review).
  for (const head of [
    '1회 제공량 30g (100g 기준)',
    '1회 제공량 약 30g (100g당)',
    '1회 제공량은 30g (100g당)',
    '1회 제공량 1/2봉지 30g (100g당)',
    '1회 제공량 1개(30g) (100g당)',
    '1회 제공량(30g) (100g당)',
    '1회 제공량 30g (1봉지 100g당)',
    '1회 제공량 30g [100g당]',
    '1회 제공량 30g, 100g당',
    '1회 섭취참고량 30g (100g당)',
    // Other words for the same, and a bare size (2nd review).
    '1회 제공량 30g (100g 중)',
    '1회 제공량 30g (100g에 대해)',
    '1회 제공량 30g (100g 대비)',
    '1회 제공량 30g (100g/당)',
    '1회 제공량 30g (100g)',
    '1회 제공량 30g (100ml당)',
  ]) {
    expect(readNutritionLabel(`영양정보\n${head}\n열량 250kcal`).basis, head).toBeNull();
  }
  // A basis on the heading above the serving.
  expect(readNutritionLabel('영양정보 (100g당)\n1회 제공량 30g\n열량 250kcal').basis).toBeNull();
  // The bracket only notes the serving: the 100g has 당.
  expect(readNutritionLabel('영양정보\n100g당 (1회 제공량 30g)\n열량 250kcal').basis).toEqual({
    size: 100,
    unit: 'g',
  });
  // The serving's own size comes before a bracket, and a bracket alone still gives it.
  expect(readNutritionLabel('영양정보\n1회 제공량 1개(30g)\n열량 150kcal').basis).toEqual({
    size: 30,
    unit: 'g',
  });
  // A weight beside a volume names the same serving: the size written first is kept.
  expect(readNutritionLabel('영양정보\n1회 제공량 200ml (206g)\n열량 100kcal').basis).toEqual({
    size: 200,
    unit: 'ml',
  });
  expect(readNutritionLabel('영양정보\n1회 제공량(30g)당\n열량 75kcal').basis).toEqual({
    size: 30,
    unit: 'g',
  });
  // The package and a price are no other basis (2nd review).
  for (const pasted of [
    '1회 제공량 30g당 (총 내용량 300g)\n열량 120kcal',
    '1회 제공량(30g)당 총 내용량 300g\n열량 120kcal',
    '영양정보 1회 제공량 30g당 / 총 내용량 300g\n열량 120kcal',
    '1회 제공량 30g / 총 2회 제공량(60g)\n열량 120kcal',
    '영양정보 총 내용량 300g (100g당 2,211원)\n1회 제공량 30g\n열량 120kcal',
    '영양정보 (100g당 가격 2,211원)\n1회 제공량 30g\n열량 120kcal',
  ]) {
    expect(readNutritionLabel(pasted).basis, pasted).toEqual({ size: 30, unit: 'g' });
  }
});

test('the 2021 layout with a daily-value column reads the serving values', () => {
  const reading = readNutritionLabel(
    '영양정보\n총 내용량 60g\n1회 제공량 30g\n1회 제공량당 | 1일 영양성분 기준치에 대한 비율\n열량 150kcal |\n나트륨 90mg | 5%\n탄수화물 20g | 6%',
  );
  expect(reading.basis).toEqual({ size: 30, unit: 'g' });
  expect(reading.values).toEqual({ calories: 150, sodium: 90, carbs: 20 });
  const tabs = readNutritionLabel(
    '영양정보\n1회 제공량 30g\n1회 제공량당\t1일 영양성분 기준치에 대한 비율\n열량 150kcal\t\n나트륨 90mg\t5%',
  );
  expect(tabs.basis).toEqual({ size: 30, unit: 'g' });
  expect(tabs.values).toEqual({ calories: 150, sodium: 90 });
  // A daily-value column after the basis is no value column: "열량 | 120kcal" holds the name and value.
  expect(
    readNutritionLabel(
      '영양정보\n100g당 | 1일 영양성분 기준치에 대한 비율\n열량 | 120kcal\n나트륨 | 300mg | 15%',
    ).values,
  ).toEqual({ calories: 120, sodium: 300 });
});

test('a Markdown table is read across its |---| rule', () => {
  const reading = readNutritionLabel(
    '| 구분 | 100g당 | 1회 제공량(30g)당 |\n| --- | :---: | ---: |\n| 열량 | 250kcal | 75kcal |\n| 당류 | | 2g |\n| 나트륨 | 300mg | 90mg |',
  );
  expect(reading.basis).toEqual({ size: 100, unit: 'g' });
  expect(reading.values).toEqual({ calories: 250, sodium: 300 });
  // A rule without bars may part two products: the table still ends there.
  expect(
    readNutritionLabel(
      '영양정보\n100g당\n열량 250kcal\n---\n다른 상품\n1회 제공량 30g\n열량 999kcal',
    ).values,
  ).toEqual({ calories: 250 });
});

test('a short row is read for the first column only where names have a cell of their own', () => {
  const values = (pasted: string) => readNutritionLabel(pasted).values;
  expect(
    values('영양정보\n100g당 | 1회 제공량(30g)당\n열량 | 250kcal\n나트륨 | 300mg | 90mg'),
  ).toEqual({ calories: 250, sodium: 300 });
  expect(
    values('영양정보\n구분\t100g당\t1회 제공량(30g)당\n열량\t250kcal\t75kcal\n당류\t5g'),
  ).toEqual({ calories: 250, sugars: 5 });
  // Names share a cell with the first value: "당류 | 2g" is an empty first cell.
  expect(values('영양정보\n100g당 | 1회 제공량(30g)당\n열량 250kcal | 75kcal\n당류 | 2g')).toEqual({
    calories: 250,
  });
  // Every row short: nothing tells which column the value is in.
  expect(values('영양정보\n100g당 | 1회 제공량(30g)당\n열량 | 250kcal\n나트륨 | 300mg')).toEqual(
    {},
  );
});

test('more name cells are recognised before the first value column', () => {
  for (const name of ['영양성분명', '성분명', '영양소', '영양성분(단위)', '내용']) {
    const reading = readNutritionLabel(`영양정보\n${name} | 100g당\n열량 | 250kcal`);
    expect(reading.basis, name).toEqual({ size: 100, unit: 'g' });
    expect(reading.values, name).toEqual({ calories: 250 });
  }
});
