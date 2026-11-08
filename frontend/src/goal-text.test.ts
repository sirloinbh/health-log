import { expect, test } from 'vitest';

import {
  actualText,
  changeText,
  type Goals,
  sleepParts,
  targetText,
  toSleepTarget,
  toTarget,
  withoutChange,
} from './goal-text';

test('each goal says which way it points', () => {
  expect(targetText('calories', 2000)).toBe('하루 2,000kcal 이하');
  expect(targetText('protein', 100)).toBe('하루 100g 이상');
  expect(targetText('sleep', 450)).toBe('7시간 30분 이상');
  expect(targetText('sober_days', 5)).toBe('주 5일 이상 금주');
  expect(changeText('sleep', null)).toBe('목표 끔');
});

test('sleep is typed in hours and minutes, so any whole minute can be a goal', () => {
  expect(toSleepTarget(7, 30)).toBe(450);
  // Not a decimal number of hours: 7.1666… could not be typed.
  expect(toSleepTarget(7, 10)).toBe(430);
  expect(toSleepTarget(24, 0)).toBe(1440);
  expect(toSleepTarget(1, 0)).toBe(60);
  expect(toSleepTarget(0, 59)).toMatch('1시간~24시간');
  expect(toSleepTarget(24, 1)).toMatch('1시간~24시간');
  expect(toSleepTarget(7, 60)).toMatch('0~59');
  expect(toSleepTarget(7.5, 0)).toMatch('정수로');
  expect(sleepParts(430)).toEqual({ hours: '7', minutes: '10' });
  expect(sleepParts(445)).toEqual({ hours: '7', minutes: '25' });
});

test('deleting a change brings back the goal before it, as of today', () => {
  const goals: Goals = {
    today: '2026-11-06',
    current: {
      calories: { from: '2026-11-05', target: 1800 },
      protein: null,
      sleep: null,
      sober_days: null,
    },
    history: [
      { item: 'calories', from: '2026-12-01', target: 1500 },
      { item: 'calories', from: '2026-11-05', target: 1800 },
      { item: 'calories', from: '2026-11-01', target: null },
      { item: 'calories', from: '2026-10-01', target: 2000 },
      { item: 'protein', from: '2026-11-05', target: 100 },
    ],
  };
  // A coming change goes, and today's goal stays.
  const coming = withoutChange(goals, 'calories', '2026-12-01');
  expect(coming.current.calories).toEqual({ from: '2026-11-05', target: 1800 });
  expect(coming.history).toHaveLength(4);
  // The change before today's was "off", so no goal is left.
  expect(withoutChange(goals, 'calories', '2026-11-05').current.calories).toBeNull();
  // Other items keep their changes.
  expect(withoutChange(goals, 'calories', '2026-11-05').history).toContainEqual({
    item: 'protein',
    from: '2026-11-05',
    target: 100,
  });
});

test('other goals take whole numbers in their own ranges', () => {
  expect(toTarget('calories', 1800)).toBe(1800);
  expect(toTarget('calories', 1800.5)).toMatch('정수로');
  expect(toTarget('calories', 99)).toMatch('100~10000kcal');
  expect(toTarget('protein', 1001)).toMatch('1~1000g');
  expect(toTarget('sober_days', 8)).toMatch('1~7일');
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
