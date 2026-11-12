import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { hasTwoDecimalsAtMost } from './foods.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';

const drinkKinds = ['soju', 'beer', 'wine', 'makgeolli', 'whisky', 'other'] as const;
const drinkUnits = ['glass', 'bottle', 'can'] as const;
const maxDrinks = 20;

const drinkInput = z.object(
  {
    kind: z.enum(drinkKinds, { error: 'The drink type is not valid' }),
    unit: z.enum(drinkUnits, { error: 'The drink unit is not valid' }),
    amount: z
      .number({ error: 'The drink amount must be a number' })
      .gt(0, 'The drink amount must be greater than 0')
      .max(99, 'The drink amount must be 99 or less')
      .refine(hasTwoDecimalsAtMost, 'The drink amount can have at most 2 decimal places'),
  },
  { error: 'The drink record is not valid' },
);

const habitInput = z
  .object(
    {
      // null: not recorded. 0: recorded as none.
      cigarettes: z
        .number({ error: 'Cigarettes must be a number' })
        .int('Cigarettes must be a whole number')
        .min(0, 'Cigarettes must be 0 or more')
        .max(200, 'Cigarettes must be 200 or fewer')
        .nullable()
        .default(null),
      // null: not recorded. []: recorded as not drinking.
      drinks: z
        .array(drinkInput, { error: 'The drink record is not valid' })
        .max(maxDrinks, `You can enter up to ${maxDrinks} drinks per day`)
        .nullable()
        .default(null),
    },
    { error: 'The request body is not valid' },
  )
  .superRefine((input, ctx) => {
    if (input.cigarettes === null && input.drinks === null) {
      ctx.addIssue({ code: 'custom', message: 'Record at least one drink or cigarette count' });
    }
    const pairs = (input.drinks ?? []).map(({ kind, unit }) => `${kind}/${unit}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', message: 'Enter each drink and unit only once' });
    }
  });

type DayRow = { record_date: string; cigarettes: number | null; drinks_recorded: boolean };
type DrinkRow = { kind: string; unit: string; amount: string };

const readRecord = async (db: Db, date: string) => {
  const { rows } = await db.query<DayRow>(
    'SELECT record_date, cigarettes, drinks_recorded FROM habit_days WHERE record_date = $1',
    [date],
  );
  if (!rows[0]) return null;
  const drinks = await db.query<DrinkRow>(
    'SELECT kind, unit, amount FROM habit_drinks WHERE record_date = $1 ORDER BY position',
    [date],
  );
  return {
    date: rows[0].record_date,
    cigarettes: rows[0].cigarettes,
    drinks: rows[0].drinks_recorded
      ? drinks.rows.map((row) => ({ ...row, amount: Number(row.amount) }))
      : null,
  };
};

type SummaryRow = {
  smoking_days: string;
  cigarettes: string | null;
  drinking_recorded_days: string;
  drinking_days: string;
};

const readSummary = async (db: Db, { from, to }: { from: string; to: string }) => {
  const { rows } = await db.query<SummaryRow>(
    `SELECT
       count(*) FILTER (WHERE cigarettes IS NOT NULL) AS smoking_days,
       sum(cigarettes) AS cigarettes,
       count(*) FILTER (WHERE drinks_recorded) AS drinking_recorded_days,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM habit_drinks d WHERE d.record_date = habit_days.record_date
       )) AS drinking_days
     FROM habit_days WHERE record_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const totals = await db.query<DrinkRow>(
    `SELECT kind, unit, sum(amount) AS amount FROM habit_drinks
     WHERE record_date BETWEEN $1 AND $2
     GROUP BY kind, unit
     ORDER BY array_position($3::text[], kind), array_position($4::text[], unit)`,
    [from, to, drinkKinds, drinkUnits],
  );
  const row = rows[0];
  return {
    from,
    to,
    // No recorded day leaves the total unknown, which is not the same as zero.
    smoking: {
      days: Number(row.smoking_days),
      cigarettes: row.cigarettes === null ? null : Number(row.cigarettes),
    },
    drinking: {
      days: Number(row.drinking_recorded_days),
      drinkingDays: Number(row.drinking_days),
      totals: totals.rows.map((total) => ({ ...total, amount: Number(total.amount) })),
    },
  };
};

const readDay = async (db: Db, date: string) => {
  const { week, month } = periodsOf(date);
  return {
    record: await readRecord(db, date),
    week: await readSummary(db, week),
    month: await readSummary(db, month),
  };
};

export function habitsRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the record and both totals, so a save landing between them cannot make
    // the answer disagree with itself.
    res.json(await inTransaction(pool, (client) => readDay(client, date), snapshotRead));
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = habitInput.parse(req.body);
    // A change and the answer about it succeed together, so the totals shown match what was saved.
    const day = await inTransaction(pool, async (client) => {
      // Saves of one day take turns. The drinks are deleted before the day's row is locked, so
      // without this two saves at once would both insert at position 0 and one would fail.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('habit_days:' || $1::text))", [
        date,
      ]);
      // The old drinks go first: the database refuses to mark a day "not recorded" while it still
      // has drinks.
      await client.query('DELETE FROM habit_drinks WHERE record_date = $1', [date]);
      await client.query(
        `INSERT INTO habit_days (record_date, cigarettes, drinks_recorded) VALUES ($1, $2, $3)
         ON CONFLICT (record_date) DO UPDATE SET
           cigarettes = EXCLUDED.cigarettes,
           drinks_recorded = EXCLUDED.drinks_recorded,
           updated_at = now()`,
        [date, input.cigarettes, input.drinks !== null],
      );
      for (const [position, drink] of (input.drinks ?? []).entries()) {
        await client.query(
          `INSERT INTO habit_drinks (record_date, position, kind, unit, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [date, position, drink.kind, drink.unit, drink.amount],
        );
      }
      return readDay(client, date);
    });
    res.json(day);
  });

  router.delete('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rowCount } = await pool.query('DELETE FROM habit_days WHERE record_date = $1', [date]);
    if (!rowCount) throw new HttpError(404, 'Alcohol and tobacco record not found');
    res.status(204).end();
  });

  return router;
}
