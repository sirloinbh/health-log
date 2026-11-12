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
const combo = (calories: Combo['calories'], count = 2): Combo => ({
  id: 1,
  name: '세트',
  items: Array.from({ length: count }, (_, index) => ({ ...item, foodId: index + 1 })),
  calories,
});

test('a name carries its brand in front when it has one', () => {
  expect(fullName({ brand: '샘플', name: '햇반' })).toBe('샘플 햇반');
  expect(fullName({ brand: null, name: '햇반' })).toBe('햇반');
});

test('the summary counts foods and says which calories it could not count', () => {
  expect(comboSummary(combo({ value: 600, missing: 0 }))).toBe('2 foods · 600kcal');
  expect(comboSummary(combo({ value: 300, missing: 1 }))).toBe(
    '2 foods · 300kcal (excludes 1 food with unknown calories)',
  );
  expect(comboSummary(combo({ value: null, missing: 2 }))).toBe('2 foods · No calorie value');
  expect(comboSummary(combo({ value: null, missing: 0 }, 0))).toBe('No foods');
});
