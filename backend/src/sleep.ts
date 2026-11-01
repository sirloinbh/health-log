import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError, serviceDate } from './standard/http.js';

const maxSpan = 24 * 60 * 60_000;

/** Whole minutes between two instants. Midnight needs no special case because both carry a date. */
export const sleepMinutes = (bedAt: string, wakeAt: string) =>
  Math.round((new Date(wakeAt).getTime() - new Date(bedAt).getTime()) / 60_000);

const instant = (label: string) =>
  z.iso.datetime({ offset: true, error: `${label}이(가) 올바르지 않습니다` });

const sleepInput = z.object(
  { bedAt: instant('취침 시각'), wakeAt: instant('기상 시각') },
  { error: '요청 본문이 올바르지 않습니다' },
);

type SleepRow = {
  sleep_date: string;
  bed_at: Date;
  wake_at: Date;
  duration_minutes: number;
  deep_minutes: number | null;
  light_minutes: number | null;
  rem_minutes: number | null;
  awake_minutes: number | null;
  sleep_score: number | null;
  source: string;
};

const columns =
  'sleep_date, bed_at, wake_at, duration_minutes, deep_minutes, light_minutes, rem_minutes, awake_minutes, sleep_score, source';

const toRecord = (row: SleepRow) => ({
  date: row.sleep_date,
  bedAt: row.bed_at.toISOString(),
  wakeAt: row.wake_at.toISOString(),
  durationMinutes: row.duration_minutes,
  deepMinutes: row.deep_minutes,
  lightMinutes: row.light_minutes,
  remMinutes: row.rem_minutes,
  awakeMinutes: row.awake_minutes,
  sleepScore: row.sleep_score,
  source: row.source,
});

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !isRealDate(value)) {
    throw new HttpError(400, '날짜가 올바르지 않습니다');
  }
  return value;
};

export function sleepRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rows } = await pool.query<SleepRow>(
      `SELECT ${columns} FROM sleep_records WHERE sleep_date = $1`,
      [date],
    );
    res.json({ record: rows[0] ? toRecord(rows[0]) : null });
  });

  // Typed times replace the whole record: stages and a score from an import no longer describe them.
  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = sleepInput.parse(req.body);
    // PostgreSQL refuses some offsets that JavaScript reads fine, so it only ever sees UTC.
    const bedAt = new Date(input.bedAt).toISOString();
    const wakeAt = new Date(input.wakeAt).toISOString();
    // The exact span, as the database checks it: rounded minutes would let 24h 20s through to a 500.
    const span = new Date(wakeAt).getTime() - new Date(bedAt).getTime();
    if (span <= 0) throw new HttpError(400, '기상 시각은 취침 시각보다 늦어야 합니다');
    if (span > maxSpan) throw new HttpError(400, '수면 시간은 24시간을 넘을 수 없습니다');
    const minutes = sleepMinutes(bedAt, wakeAt);
    if (minutes < 1) throw new HttpError(400, '수면 시간은 1분 이상이어야 합니다');
    if (serviceDate(new Date(wakeAt)) !== date) {
      throw new HttpError(400, '기상 시각의 날짜가 기록 날짜와 다릅니다');
    }
    const { rows } = await pool.query<SleepRow>(
      `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes, source)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (sleep_date) DO UPDATE SET
         bed_at = EXCLUDED.bed_at,
         wake_at = EXCLUDED.wake_at,
         duration_minutes = EXCLUDED.duration_minutes,
         deep_minutes = NULL,
         light_minutes = NULL,
         rem_minutes = NULL,
         awake_minutes = NULL,
         sleep_score = NULL,
         source = 'manual',
         updated_at = now()
       RETURNING ${columns}`,
      [date, bedAt, wakeAt, minutes],
    );
    res.json(toRecord(rows[0]));
  });

  router.delete('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rowCount } = await pool.query('DELETE FROM sleep_records WHERE sleep_date = $1', [
      date,
    ]);
    if (!rowCount) throw new HttpError(404, '수면 기록을 찾을 수 없습니다');
    res.status(204).end();
  });

  return router;
}
