import { expect, test } from 'vitest';

import {
  changeText,
  minutesText,
  periodSpan,
  periodWords,
  shareOf,
  shiftPeriod,
  spanLabel,
} from './report-text';

test('minutes read as hours and minutes', () => {
  expect(minutesText(450)).toBe('7시간 30분');
  expect(minutesText(420)).toBe('7시간');
  expect(minutesText(45)).toBe('45분');
  expect(minutesText(449.6)).toBe('7시간 30분');
});

test('a change says which way and how many days the earlier side had; an empty side is no change', () => {
  const words = periodWords.week;
  expect(changeText(450, 420, 5, words, minutesText)).toBe('지난주(5일)보다 +30분');
  expect(changeText(400, 460, 1, words, minutesText)).toBe('지난주(1일)보다 -1시간');
  expect(changeText(420, 420, 3, words, minutesText)).toBe('지난주(3일)와 같음');
  expect(changeText(420, 420, 20, periodWords.month, minutesText)).toBe('지난달(20일)과 같음');
  expect(changeText(420, null, 0, words, minutesText)).toBe('지난주 기록 없음');
  expect(changeText(null, 420, 4, words, minutesText)).toBeNull();
});

test('a share is out of the days answered, and none answered is no share', () => {
  expect(shareOf({ days: 4, yes: 3 })).toBe(75);
  expect(shareOf({ days: 3, yes: 2 })).toBe(67);
  expect(shareOf({ days: 0, yes: 0 })).toBeNull();
});

test('moving a period steps a week or a calendar month, across a year too', () => {
  expect(shiftPeriod('week', '2026-11-02', -1)).toBe('2026-10-26');
  expect(shiftPeriod('week', '2026-12-28', 1)).toBe('2027-01-04');
  expect(shiftPeriod('month', '2026-01-01', -1)).toBe('2025-12-01');
  expect(shiftPeriod('month', '2026-12-01', 1)).toBe('2027-01-01');
});

test('a span of this year reads as Korean month and day', () => {
  expect(spanLabel({ from: '2026-11-02', to: '2026-11-08' }, '2026-11-05')).toBe(
    '11월 2일 ~ 11월 8일',
  );
});

test('a span of another year, or across one, names the year (#129)', () => {
  expect(spanLabel({ from: '1999-12-27', to: '2000-01-02' }, '2026-11-05')).toBe(
    '1999년 12월 27일 ~ 2000년 1월 2일',
  );
  expect(spanLabel({ from: '2025-11-01', to: '2025-11-30' }, '2026-11-05')).toBe(
    '2025년 11월 1일 ~ 11월 30일',
  );
  // A week across this new year names both years too.
  expect(spanLabel({ from: '2026-12-28', to: '2027-01-03' }, '2026-12-30')).toBe(
    '2026년 12월 28일 ~ 2027년 1월 3일',
  );
  // Without the server's today, which year is this one is unknown.
  expect(spanLabel({ from: '2026-11-02', to: '2026-11-08' }, null)).toBe(
    '2026년 11월 2일 ~ 11월 8일',
  );
});

test('the period holding a date matches the server: Monday to Sunday, or the calendar month', () => {
  expect(periodSpan('week', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  expect(periodSpan('week', '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  expect(periodSpan('week', '2000-01-01')).toEqual({ from: '1999-12-27', to: '2000-01-02' });
  expect(periodSpan('month', '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(periodSpan('month', '2099-12-31')).toEqual({ from: '2099-12-01', to: '2099-12-31' });
});
