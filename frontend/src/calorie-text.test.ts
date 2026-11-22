import { expect, test } from 'vitest';

import { kcalText } from './calorie-text';

test('calories are rounded to a whole number and grouped by thousands', () => {
  expect(kcalText(1234.75)).toBe('1,235kcal');
  expect(kcalText(1234.25)).toBe('1,234kcal');
  expect(kcalText(999.5)).toBe('1,000kcal');
  expect(kcalText(0)).toBe('0kcal');
  expect(kcalText(12_345_678)).toBe('12,345,678kcal');
});
