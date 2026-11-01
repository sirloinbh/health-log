import { HttpError } from './standard/http.js';

export const isRealDate = (value: string) => {
  // PostgreSQL has no year 0000.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
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
