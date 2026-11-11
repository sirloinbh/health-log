import { expect, test } from 'vitest';

import {
  actualText,
  changeText,
  countsUntil,
  currentText,
  type Goals,
  sleepParts,
  targetText,
  toSleepTarget,
  toTarget,
  withoutChange,
} from './goal-text';

test('each goal says which way it points', () => {
  expect(targetText('calories', 2000)).toBe('Up to 2,000kcal a day');
  expect(targetText('protein', 100)).toBe('At least 100g a day');
  expect(targetText('sleep', 450)).toBe('At least 7 h 30 min');
  expect(targetText('sober_days', 5)).toBe('At least 5 alcohol-free days a week');
  expect(changeText('sleep', null)).toBe('Goal off');
});

test('sleep is typed in hours and minutes, so any whole minute can be a goal', () => {
  expect(toSleepTarget(7, 30)).toBe(450);
  // Not a decimal number of hours: 7.1666… could not be typed.
  expect(toSleepTarget(7, 10)).toBe(430);
  expect(toSleepTarget(24, 0)).toBe(1440);
  expect(toSleepTarget(1, 0)).toBe(60);
  expect(toSleepTarget(0, 59)).toMatch('between 1 and 24 hours');
  expect(toSleepTarget(24, 1)).toMatch('between 1 and 24 hours');
  expect(toSleepTarget(7, 60)).toMatch('from 0 to 59');
  expect(toSleepTarget(7.5, 0)).toMatch('whole number');
  expect(sleepParts(430)).toEqual({ hours: '7', minutes: '10' });
  expect(sleepParts(445)).toEqual({ hours: '7', minutes: '25' });
});

test('deleting a change brings back the goal before it, as of today', () => {
  const goals: Goals = {
    today: '2026-11-06',
    week: { from: '2026-11-02', to: '2026-11-08' },
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
  expect(toTarget('calories', 1800.5)).toMatch('whole number');
  expect(toTarget('calories', 99)).toMatch('100 to 10000 kcal');
  expect(toTarget('protein', 1001)).toMatch('1 to 1000 g');
  expect(toTarget('sober_days', 8)).toMatch('1 to 7 days');
});

test('the actual side says when nothing was recorded, and what was left out', () => {
  const empty = { entries: 0, total: null, missing: 0 };
  expect(actualText({ item: 'calories', goal: null, status: null, actual: empty })).toBe(
    'No meal records',
  );
  expect(
    actualText({
      item: 'protein',
      goal: null,
      status: null,
      actual: { entries: 3, total: 82.5, missing: 1 },
    }),
  ).toBe('82.5g (excludes 1 food with unknown values)');
  // Every entry unknown: no sum to show, not 0g.
  expect(
    actualText({
      item: 'protein',
      goal: null,
      status: null,
      actual: { entries: 2, total: null, missing: 2 },
    }),
  ).toBe('2 foods with unknown values');
  expect(actualText({ item: 'sleep', goal: null, status: null, actual: { minutes: null } })).toBe(
    'No sleep record',
  );
  const week = { from: '2026-11-02', to: '2026-11-08' };
  expect(
    actualText({
      item: 'sober_days',
      goal: null,
      status: null,
      actual: { ...week, recordedDays: 0, soberDays: 0 },
    }),
  ).toBe('This week (Nov 2 – Nov 8): no drink records');
  expect(
    actualText({
      item: 'sober_days',
      goal: null,
      status: null,
      actual: { ...week, recordedDays: 4, soberDays: 3 },
    }),
  ).toBe('This week (Nov 2 – Nov 8): 3 alcohol-free days / 4 days recorded');
});

test('sober days count a change up to this Sunday as current, daily goals only up to today', () => {
  const goals: Goals = {
    today: '2026-11-06',
    week: { from: '2026-11-02', to: '2026-11-08' },
    current: {
      calories: { from: '2026-11-01', target: 2000 },
      protein: null,
      sleep: null,
      sober_days: { from: '2026-11-07', target: 6 },
    },
    history: [
      { item: 'calories', from: '2026-11-07', target: 1800 },
      { item: 'calories', from: '2026-11-01', target: 2000 },
      { item: 'sober_days', from: '2026-11-09', target: 7 },
      { item: 'sober_days', from: '2026-11-07', target: 6 },
      { item: 'sober_days', from: '2026-11-01', target: 5 },
    ],
  };
  expect(currentText(goals, 'sober_days')).toBe(
    "This week's goal (Nov 2 – Nov 8): At least 6 alcohol-free days a week (from 2026-11-07)",
  );
  expect(currentText(goals, 'calories')).toBe(
    'Current goal: Up to 2,000kcal a day (from 2026-11-01)',
  );
  expect(currentText(goals, 'protein')).toBe('Current goal: not set');
  // Deleting next week's sober change leaves Saturday's as this week's.
  expect(withoutChange(goals, 'sober_days', '2026-11-09').current.sober_days).toEqual({
    from: '2026-11-07',
    target: 6,
  });
  // Deleting Saturday's brings back the one before it.
  expect(withoutChange(goals, 'sober_days', '2026-11-07').current.sober_days).toEqual({
    from: '2026-11-01',
    target: 5,
  });
  // A daily change from Saturday never counted today, so deleting it changes nothing current.
  expect(withoutChange(goals, 'calories', '2026-11-07').current.calories).toEqual({
    from: '2026-11-01',
    target: 2000,
  });
});

test('a sober change on this Sunday already counts, and one turning it off leaves no goal', () => {
  const base = {
    today: '2026-11-06',
    week: { from: '2026-11-02', to: '2026-11-08' },
    current: { calories: null, protein: null, sleep: null, sober_days: null },
  };
  // Sunday is the week's last day, the day its goal is read on.
  const sunday: Goals = {
    ...base,
    history: [
      { item: 'sober_days', from: '2026-11-09', target: 7 },
      { item: 'sober_days', from: '2026-11-08', target: 6 },
      { item: 'sober_days', from: '2026-11-01', target: 5 },
    ],
  };
  expect(withoutChange(sunday, 'sober_days', '2026-11-09').current.sober_days).toEqual({
    from: '2026-11-08',
    target: 6,
  });
  expect(countsUntil(sunday, 'sober_days')).toBe('2026-11-08');
  expect(countsUntil(sunday, 'calories')).toBe('2026-11-06');
  // Turned off from Saturday: this week has no sober goal, and the card says so.
  const off: Goals = {
    ...base,
    history: [
      { item: 'sober_days', from: '2026-11-09', target: 7 },
      { item: 'sober_days', from: '2026-11-07', target: null },
      { item: 'sober_days', from: '2026-11-01', target: 5 },
    ],
  };
  const afterDelete = withoutChange(off, 'sober_days', '2026-11-09');
  expect(afterDelete.current.sober_days).toBeNull();
  expect(currentText(afterDelete, 'sober_days')).toBe("This week's goal (Nov 2 – Nov 8): not set");
});
