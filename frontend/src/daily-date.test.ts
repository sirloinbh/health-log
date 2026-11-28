import { expect, test } from 'vitest';

import { addDays } from './components/period-nav/periods';
import { formatDate, inDailyRange, isValidDate } from './daily-date';

test.each(['2026-10-31', '2028-02-29'])('accepts the real date %s', (value) => {
  expect(isValidDate(value)).toBe(true);
});

test.each(['2026-02-30', '2026-13-01', '2027-02-29', '2026-1-1', '20261031', 'today', ''])(
  'rejects %j',
  (value) => {
    expect(isValidDate(value)).toBe(false);
  },
);

test('shifting crosses month, year and leap day boundaries', () => {
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
});

test('formats the date with its weekday in Korean', () => {
  expect(formatDate('2026-10-31')).toBe('Saturday, October 31, 2026');
});

test('the daily page opens 2000-01-01 to 2099-12-31', () => {
  expect(inDailyRange('2000-01-01')).toBe(true);
  expect(inDailyRange('2099-12-31')).toBe(true);
  expect(inDailyRange('1999-12-31')).toBe(false);
  expect(inDailyRange('2100-01-01')).toBe(false);
  expect(inDailyRange('0002-03-15')).toBe(false);
});
