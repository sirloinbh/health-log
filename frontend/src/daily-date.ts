// Calendar math on YYYY-MM-DD strings runs in UTC, so the browser's time zone never shifts a date.
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const fullDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeZone: 'UTC' });

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
