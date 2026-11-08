import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate, parseDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { hasTwoDecimalsAtMost } from './foods.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

const nutrients = ['calories', 'carbs', 'protein', 'fat', 'sugars', 'sodium'] as const;

const mealKey = z.enum(['breakfast', 'lunch', 'dinner', 'snack'], {
  error: '끼니를 선택해 주세요',
});

/** How many servings: the same rule for a meal entry and a combo item. */
export const servingsInput = z
  .number({ error: '수량을 숫자로 입력해 주세요' })
  .positive('수량은 0보다 커야 합니다')
  .max(999, '수량이 너무 큽니다')
  .refine(hasTwoDecimalsAtMost, '수량은 소수 둘째 자리까지 입력해 주세요');

const comboUse = z.object({ meal: mealKey }, { error: '요청 본문이 올바르지 않습니다' });

const mealCopy = z.object(
  {
    from: z
      .string({ error: '복사할 날짜를 골라 주세요' })
      .refine(isRealDate, '복사할 날짜가 올바르지 않습니다'),
    meal: mealKey,
  },
  { error: '요청 본문이 올바르지 않습니다' },
);

const entryInput = z
  .object(
    {
      meal: mealKey,
      servings: servingsInput,
      foodId: z
        .number({ error: '음식이 올바르지 않습니다' })
        .int('음식이 올바르지 않습니다')
        .positive('음식이 올바르지 않습니다')
        .optional(),
      name: z
        .string({ error: '음식 이름을 입력해 주세요' })
        .trim()
        .refine((value) => value.length >= 1, '음식 이름을 입력해 주세요')
        .refine((value) => charCount(value) <= 100, '음식 이름은 100자 이하로 입력해 주세요')
        .optional(),
      calories: z
        .number({ error: '칼로리를 숫자로 입력해 주세요' })
        .min(0, '칼로리는 0 이상이어야 합니다')
        .max(99_999, '칼로리가 너무 큽니다')
        .refine(hasTwoDecimalsAtMost, '칼로리는 소수 둘째 자리까지 입력해 주세요')
        .optional(),
      // Typed-in food only: a stored food brings its own mark.
      isJunk: z.boolean({ error: '정크푸드 표시가 올바르지 않습니다' }).optional(),
    },
    { error: '요청 본문이 올바르지 않습니다' },
  )
  .superRefine((entry, ctx) => {
    if (entry.foodId !== undefined) {
      if (entry.name !== undefined || entry.calories !== undefined || entry.isJunk !== undefined) {
        ctx.addIssue({ code: 'custom', message: '음식 선택과 직접 입력은 함께 쓸 수 없습니다' });
      }
      return;
    }
    if (entry.name === undefined) {
      ctx.addIssue({ code: 'custom', message: '음식을 선택하거나 이름을 입력해 주세요' });
    }
    if (entry.calories === undefined) {
      ctx.addIssue({ code: 'custom', message: '직접 입력할 때는 칼로리가 필요합니다' });
    }
  });

type EntryRow = {
  id: string;
  meal: string;
  food_id: string | null;
  name: string;
  brand: string | null;
  servings: string;
  serving_size: string | null;
  serving_unit: string | null;
  is_junk: boolean;
} & Record<
  | (typeof nutrients)[number]
  | `${(typeof nutrients)[number]}_total`
  | `${(typeof nutrients)[number]}_missing`,
  string | null
>;

// pg returns BIGINT and NUMERIC as strings.
const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

// Multiplied in the database: NUMERIC is exact, so 1.5 × 123.45 cannot pick up binary float errors.
const eaten = nutrients.map((key) => `round(${key} * servings, 2) AS ${key}`).join(', ');
const totals = nutrients
  .map(
    (key) =>
      `sum(${key}) OVER () AS ${key}_total, count(*) FILTER (WHERE ${key} IS NULL) OVER () AS ${key}_missing`,
  )
  .join(', ');
// One statement sees one snapshot, and the totals add up the rounded rows, so a day's list and its
// totals always agree.
const daySql = `WITH eaten AS (
    SELECT id, meal, food_id, name, brand, servings, serving_size, serving_unit, is_junk, ${eaten}
    FROM meal_entries WHERE entry_date = $1
  )
  SELECT *, ${totals} FROM eaten ORDER BY id`;

const toEntry = (row: EntryRow) => ({
  id: Number(row.id),
  meal: row.meal,
  foodId: optionalNumber(row.food_id),
  name: row.name,
  brand: row.brand,
  servings: Number(row.servings),
  servingSize: optionalNumber(row.serving_size),
  servingUnit: row.serving_unit,
  isJunk: row.is_junk,
  ...Object.fromEntries(nutrients.map((key) => [key, optionalNumber(row[key])])),
});

// A day with no rows has no totals to read: no value, and nothing missing.
const toTotals = (row: EntryRow | undefined) =>
  Object.fromEntries(
    nutrients.map((key) => [
      key,
      {
        value: row ? optionalNumber(row[`${key}_total`]) : null,
        missing: row ? Number(row[`${key}_missing`]) : 0,
      },
    ]),
  );

type JunkRow = {
  times: string;
  days: string;
  calories: string | null;
  calories_missing: string;
};

