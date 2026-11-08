import { expect, test } from 'vitest';

import { actualText, changeText, targetText, toTarget, toTyped } from './goal-text';

test('each goal says which way it points', () => {
  expect(targetText('calories', 2000)).toBe('하루 2,000kcal 이하');
  expect(targetText('protein', 100)).toBe('하루 100g 이상');
  expect(targetText('sleep', 450)).toBe('7시간 30분 이상');
  expect(targetText('sober_days', 5)).toBe('주 5일 이상 금주');
  expect(changeText('sleep', null)).toBe('목표 끔');
});

test('sleep is typed in hours and kept in whole minutes', () => {
  expect(toTarget('sleep', 7.5)).toBe(450);
  expect(toTarget('sleep', 7.25)).toBe(435);
  expect(toTarget('sleep', 7.33)).toMatch('분 단위로');
  expect(toTarget('sleep', 0.5)).toMatch('1~24시간');
  expect(toTyped('sleep', 450)).toBe('7.5');
  expect(toTyped('sleep', 435)).toBe('7.25');
});

test('other goals take whole numbers in their own ranges', () => {
  expect(toTarget('calories', 1800)).toBe(1800);
  expect(toTarget('calories', 1800.5)).toMatch('정수로');
  expect(toTarget('calories', 99)).toMatch('100~10000kcal');
  expect(toTarget('protein', 1001)).toMatch('1~1000g');
  expect(toTarget('sober_days', 8)).toMatch('1~7일');
  expect(toTyped('calories', 1800)).toBe('1800');
});

test('the actual side says when nothing was recorded, and what was left out', () => {
  const empty = { entries: 0, total: null, missing: 0 };
  expect(actualText({ item: 'calories', goal: null, status: null, actual: empty })).toBe(
    '식사 기록 없음',
  );
  expect(
    actualText({
      item: 'protein',
      goal: null,
      status: null,
      actual: { entries: 3, total: 82.5, missing: 1 },
    }),
  ).toBe('82.5g (값을 모르는 음식 1개 제외)');
  // Every entry unknown: no sum to show, not 0g.
  expect(
    actualText({
      item: 'protein',
      goal: null,
      status: null,
      actual: { entries: 2, total: null, missing: 2 },
    }),
  ).toBe('값을 모르는 음식 2개');
  expect(actualText({ item: 'sleep', goal: null, status: null, actual: { minutes: null } })).toBe(
    '수면 기록 없음',
  );
  const week = { from: '2026-11-02', to: '2026-11-08' };
  expect(
    actualText({
      item: 'sober_days',
      goal: null,
      status: null,
      actual: { ...week, recordedDays: 0, soberDays: 0 },
    }),
  ).toBe('이 주(11.02~11.08) 술 기록 없음');
  expect(
    actualText({
      item: 'sober_days',
      goal: null,
      status: null,
      actual: { ...week, recordedDays: 4, soberDays: 3 },
    }),
  ).toBe('이 주(11.02~11.08) 금주 3일 / 기록 4일');
});
