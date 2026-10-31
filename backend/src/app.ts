import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';

import { foodsRouter } from './foods.js';
import { defaultRateLimit, rateLimit, type RateLimitOptions } from './rate-limit.js';
import { errorHandler, notFound } from './standard/http.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);

const serviceTimeZone = 'Asia/Seoul';

// "Today" follows the service time zone, not the server clock's zone.
export function serviceDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: serviceTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function createApp(
  pool: Pool,
  options: { today?: () => string; rateLimit?: RateLimitOptions } = {},
) {
  const today = options.today ?? (() => serviceDate());
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'health-log', today: today() });
  });
  // Not on health, so monitoring still answers while a client is being limited.
  const rateLimiter = rateLimit(options.rateLimit ?? defaultRateLimit);
  app.use('/api/foods', foodsRouter(pool, today, rateLimiter));
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
