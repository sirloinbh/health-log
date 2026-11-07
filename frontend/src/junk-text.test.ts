import { expect, test } from 'vitest';

import { type JunkPeriod, junkText } from './junk-text';

const period = (times: number, days: number, value: number | null, missing = 0): JunkPeriod => ({
  from: '2026-11-02',
  to: '2026-11-08',
  times,
  days,
  calories: { value, missing },
});

test('times, days and calories read in one line', () => {
  expect(junkText(period(3, 2, 1850))).toBe('3회 · 먹은 날 2일 · 1850kcal');
});

test('a period without junk food says so', () => {
  expect(junkText(period(0, 0, null))).toBe('없음');
});

test('unknown calories are named instead of counted as zero', () => {
  expect(junkText(period(1, 1, null, 1))).toBe('1회 · 먹은 날 1일 · 칼로리 값 없음');
  expect(junkText(period(2, 1, 250, 1))).toBe(
    '2회 · 먹은 날 1일 · 250kcal 이상 (칼로리 모르는 기록 1개 제외)',
  );
});
