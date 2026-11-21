import { HttpError } from './standard/http.js';

/**
 * The dates the API accepts (#50). Wider than the screen's 2000-01-01 to 2099-12-31, so tests can
 * keep their records far from real ones, yet far enough from year 0001 and 9999 that a week or
 * month around a date, or the next day, never leaves what PostgreSQL can hold. Without these ends
 * `/api/report?date=9999-12-31` asked for day +010000-01-01 and failed with a 500.
 */
const earliestApiDate = '1900-01-01';
const latestApiDate = '2999-12-31';

export const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < earliestApiDate || value > latestApiDate) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

// Calendar-day arithmetic. A YYYY-MM-DD is already a day in the service time zone, fixed by the
// caller; counting it as a UTC midnight keeps every step exactly one day, whatever the server's
// zone and across daylight-saving changes, so no day is ever 23 or 25 hours long.
const dayMs = 86_400_000;
const utcMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The calendar day `days` after `date` (before it when negative). */
export const shiftDay = (date: string, days: number) =>
  new Date(utcMidnight(date) + days * dayMs).toISOString().slice(0, 10);

/** Whole days from `from` to `to`: 0 for the same day, negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((utcMidnight(to) - utcMidnight(from)) / dayMs);

/** A date in a path, or a 400 HttpError. */
export const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !isRealDate(value)) {
    throw new HttpError(400, 'The date is not valid');
  }
  return value;
};
