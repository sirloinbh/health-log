import { meHandler } from '@sirloinbh/auth-client';
import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';

import { tools } from './ai-tools.js';
import { bodyRouter } from './body.js';
import { checksRouter } from './checks.js';
import { combosRouter } from './combos.js';
import { foodsRouter } from './foods.js';
import { goalsRouter } from './goals.js';
import { habitsRouter } from './habits.js';
import { intakeRouter } from './intake.js';
import { labsRouter } from './labs.js';
import { mealsRouter } from './meals.js';
import { medicationsRouter } from './medications.js';
import { remindersRouter } from './reminders.js';
import { reportRouter } from './report.js';
import { sleepRouter } from './sleep.js';
import { setInt8Parser } from './standard/db.js';
import { errorHandler, notFound, requestLog, serviceDate } from './standard/http.js';
import { apiRateLimit } from './standard/rate-limit.js';
import { registerToolRoutes } from './standard/tools.js';
import { rejectNul } from './text.js';
import { visitsRouter } from './visits.js';
import { workoutMemoRouter } from './workout-memo.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);
// BIGINT ids come back as numbers, and a value above 2^53 throws instead of rounding (ADR-0025).
setInt8Parser(types);

export function createApp(
  pool: Pool,
  options: {
    today?: () => string;
    requestsPerMinute?: number;
    auth?: express.RequestHandler;
    /** shared-ai's public key (PEM); without it the AI tool routes are off (project-standards#711). */
    toolsPublicKey?: string;
    /** workout-memo's API address (WORKOUT_MEMO_URL); without it the daily screen says workout-memo cannot be reached (#333). */
    workoutMemoUrl?: string;
    workoutMemoFetch?: Parameters<typeof workoutMemoRouter>[1];
  } = {},
) {
  // "Today" follows the service time zone (Asia/Seoul), not the server clock's zone.
  const today = options.today ?? (() => serviceDate());
  const app = express();
  app.disable('x-powered-by');
  // project-standards#658: a request ID and one JSON log line for every request, first so a 401 has them too.
  app.use(requestLog);
  apiRateLimit(app, { limitPerMinute: options.requestsPerMinute });
  app.use(express.json({ limit: '256kb' }));
  app.use(rejectNul);
  // #167: the shared sign-in guards every /api route except /api/health, before any route registers.
  if (options.auth) app.use('/api', options.auth);
  app.get('/api/me', meHandler);
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'health-log', today: today() });
  });
  app.use('/api/foods', foodsRouter(pool, today));
  app.use('/api/meals', mealsRouter(pool));
  app.use('/api/combos', combosRouter(pool));
  app.use('/api/sleep', sleepRouter(pool));
  app.use('/api/body', bodyRouter(pool));
  app.use('/api/habits', habitsRouter(pool));
  app.use('/api/intake', intakeRouter(pool, today));
  app.use('/api/checks', checksRouter(pool));
  app.use('/api/goals', goalsRouter(pool, today));
  app.use('/api/report', reportRouter(pool));
  app.use('/api/visits', visitsRouter(pool));
  app.use('/api/labs', labsRouter(pool));
  app.use('/api/medications', medicationsRouter(pool, today));
  app.use('/api/reminders', remindersRouter(pool, today));
  app.use('/api/workout-memo', workoutMemoRouter(options.workoutMemoUrl, options.workoutMemoFetch));
  // AI tools for shared-ai on /internal/tools: outside /api, so nginx never forwards them and the signed
  // call token, not the session, is the check. The token must name its tool and carry a jti (#822).
  registerToolRoutes(app, {
    app: 'health-log',
    tools,
    pool,
    publicKey: options.toolsPublicKey,
    requireBinding: true,
  });
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
