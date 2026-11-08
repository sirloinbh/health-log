import type { NextFunction, Request, Response } from 'express';

import { sendError } from './standard/http.js';

/**
 * Length as PostgreSQL's char_length counts it: one per character, so an emoji is one, not the two
 * UTF-16 units of `string.length` (#92). Screens and server use this for the limits they show.
 */
export const charCount = (value: string) => [...value].length;

// A loop over an explicit stack, not recursion: a deeply nested body within the size limit would
// otherwise overflow the call stack and turn into a 500 (PR #102 review). Each value is visited
// once, so the cost follows the size of the body.
const hasNul = (root: unknown): boolean => {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (value.includes('\u0000')) return true;
    } else if (Array.isArray(value)) {
      // One by one: spreading a long array into push() can pass the engine's argument limit.
      for (const item of value) pending.push(item);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key.includes('\u0000')) return true;
        pending.push(item);
      }
    }
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
