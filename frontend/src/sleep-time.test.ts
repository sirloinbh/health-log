import { expect, test } from 'vitest';

import { clockOf, dayOf, formatMinutes, minutesBetween, toInstants } from './sleep-time';

test('a sleep across midnight lasts until the morning', () => {
  expect(minutesBetween('23:30', '07:00')).toBe(450);
  expect(toInstants('2026-03-01', '23:30', '07:00')).toEqual({
    bedAt: '2026-02-28T23:30:00+09:00',
    wakeAt: '2026-03-01T07:00:00+09:00',
  });
});

test('going to bed after midnight stays on the same day', () => {
  expect(minutesBetween('01:00', '07:00')).toBe(360);
  expect(toInstants('2026-03-01', '01:00', '07:00').bedAt).toBe('2026-03-01T01:00:00+09:00');
});

test('the same time twice is no sleep at all, which the server refuses', () => {
  expect(minutesBetween('07:00', '07:00')).toBe(0);
  expect(toInstants('2026-03-01', '07:00', '07:00').bedAt).toBe('2026-03-01T07:00:00+09:00');
});

test('a length reads in hours and minutes', () => {
  expect(formatMinutes(450)).toBe('7시간 30분');
  expect(formatMinutes(420)).toBe('7시간');
  expect(formatMinutes(30)).toBe('30분');
});

test('a date from before 1989 reads back at the time that was typed', () => {
  const { wakeAt } = toInstants('1988-07-01', '23:30', '07:00');
  expect(clockOf(new Date(wakeAt).toISOString())).toBe('07:00');
});

test('stored instants read in the service time zone', () => {
  expect(clockOf('2026-02-28T14:30:00.000Z')).toBe('23:30');
  expect(dayOf('2026-02-28T14:30:00.000Z')).toBe('2026-02-28');
  expect(clockOf('2026-02-28T15:05:00.000Z')).toBe('00:05');
  expect(dayOf('2026-02-28T15:05:00.000Z')).toBe('2026-03-01');
});
