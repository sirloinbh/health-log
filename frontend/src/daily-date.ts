// Calendar math on YYYY-MM-DD strings runs in UTC, so the browser's time zone never shifts a date.
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const fullDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = toDate(value);
  // A rolled-over date such as 2026-02-30 does not survive the round trip.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftDate(value: string, days: number) {
  const parsed = toDate(value);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function formatDate(value: string) {
  return fullDate.format(toDate(value));
}

/**
 * The days the daily page opens (#50): the address, the previous and next day links and the date
 * field all follow this. Years before 2000 have no records to keep, and some of them had other
 * clock offsets in Asia/Seoul. 2099 leaves room for future entries such as appointments while
 * keeping the next day a four-digit date.
 */
export const earliestDate = '2000-01-01';
export const latestDate = '2099-12-31';

export const inDailyRange = (value: string) => value >= earliestDate && value <= latestDate;

export const dailyRangeText = `Records can be kept from ${earliestDate} to ${latestDate}`;

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Nov 2" for 2026-11-02. */
export const shortMonthDay = (date: string) =>
  `${monthNames[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
