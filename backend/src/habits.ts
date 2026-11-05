import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { hasTwoDecimalsAtMost } from './foods.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';

const drinkKinds = ['soju', 'beer', 'wine', 'makgeolli', 'whisky', 'other'] as const;
const drinkUnits = ['glass', 'bottle', 'can'] as const;
const maxDrinks = 20;

const drinkInput = z.object(
  {
    kind: z.enum(drinkKinds, { error: '술 종류가 올바르지 않습니다' }),
    unit: z.enum(drinkUnits, { error: '술 단위가 올바르지 않습니다' }),
    amount: z
      .number({ error: '술의 양은 숫자로 입력해 주세요' })
      .gt(0, '술의 양은 0보다 커야 합니다')
      .max(99, '술의 양은 99 이하로 입력해 주세요')
      .refine(hasTwoDecimalsAtMost, '술의 양은 소수 둘째 자리까지 입력해 주세요'),
  },
  { error: '술 기록이 올바르지 않습니다' },
);

const habitInput = z
  .object(
    {
      // null: not recorded. 0: recorded as none.
      cigarettes: z
        .number({ error: '담배는 개비 수를 숫자로 입력해 주세요' })
        .int('담배는 개비 수를 정수로 입력해 주세요')
        .min(0, '담배는 0개비 이상으로 입력해 주세요')
        .max(200, '담배는 200개비 이하로 입력해 주세요')
        .nullable()
        .default(null),
      // null: not recorded. []: recorded as not drinking.
      drinks: z
        .array(drinkInput, { error: '술 기록이 올바르지 않습니다' })
        .max(maxDrinks, `술은 하루 ${maxDrinks}가지까지 입력할 수 있습니다`)
        .nullable()
        .default(null),
    },
    { error: '요청 본문이 올바르지 않습니다' },
  )
  .superRefine((input, ctx) => {
    if (input.cigarettes === null && input.drinks === null) {
      ctx.addIssue({ code: 'custom', message: '술이나 담배 중 하나 이상 기록해 주세요' });
    }
    const pairs = (input.drinks ?? []).map(({ kind, unit }) => `${kind}/${unit}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', message: '같은 술과 단위는 한 번만 입력해 주세요' });
    }
  });

type Db = Pick<Pool, 'query'> | PoolClient;

const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// Dates here are calendar days in the service time zone, already fixed by the caller. Counting
// them as UTC midnights keeps every boundary on the day it names, whatever the server's zone.
export function periodsOf(date: string) {
  const day = Date.parse(`${date}T00:00:00Z`);
  // Weeks run Monday to Sunday.
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  const monday = day - sinceMonday * 86_400_000;
  const [year, month] = date.split('-').map(Number);
  return {
    week: { from: toDate(monday), to: toDate(monday + 6 * 86_400_000) },
    month: {
      from: `${date.slice(0, 7)}-01`,
      to: toDate(Date.UTC(year, month, 0)),
    },
  };
}

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

  // A change and the answer about it succeed together, so the totals shown match what was saved.
  const inTransaction = async <T>(run: (client: PoolClient) => Promise<T>, begin = 'BEGIN') => {
    const client = await pool.connect();
    try {
      await client.query(begin);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the record and both totals, so a save landing between them cannot make
    // the answer disagree with itself.
    res.json(
      await inTransaction(
        (client) => readDay(client, date),
        'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      ),
    );
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = habitInput.parse(req.body);
    const day = await inTransaction(async (client) => {
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
    if (!rowCount) throw new HttpError(404, '술·담배 기록을 찾을 수 없습니다');
    res.status(204).end();
  });

  return router;
}
