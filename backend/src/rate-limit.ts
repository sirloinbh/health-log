import type { NextFunction, Request, Response } from 'express';

import { sendError } from './standard/http.js';

export type RateLimitOptions = { max: number; windowMs: number; now?: () => number };

// Requests per client address per window, kept in memory. nginx limits first (frontend/nginx.conf:
// 10 r/s, burst 40, so at most 640 in a minute); this also covers anything reaching the API directly.
export const defaultRateLimit: RateLimitOptions = { max: 700, windowMs: 60_000 };

export function rateLimit({ max, windowMs, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, { count: number; endsAt: number }>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const time = now();
    const client = req.ip ?? 'unknown';
    let current = windows.get(client);
    if (!current || current.endsAt <= time) {
      // Finished windows are dropped here, so the map holds only addresses seen in the last window.
      for (const [address, entry] of windows) {
        if (entry.endsAt <= time) windows.delete(address);
      }
      current = { count: 0, endsAt: time + windowMs };
      windows.set(client, current);
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.endsAt - time) / 1000));
      sendError(res, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요');
      return;
    }
    next();
  };
}
