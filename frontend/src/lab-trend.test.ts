import { expect, test } from 'vitest';

import {
  changeText,
  chartOf,
  mixedUnits,
  optionText,
  type TrendPoint,
  trendRows,
  unitsOf,
} from './lab-trend';

const point = (id: number, date: string, value: number, overrides: Partial<TrendPoint> = {}) =>
  ({ id, date, value, unit: 'mg/dL', refLow: 0, refHigh: 200, ...overrides });

test('each row changes against the result before it, in the same unit', () => {
  const rows = trendRows([
    point(1, '2022-03-01', 180.3),
    point(2, '2024-03-01', 190.4),
    point(3, '2025-03-01', 190.4),
    point(4, '2026-03-01', 150, { unit: 'mmol/L' }),
  ]);
  expect(rows.map((row) => row.change)).toEqual([null, '+10.1 mg/dL', 'No change', null]);
});

test('floating point does not leak into a change', () => {
  expect(changeText(point(1, '2025-01-01', 0.1), point(2, '2025-02-01', 0.3))).toBe('+0.2 mg/dL');
  const noUnit = { unit: null };
  expect(changeText(point(1, '2025-01-01', 5, noUnit), point(2, '2025-02-01', 3, noUnit))).toBe(
    '−2',
  );
});

test('each row says whether it was inside the range it was measured against', () => {
  const rows = trendRows([
    point(1, '2022-03-01', 210),
    point(2, '2023-03-01', 100, { refLow: 120 }),
    point(3, '2024-03-01', 100),
    point(4, '2025-03-01', 100, { refLow: null, refHigh: null }),
  ]);
  expect(rows.map((row) => row.status)).toEqual(['high', 'low', 'normal', null]);
});

test('units are listed in the order first used and mixed ones are noticed', () => {
  const points = [
    point(1, '2022-03-01', 1),
    point(2, '2023-03-01', 1, { unit: 'mmol/L' }),
    point(3, '2024-03-01', 1),
  ];
  expect(unitsOf(points)).toEqual(['mg/dL', 'mmol/L']);
  expect(mixedUnits(points)).toBe(true);
  expect(mixedUnits(points.filter((item) => item.unit === 'mg/dL'))).toBe(false);
  expect(mixedUnits([point(1, '2022-03-01', 1, { unit: null })])).toBe(false);
});

test('the selector names a test with its count', () => {
  expect(optionText({ name: 'LDL', count: 1, latest: '2026-01-01' })).toBe('LDL (1 result)');
  expect(optionText({ name: 'LDL', count: 3, latest: '2026-01-01' })).toBe('LDL (3 results)');
});

test('the chart spaces dots by date, puts higher values higher and draws the latest range as a band', () => {
  const chart = chartOf([
    point(1, '2024-01-01', 100),
    point(2, '2024-01-11', 200),
    point(3, '2024-01-21', 150),
  ]);
  const [first, second, third] = chart.dots;
  expect(first.x).toBeLessThan(second.x);
  expect(second.x).toBeCloseTo((first.x + third.x) / 2);
  expect(second.y).toBeLessThan(first.y);
  expect(chart.band).not.toBeNull();
  expect(chart.band!.y).toBeGreaterThanOrEqual(0);
  expect(chart.band!.y + chart.band!.height).toBeLessThanOrEqual(chart.height);
});

test('a single result sits in the middle, and no range means no band', () => {
  const chart = chartOf([point(1, '2024-01-01', 100, { refLow: null, refHigh: null })]);
  expect(chart.dots).toHaveLength(1);
  expect(chart.dots[0].x).toBe(chart.width / 2);
  expect(Number.isFinite(chart.dots[0].y)).toBe(true);
  expect(chart.band).toBeNull();
});
