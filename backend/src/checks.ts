import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { periodsOf } from './contract.js';
import { parseDate } from './dates.js';
import { type Db, inTransaction, snapshotRead } from './db.js';
import { HttpError } from './standard/http.js';
import { charCount } from './text.js';

// null: not checked. Never read as false.
const check = (label: string) =>
  z
    .boolean({ error: `${label} must be either yes or no` })
    .nullable()
    .default(null);

// null: not rated. 1 to 5 whole numbers only.
const score = (label: string) =>
  z
    .number({ error: `${label} must be a whole number from 1 to 5` })
    .int({ error: `${label} must be a whole number from 1 to 5` })
    .min(1, { error: `${label} must be a whole number from 1 to 5` })
    .max(5, { error: `${label} must be a whole number from 1 to 5` })
    .nullable()
    .default(null);

export const checkInput = z
  .object(
    {
      dietKept: check('Diet kept'),
      sleepGood: check('Sleep good'),
      mood: score('Mood'),
      energy: score('Energy'),
      stress: score('Stress'),
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
      ctx.addIssue({ code: 'custom', message: 'Enter at least one check, score or note' });
    }
  });

type CheckRecord = {
  date: string;
  dietKept: boolean | null;
  sleepGood: boolean | null;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  memo: string | null;
};

// count() is int8, which setInt8Parser already returns as a number.
type Summary = { dietDays: number; dietKept: number; sleepDays: number; sleepGood: number };

const readSummary = async (db: Db, { from, to }: { from: string; to: string }) => {
  // Each check counts only the days it was answered, so an unchecked day lowers no rate.
  const { rows } = await db.query<Summary>(
    `SELECT
       count(diet_kept) AS "dietDays",
       count(*) FILTER (WHERE diet_kept) AS "dietKept",
       count(sleep_good) AS "sleepDays",
       count(*) FILTER (WHERE sleep_good) AS "sleepGood"
     FROM day_checks WHERE record_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const row = rows[0];
  return {
    from,
    to,
    diet: { days: row.dietDays, yes: row.dietKept },
    sleep: { days: row.sleepDays, yes: row.sleepGood },
  };
};

const readDay = async (db: Db, date: string) => {
  const { week, month } = periodsOf(date);
  const { rows } = await db.query<CheckRecord>(
    `SELECT record_date AS date, diet_kept AS "dietKept", sleep_good AS "sleepGood",
            mood, energy, stress, memo
     FROM day_checks WHERE record_date = $1`,
    [date],
  );
  return {
    record: rows[0] ?? null,
    week: await readSummary(db, week),
    month: await readSummary(db, month),
  };
};

export function checksRouter(pool: Pool) {
  const router = Router();

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the record and both rates.
    res.json(await inTransaction(pool, (client) => readDay(client, date), { setup: snapshotRead }));
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = checkInput.parse(req.body);
    // The save and the rates it answers with succeed together.
    const day = await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO day_checks (record_date, diet_kept, sleep_good, mood, energy, stress, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (record_date) DO UPDATE SET
           diet_kept = EXCLUDED.diet_kept,
           sleep_good = EXCLUDED.sleep_good,
           mood = EXCLUDED.mood,
           energy = EXCLUDED.energy,
           stress = EXCLUDED.stress,
           memo = EXCLUDED.memo,
           updated_at = now()`,
        [date, input.dietKept, input.sleepGood, input.mood, input.energy, input.stress, input.memo],
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
