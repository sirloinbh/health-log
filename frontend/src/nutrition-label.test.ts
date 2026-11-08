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
    total: { size: 500, unit: 'g' },
    values: { calories: 250, carbs: 30, protein: 5, fat: 12, sugars: 10, sodium: 300 },
    lessThan: [],
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
    total: null,
    values: {},
    lessThan: [],
  });
});

test('a package larger than the basis says how many servings it is', () => {
  expect(packageText(readNutritionLabel(per100g))).toBe(
    '총 내용량 500g은(는) 1회 제공량(100g)의 5배, 약 1,250kcal입니다. 한 봉지를 다 먹었으면 식사에 5회분으로 기록하세요.',
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
