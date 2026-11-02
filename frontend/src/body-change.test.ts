import { expect, test } from 'vitest';

import { type BodyRecord, changeOver, formatChange, formatSpan } from './body-change';

const record = (date: string, weightKg: number | null, waistCm: number | null = null) =>
  ({
    date,
    weightKg,
    waistCm,
    bodyFatPercent: null,
    systolicMmhg: null,
    diastolicMmhg: null,
    memo: null,
  }) satisfies BodyRecord;

test('the change runs from the first to the last measurement, in any input order', () => {
  const records = [record('2026-03-15', 69), record('2026-03-10', 70), record('2026-03-12', 75)];
  expect(changeOver(records, 'weightKg', '2026-03-15', 7)).toEqual({
    amount: -1,
    from: '2026-03-10',
    to: '2026-03-15',
  });
});

test('a window counts the day itself and stops at its first day', () => {
  const records = [record('2026-03-08', 80), record('2026-03-09', 70), record('2026-03-15', 71)];
  // Seven days ending on the 15th start on the 9th, across no earlier records.
  expect(changeOver(records, 'weightKg', '2026-03-15', 7)?.from).toBe('2026-03-09');
  expect(changeOver(records, 'weightKg', '2026-03-15', 30)?.from).toBe('2026-03-08');
});

test('records after the day on screen do not count', () => {
  const records = [record('2026-03-10', 70), record('2026-03-12', 71), record('2026-03-20', 90)];
  expect(changeOver(records, 'weightKg', '2026-03-15', 7)?.amount).toBe(1);
});

test('one measurement is not a change, and empty values are skipped', () => {
  expect(changeOver([record('2026-03-15', 70)], 'weightKg', '2026-03-15', 7)).toBeNull();
  expect(
    changeOver([record('2026-03-10', null), record('2026-03-15', 70)], 'weightKg', '2026-03-15', 7),
  ).toBeNull();
  expect(
    changeOver(
      [record('2026-03-10', 70), record('2026-03-12', null, 80), record('2026-03-15', 71)],
      'weightKg',
      '2026-03-15',
      7,
    )?.amount,
  ).toBe(1);
});

test('the amount has no floating point noise', () => {
  const records = [record('2026-03-10', 70), record('2026-03-15', 70.1)];
  expect(changeOver(records, 'weightKg', '2026-03-15', 7)?.amount).toBe(0.1);
});

test('a change names the days it compares', () => {
  expect(formatSpan({ amount: 1, from: '2026-03-09', to: '2026-03-10' })).toBe('3/9~3/10');
  expect(formatSpan({ amount: 1, from: '2025-12-31', to: '2026-01-02' })).toBe('12/31~1/2');
});

test('a change reads with its sign and unit', () => {
  const change = { from: '2026-03-10', to: '2026-03-15' };
  expect(formatChange({ ...change, amount: 1.5 }, 'kg')).toBe('+1.5kg');
  expect(formatChange({ ...change, amount: -0.4 }, 'kg')).toBe('−0.4kg');
  expect(formatChange({ ...change, amount: 0 }, 'kg')).toBe('변화 없음');
});
