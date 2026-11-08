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

/** A date in a path, or a 400 HttpError. */
export const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !isRealDate(value)) {
    throw new HttpError(400, '날짜가 올바르지 않습니다');
  }
  return value;
};
