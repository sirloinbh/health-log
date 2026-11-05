import { expect, test } from 'vitest';

import { drinkingText, drinksText, smokingText, spanText, summaryLines } from './habit-text';

test('drinks read as kind, amount and unit', () => {
  expect(
    drinksText([
      { kind: 'soju', unit: 'bottle', amount: 1 },
      { kind: 'beer', unit: 'glass', amount: 2.5 },
    ]),
  ).toBe('소주 1병, 맥주 2.5잔');
});

test('not recorded and none are different words', () => {
  expect(smokingText(null)).toBe('기록 안 함');
  expect(smokingText(0)).toBe('안 피움');
  expect(smokingText(12)).toBe('12개비');
  expect(drinkingText(null)).toBe('기록 안 함');
  expect(drinkingText([])).toBe('안 마심');
});

test('a period shows its dates', () => {
  expect(spanText({ from: '2026-10-26', to: '2026-11-01' })).toBe('10.26~11.01');
});

test('a period with no recorded day says so instead of a zero total', () => {
  const empty = {
    from: '2026-11-02',
    to: '2026-11-08',
    smoking: { days: 0, cigarettes: null },
    drinking: { days: 0, drinkingDays: 0, totals: [] },
  };
  expect(summaryLines(empty)).toEqual({ smoking: '기록 없음', drinking: '기록 없음' });

  const recordedNone = {
    ...empty,
    smoking: { days: 2, cigarettes: 0 },
    drinking: { days: 2, drinkingDays: 0, totals: [] },
  };
  expect(summaryLines(recordedNone)).toEqual({
    smoking: '0개비 (기록한 날 2일)',
    drinking: '마신 날 0일 / 기록한 날 2일',
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
    smoking: '17개비 (기록한 날 3일)',
    drinking: '마신 날 2일 / 기록한 날 3일 · 소주 1.5병',
  });
});
