import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';
import { charCount } from './text.js';

// null: not checked. Never read as false.
const check = (label: string) =>
  z
    .boolean({ error: `${label} must be either yes or no` })
    .nullable()
    .default(null);

const checkInput = z
  .object(
    {
      dietKept: check('Diet kept'),
      sleepGood: check('Sleep good'),
      memo: z
        .string({ error: 'The note is not valid' })
        .trim()
        // Counted as the database's char_length does, so 200 emoji fit as the screen says.
        // U+0000 is refused for every request by rejectNul in app.ts.
        .refine((value) => charCount(value) <= 200, 'The note must be 200 characters or fewer')
        .nullable()
        .default(null)
        .transform((value) => value || null),
    },
    { error: 'The request body is not valid' },
  )
  .superRefine((input, ctx) => {
    if (Object.values(input).every((value) => value === null)) {
      ctx.addIssue({ code: 'custom', message: 'Enter at least one check or a note' });
    }
  });

type CheckRow = {
  record_date: string;
  diet_kept: boolean | null;
  sleep_good: boolean | null;
  memo: string | null;
};

const toRecord = (row: CheckRow) => ({
  date: row.record_date,
  dietKept: row.diet_kept,
  sleepGood: row.sleep_good,
  memo: row.memo,
});

type SummaryRow = { diet_days: string; diet_kept: string; sleep_days: string; sleep_good: string };

const readSummary = async (db: Db, { from, to }: { from: string; to: string }) => {
  // Each check counts only the days it was answered, so an unchecked day lowers no rate.
  const { rows } = await db.query<SummaryRow>(
    `SELECT
       count(diet_kept) AS diet_days,
       count(*) FILTER (WHERE diet_kept) AS diet_kept,
       count(sleep_good) AS sleep_days,
       count(*) FILTER (WHERE sleep_good) AS sleep_good
     FROM day_checks WHERE record_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const row = rows[0];
  return {
    from,
    to,
    diet: { days: Number(row.diet_days), yes: Number(row.diet_kept) },
    sleep: { days: Number(row.sleep_days), yes: Number(row.sleep_good) },
  };
};

const readDay = async (db: Db, date: string) => {
  const { week, month } = periodsOf(date);
  const { rows } = await db.query<CheckRow>(
    'SELECT record_date, diet_kept, sleep_good, memo FROM day_checks WHERE record_date = $1',
    [date],
  );
  return {
    record: rows[0] ? toRecord(rows[0]) : null,
    week: await readSummary(db, week),
    month: await readSummary(db, month),
  };
};

export function checksRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the record and both rates.
    res.json(await inTransaction(pool, (client) => readDay(client, date), snapshotRead));
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = checkInput.parse(req.body);
    // The save and the rates it answers with succeed together.
    const day = await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO day_checks (record_date, diet_kept, sleep_good, memo) VALUES ($1, $2, $3, $4)
         ON CONFLICT (record_date) DO UPDATE SET
           diet_kept = EXCLUDED.diet_kept,
           sleep_good = EXCLUDED.sleep_good,
           memo = EXCLUDED.memo,
           updated_at = now()`,
        [date, input.dietKept, input.sleepGood, input.memo],
      );
      return readDay(client, date);
    });
    res.json(day);
  });

  router.delete('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rowCount } = await pool.query('DELETE FROM day_checks WHERE record_date = $1', [date]);
    if (!rowCount) throw new HttpError(404, 'Daily check not found');
    res.status(204).end();
  });

  return router;
}
