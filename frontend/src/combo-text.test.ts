import { expect, test } from 'vitest';

import { type Combo, comboSummary, fullName } from './combo-text';

const item = {
  foodId: 1,
  name: '햇반',
  brand: null,
  servings: 1,
  servingSize: 210,
  servingUnit: 'g',
  calories: 300,
};
// The totals agree with the items: each food's calories, or null for the `missing` ones (#206).
const combo = (itemCalories: (number | null)[]): Combo => {
  const known = itemCalories.filter((value) => value !== null);
  return {
    id: 1,
    name: '세트',
    items: itemCalories.map((calories, index) => ({ ...item, foodId: index + 1, calories })),
    calories: {
      value: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
      missing: itemCalories.length - known.length,
    },
  };
};

test('a name carries its brand in front when it has one', () => {
  expect(fullName({ brand: '샘플', name: '햇반' })).toBe('샘플 햇반');
  expect(fullName({ brand: null, name: '햇반' })).toBe('햇반');
});

test('the summary counts foods and says which calories it could not count', () => {
  expect(comboSummary(combo([300, 300]))).toBe('2 foods · 600kcal');
  expect(comboSummary(combo([300, null]))).toBe(
    '2 foods · 300kcal (excludes 1 food with unknown calories)',
  );
  expect(comboSummary(combo([null, null]))).toBe('2 foods · No calorie value');
  expect(comboSummary(combo([]))).toBe('No foods');
});

test('a fractional total is rounded and grouped like the report', () => {
  // 1.5 servings of 412.5kcal plus 615.5kcal, as the API sums them exactly.
  expect(comboSummary(combo([618.75, 615.5, 0.5]))).toBe('3 foods · 1,235kcal');
  expect(comboSummary(combo([1234.25, null]))).toBe(
    '2 foods · 1,234kcal (excludes 1 food with unknown calories)',
  );
});
