import type { Options } from 'express-rate-limit';

import { sendError } from './standard/http.js';

export type RateLimitSettings = { max: number; windowMs: number };

// Requests per client address per window, kept in memory. nginx limits first (frontend/nginx.conf:
// 10 r/s, burst 40, so at most 640 in a minute); this also covers anything reaching the API directly.
export const defaultRateLimit: RateLimitSettings = { max: 700, windowMs: 60_000 };

export const rateLimitOptions = ({ max, windowMs }: RateLimitSettings): Partial<Options> => ({
  windowMs,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // nginx adds this header and the app does not trust it, so behind nginx every request counts
  // toward one address. With a single user that is intended, not a misconfiguration to warn about.
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => sendError(res, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요'),
});