// Junk food of a period (#38): each entry is one time eaten, whatever its servings, and a day with
// several counts once among the days. Calories add up the entries as recorded, like a day's totals.
const junkSql = `SELECT count(*) AS times, count(DISTINCT entry_date) AS days,
    sum(round(calories * servings, 2)) AS calories,
    count(*) FILTER (WHERE calories IS NULL) AS calories_missing
  FROM meal_entries WHERE is_junk AND entry_date BETWEEN $1 AND $2`;

const junkOf = async (db: Db, period: { from: string; to: string }) => {
  const { rows } = await db.query<JunkRow>(junkSql, [period.from, period.to]);
  const row = rows[0];
  return {
    ...period,
    times: Number(row.times),
    days: Number(row.days),
    calories: { value: optionalNumber(row.calories), missing: Number(row.calories_missing) },
  };
};

export function mealsRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  // A read runs this in one snapshot (snapshotRead), so the day and its periods agree. A change runs
  // it in its own transaction, which sees the change; an entry another tab saves at that same moment
  // may show in the periods before the list, until the next read.
  const day = async (db: Db, date: string) => {
    const { rows } = await db.query<EntryRow>(daySql, [date]);
    const { week, month } = periodsOf(date);
    return {
      entries: rows.map(toEntry),
      totals: toTotals(rows[0]),
      junk: { week: await junkOf(db, week), month: await junkOf(db, month) },
    };
  };

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    res.json(await inTransaction(pool, (client) => day(client, date), snapshotRead));
  });

  // Each change answers with the whole day, so the screen needs no second request. A change and the
  // answer about it succeed together in one transaction. Otherwise a saved entry could be reported
  // as failed, and trying again would count the food twice.
  router.post('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const entry = entryInput.parse(req.body);
    const answer = await inTransaction(pool, async (client) => {
      if (entry.foodId !== undefined) {
        const { rowCount } = await client.query(
          `INSERT INTO meal_entries (entry_date, meal, servings, food_id, name, brand, serving_size,
             serving_unit, calories, carbs, protein, fat, sugars, sodium, is_junk)
           SELECT $1, $2, $3, id, name, brand, serving_size, serving_unit, calories, carbs, protein,
             fat, sugars, sodium, is_junk
           FROM foods WHERE id = $4`,
          [date, entry.meal, entry.servings, entry.foodId],
        );
        if (!rowCount) throw new HttpError(404, '음식을 찾을 수 없습니다');
      } else {
        await client.query(
          `INSERT INTO meal_entries (entry_date, meal, servings, name, calories, is_junk)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [date, entry.meal, entry.servings, entry.name, entry.calories, entry.isJunk ?? false],
        );
      }
      return day(client, date);
    });
    res.status(201).json(answer);
  });

  // Every food of the combo goes in with one statement, so either all of them are recorded or none.
  router.post('/:date/combos/:id', async (req, res) => {
    const date = parseDate(req.params.date);
    const comboId = parseId(req.params.id, '조합');
    const { meal } = comboUse.parse(req.body);
    const answer = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query(
        `INSERT INTO meal_entries (entry_date, meal, servings, food_id, name, brand, serving_size,
           serving_unit, calories, carbs, protein, fat, sugars, sodium, is_junk)
         SELECT $1, $2, i.servings, f.id, f.name, f.brand, f.serving_size, f.serving_unit,
           f.calories, f.carbs, f.protein, f.fat, f.sugars, f.sodium, f.is_junk
         FROM meal_combo_items i JOIN foods f ON f.id = i.food_id
         WHERE i.combo_id = $3
         ORDER BY i.position`,
        [date, meal, comboId],
      );
      if (!rowCount) {
        const { rowCount: found } = await client.query('SELECT 1 FROM meal_combos WHERE id = $1', [
          comboId,
        ]);
        throw found
          ? new HttpError(400, '조합에 음식이 없습니다')
          : new HttpError(404, '조합을 찾을 수 없습니다');
      }
      return day(client, date);
    });
    res.status(201).json(answer);
  });

  // Another day's meal is copied as it was recorded, not read again from the food store, so the
  // copy carries the same values. One statement: either every entry is copied or none.
  router.post('/:date/copy', async (req, res) => {
    const date = parseDate(req.params.date);
    const { from, meal } = mealCopy.parse(req.body);
    if (from === date) throw new HttpError(400, '다른 날짜를 골라 주세요');
    const answer = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query(
        `INSERT INTO meal_entries (entry_date, meal, servings, food_id, name, brand, serving_size,
           serving_unit, calories, carbs, protein, fat, sugars, sodium, is_junk)
         SELECT $1, meal, servings, food_id, name, brand, serving_size, serving_unit, calories,
           carbs, protein, fat, sugars, sodium, is_junk
         FROM meal_entries
         WHERE entry_date = $2 AND meal = $3
         ORDER BY id`,
        [date, from, meal],
      );
      if (!rowCount) throw new HttpError(404, '복사할 기록이 없습니다');
      return day(client, date);
    });
    res.status(201).json(answer);
  });

  router.delete('/:date/entries/:id', async (req, res) => {
    const date = parseDate(req.params.date);
    const id = parseId(req.params.id, '식사 기록');
    const answer = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM meal_entries WHERE id = $1 AND entry_date = $2',
        [id, date],
      );
      if (!rowCount) throw new HttpError(404, '식사 기록을 찾을 수 없습니다');
      return day(client, date);
    });
    res.json(answer);
  });

  return router;
}
