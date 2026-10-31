import { expect, test } from 'vitest';

import { formatDate, isValidDate, shiftDate } from './daily-date';

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
  expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
  expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
  expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
});

test('formats the date with its weekday in Korean', () => {
  expect(formatDate('2026-10-31')).toBe('2026년 10월 31일 토요일');
});
