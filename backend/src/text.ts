import type { NextFunction, Request, Response } from 'express';

import { sendError } from './standard/http.js';

/**
 * Length as PostgreSQL's char_length counts it: one per character, so an emoji is one, not the two
 * UTF-16 units of `string.length` (#92). Screens and server use this for the limits they show.
 */
export const charCount = (value: string) => [...value].length;

const hasNul = (value: unknown): boolean => {
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some(hasNul);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => key.includes('\u0000') || hasNul(item));
  }
  return false;
};

/**
 * PostgreSQL text cannot hold U+0000 and fails the query with 22021, which would surface as a 500.
 * Checked once for every request body and query string, so no text field can miss it (#92).
 */
export function rejectNul(req: Request, res: Response, next: NextFunction) {
  if (hasNul(req.body) || hasNul(req.query)) {
    sendError(res, 400, '쓸 수 없는 문자(NUL)가 들어 있습니다');
    return;
  }
  next();
}
