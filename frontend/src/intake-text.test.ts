import { expect, test } from 'vitest';

import { amountText, intakeSummary } from './intake-text';

test('water is in ml and the other kinds in mg', () => {
  expect(amountText('water', 1250)).toBe('1,250 ml');
  expect(amountText('tea', 40)).toBe('40 mg');
});

test('the summary joins the two totals', () => {
  const day = {
    date: '2026-11-04',
    kinds: {} as never,
    waterMl: 500,
    caffeineMg: 190,
  };
  expect(intakeSummary(day)).toBe('Water 500 ml · Caffeine 190 mg');
});
