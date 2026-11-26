import { expect, test } from 'vitest';

import { type LabResult, parseLabNumber, rangeStatus, rangeText, valueText } from './lab-text';

const item = (overrides: Partial<LabResult> = {}): LabResult => ({
  id: 1,
  date: '2026-03-15',
  name: '가상콜레스테롤',
  value: 190,
  unit: 'mg/dL',
  refLow: 0,
  refHigh: 200,
  note: null,
  visit: null,
  ...overrides,
});

test('a typed number is read, blank is no value and anything else is unreadable', () => {
  expect(parseLabNumber('190')).toBe(190);
  expect(parseLabNumber(' 4.25 ')).toBe(4.25);
  expect(parseLabNumber('')).toBeNull();
  for (const bad of ['-1', '1,5', '1.23456', 'abc', '1e3', '1000000001', '12345678901'])
    expect(parseLabNumber(bad)).toBeUndefined();
  expect(parseLabNumber('1000000000')).toBe(1_000_000_000);
});

test('the value reads with its unit when there is one', () => {
  expect(valueText(item())).toBe('190 mg/dL');
  expect(valueText(item({ unit: null }))).toBe('190');
});

test('the reference range reads for a full, one-sided or missing range', () => {
  expect(rangeText(item())).toBe('Reference 0 - 200 mg/dL');
  expect(rangeText(item({ refLow: null }))).toBe('Reference up to 200 mg/dL');
  expect(rangeText(item({ refHigh: null, refLow: 10, unit: null }))).toBe('Reference from 10');
  expect(rangeText(item({ refLow: null, refHigh: null }))).toBeNull();
});

test('the status compares a value with the range, and has none without a range', () => {
  expect(rangeStatus(item())).toBe('normal');
  expect(rangeStatus(item({ value: 200 }))).toBe('normal');
  expect(rangeStatus(item({ value: 201 }))).toBe('high');
  expect(rangeStatus(item({ refLow: 195 }))).toBe('low');
  expect(rangeStatus(item({ refLow: null, refHigh: null }))).toBeNull();
});
