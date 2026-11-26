import { expect, test } from 'vitest';

import { mealAt, waterText } from './quick-entry-text';

// Asia/Seoul is UTC+9 with no daylight saving, so 05:00 there is 20:00 UTC the day before.
const seoul = (time: string) => new Date(`2026-11-26T${time}:00+09:00`);

test('the meal follows the hour in Seoul, with each boundary starting the next meal', () => {
  expect(mealAt(seoul('04:59'))).toBe('snack');
  expect(mealAt(seoul('05:00'))).toBe('breakfast');
  expect(mealAt(seoul('09:59'))).toBe('breakfast');
  expect(mealAt(seoul('10:00'))).toBe('lunch');
  expect(mealAt(seoul('14:59'))).toBe('lunch');
  expect(mealAt(seoul('15:00'))).toBe('dinner');
  expect(mealAt(seoul('20:59'))).toBe('dinner');
  expect(mealAt(seoul('21:00'))).toBe('snack');
  expect(mealAt(seoul('00:00'))).toBe('snack');
});

test('the meal does not depend on the device time zone', () => {
  // 01:00 UTC is 10:00 in Seoul, though it is still night in Europe.
  expect(mealAt(new Date('2026-11-26T01:00:00Z'))).toBe('lunch');
});

test('the water line counts cups and millilitres', () => {
  expect(waterText(0, 0)).toBe('0 cups · 0 ml');
  expect(waterText(1, 250)).toBe('1 cup · 250 ml');
  expect(waterText(5, 1250)).toBe('5 cups · 1,250 ml');
});
