import { expect, test } from 'vitest';

import { drinkingText, drinksText, smokingText, spanText, summaryLines } from './habit-text';

test('drinks read as kind, amount and unit', () => {
  expect(
    drinksText([
      { kind: 'soju', unit: 'bottle', amount: 1 },
      { kind: 'beer', unit: 'glass', amount: 2.5 },
    ]),
  ).toBe('Soju 1 bottle, Beer 2.5 glasses');
});

test('not recorded and none are different words', () => {
  expect(smokingText(null)).toBe('Not recorded');
  expect(smokingText(0)).toBe('No smoking');
  expect(smokingText(12)).toBe('12 cigarettes');
  expect(drinkingText(null)).toBe('Not recorded');
  expect(drinkingText([])).toBe('No drinking');
});

test('a period shows its dates', () => {
  expect(spanText({ from: '2026-10-26', to: '2026-11-01' })).toBe('Oct 26 – Nov 1');
});

test('a period with no recorded day says so instead of a zero total', () => {
  const empty = {
    from: '2026-11-02',
    to: '2026-11-08',
    smoking: { days: 0, cigarettes: null },
    drinking: { days: 0, drinkingDays: 0, totals: [] },
  };
  expect(summaryLines(empty)).toEqual({ smoking: 'No records', drinking: 'No records' });

  const recordedNone = {
    ...empty,
    smoking: { days: 2, cigarettes: 0 },
    drinking: { days: 2, drinkingDays: 0, totals: [] },
  };
  expect(summaryLines(recordedNone)).toEqual({
    smoking: '0 cigarettes (2 days recorded)',
    drinking: 'Drank on 0 days / 2 days recorded',
  });

  const some = {
    ...empty,
    smoking: { days: 3, cigarettes: 17 },
    drinking: {
      days: 3,
      drinkingDays: 2,
      totals: [{ kind: 'soju' as const, unit: 'bottle' as const, amount: 1.5 }],
    },
  };
  expect(summaryLines(some)).toEqual({
    smoking: '17 cigarettes (3 days recorded)',
    drinking: 'Drank on 2 days / 3 days recorded · Soju 1.5 bottles',
  });
});
