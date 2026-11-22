import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { maxAmount, periodsOf } from './contract.js';
import { isRealDate, parseDate } from './dates.js';
import { type Db, inTransaction, snapshotRead } from './db.js';
import { hasTwoDecimalsAtMost, optionalNumber } from './numbers.js';
import { fingerprintOf, oncePerKey, requestKeyOf } from './request-keys.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

const nutrients = ['calories', 'carbs', 'protein', 'fat', 'sugars', 'sodium'] as const;

const mealKey = z.enum(['breakfast', 'lunch', 'dinner', 'snack'], {
  error: 'Choose a meal',
});

/** How many servings: the same rule for a meal entry and a combo item. */
export const servingsInput = z
  .number({ error: 'The quantity must be a number' })
  .positive('The quantity must be greater than 0')
  .max(999, 'The quantity is too large')
  .refine(hasTwoDecimalsAtMost, 'The quantity can have at most 2 decimal places');

export const comboUse = z.object({ meal: mealKey }, { error: 'The request body is not valid' });

export const mealCopy = z.object(
  {
    from: z
      .string({ error: 'Choose a date to copy from' })
      .refine(isRealDate, 'The date to copy from is not valid'),
    meal: mealKey,
  },
  { error: 'The request body is not valid' },
);

export const entryInput = z
  .object(
    {
      meal: mealKey,
      servings: servingsInput,
      foodId: z
        .number({ error: 'The food is not valid' })
        .int('The food is not valid')
        .positive('The food is not valid')
        .optional(),
      name: z
        .string({ error: 'Enter a food name' })
        .trim()
        .refine((value) => value.length >= 1, 'Enter a food name')
        .refine((value) => charCount(value) <= 100, 'The food name must be 100 characters or fewer')
        .optional(),
      calories: z
        .number({ error: 'Calories must be a number' })
        .min(0, 'Calories must be 0 or more')
        .max(maxAmount, 'Calories are too large')
        .refine(hasTwoDecimalsAtMost, 'Calories can have at most 2 decimal places')
        .optional(),
      // Typed-in food only: a stored food brings its own mark.
      isJunk: z.boolean({ error: 'The junk food flag is not valid' }).optional(),
    },
    { error: 'The request body is not valid' },
  )
  .superRefine((entry, ctx) => {
    if (entry.foodId !== undefined) {
      if (entry.name !== undefined || entry.calories !== undefined || entry.isJunk !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'A chosen food and manual entry cannot be used together',
        });
      }
      return;
    }
    if (entry.name === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Choose a food or enter a name' });
    }
    if (entry.calories === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Calories are required for manual entry' });
    }
  });

type Nutrient = (typeof nutrients)[number];

// Each row is one entry under its API names, plus the day's totals in the window columns.
// NUMERIC columns are strings; ids and counts are int8, which setInt8Parser returns as numbers.
type DayRow = {
  id: number;
  meal: string;
  foodId: number | null;
  name: string;
  brand: string | null;
  servings: string;
  servingSize: string | null;
  servingUnit: string | null;
  isJunk: boolean;
} & Record<Nutrient | `${Nutrient}Total`, string | null> &
  Record<`${Nutrient}Missing`, number>;

// Multiplied in the database: NUMERIC is exact, so 1.5 × 123.45 cannot pick up binary float errors.
const eaten = nutrients.map((key) => `round(${key} * servings, 2) AS ${key}`).join(', ');
const totals = nutrients
  .map(
    (key) =>
      `sum(${key}) OVER () AS "${key}Total", count(*) FILTER (WHERE ${key} IS NULL) OVER () AS "${key}Missing"`,
  )
  .join(', ');
// One statement sees one snapshot, and the totals add up the rounded rows, so a day's list and its
// totals always agree.
const daySql = `WITH eaten AS (
    SELECT id, meal, food_id AS "foodId", name, brand, servings, serving_size AS "servingSize",
      serving_unit AS "servingUnit", is_junk AS "isJunk", ${eaten}
    FROM meal_entries WHERE entry_date = $1
  )
  SELECT *, ${totals} FROM eaten ORDER BY id`;

// Picks the entry's own columns out of a row that also carries the day's totals.
const toEntry = (row: DayRow) => ({
  id: row.id,
  meal: row.meal,
  foodId: row.foodId,
  name: row.name,
  brand: row.brand,
  servings: Number(row.servings),
  servingSize: optionalNumber(row.servingSize),
  servingUnit: row.servingUnit,
  isJunk: row.isJunk,
  ...Object.fromEntries(nutrients.map((key) => [key, optionalNumber(row[key])])),
});

// A day with no rows has no totals to read: no value, and nothing missing.
const toTotals = (row: DayRow | undefined) =>
  Object.fromEntries(
    nutrients.map((key) => [
      key,
      {
        value: row ? optionalNumber(row[`${key}Total`]) : null,
        missing: row ? row[`${key}Missing`] : 0,
      },
    ]),
  );

type JunkRow = { times: number; days: number; calories: string | null; caloriesMissing: number };

// Junk food of a period (#38): each entry is one time eaten, whatever its servings, and a day with
// several counts once among the days. Calories add up the entries as recorded, like a day's totals.
const junkSql = `SELECT count(*) AS times, count(DISTINCT entry_date) AS days,
    sum(round(calories * servings, 2)) AS calories,
    count(*) FILTER (WHERE calories IS NULL) AS "caloriesMissing"
  FROM meal_entries WHERE is_junk AND entry_date BETWEEN $1 AND $2`;

const junkOf = async (db: Db, period: { from: string; to: string }) => {
  const { rows } = await db.query<JunkRow>(junkSql, [period.from, period.to]);
  const { times, days, calories, caloriesMissing } = rows[0];
  return {
    ...period,
    times,
    days,
    calories: { value: optionalNumber(calories), missing: caloriesMissing },
  };
};

// A read runs this in one snapshot (snapshotRead), so the day and its periods agree. A change runs
// it in its own transaction, which sees the change; an entry another tab saves at that same moment
// may show in the periods before the list, until the next read. The AI tool list_meals calls it too (#711).
export const mealsOfDay = async (db: Db, date: string) => {
  const { rows } = await db.query<DayRow>(daySql, [date]);
  const { week, month } = periodsOf(date);
  return {
    entries: rows.map(toEntry),
    totals: toTotals(rows[0]),
    junk: { week: await junkOf(db, week), month: await junkOf(db, month) },
  };
};

export function mealsRouter(pool: Pool) {
  const router = Router();

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    res.json(
      await inTransaction(pool, (client) => mealsOfDay(client, date), { setup: snapshotRead }),
    );
  });

  // Each change answers with the whole day, so the screen needs no second request. A change and the
  // answer about it succeed together in one transaction. Otherwise a saved entry could be reported
  // as failed, and trying again would count the food twice. The three adding routes also take an
  // Idempotency-Key (#196): a retry whose answer was lost gets the first answer, not a second copy.
  router.post('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const entry = entryInput.parse(req.body);
    const key = requestKeyOf(req);
    const answer = await inTransaction(pool, (client) =>
      oncePerKey(client, key, fingerprintOf(req, entry), async () => {
        if (entry.foodId !== undefined) {
          const { rowCount } = await client.query(
            `INSERT INTO meal_entries (entry_date, meal, servings, food_id, name, brand, serving_size,
             serving_unit, calories, carbs, protein, fat, sugars, sodium, is_junk)
           SELECT $1, $2, $3, id, name, brand, serving_size, serving_unit, calories, carbs, protein,
             fat, sugars, sodium, is_junk
           FROM foods WHERE id = $4`,
            [date, entry.meal, entry.servings, entry.foodId],
          );
          if (!rowCount) throw new HttpError(404, 'Food not found');
        } else {
          await client.query(
            `INSERT INTO meal_entries (entry_date, meal, servings, name, calories, is_junk)
           VALUES ($1, $2, $3, $4, $5, $6)`,
            [date, entry.meal, entry.servings, entry.name, entry.calories, entry.isJunk ?? false],
          );
        }
        return mealsOfDay(client, date);
      }),
    );
    res.status(201).json(answer);
  });

  // Every food of the combo goes in with one statement, so either all of them are recorded or none.
  router.post('/:date/combos/:id', async (req, res) => {
    const date = parseDate(req.params.date);
    const comboId = parseId(req.params.id, 'combo');
    const { meal } = comboUse.parse(req.body);
    const key = requestKeyOf(req);
    const answer = await inTransaction(pool, (client) =>
      oncePerKey(client, key, fingerprintOf(req, { meal }), async () => {
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
          const { rowCount: found } = await client.query(
            'SELECT 1 FROM meal_combos WHERE id = $1',
            [comboId],
          );
          throw found
            ? new HttpError(400, 'The combo has no foods')
            : new HttpError(404, 'Combo not found');
        }
        return mealsOfDay(client, date);
      }),
    );
    res.status(201).json(answer);
  });

  // Another day's meal is copied as it was recorded, not read again from the food store, so the
  // copy carries the same values. One statement: either every entry is copied or none.
  router.post('/:date/copy', async (req, res) => {
    const date = parseDate(req.params.date);
    const { from, meal } = mealCopy.parse(req.body);
    if (from === date) throw new HttpError(400, 'Choose a different date');
    const key = requestKeyOf(req);
    const answer = await inTransaction(pool, (client) =>
      oncePerKey(client, key, fingerprintOf(req, { from, meal }), async () => {
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
        if (!rowCount) throw new HttpError(404, 'There are no records to copy');
        return mealsOfDay(client, date);
      }),
    );
    res.status(201).json(answer);
  });

  router.delete('/:date/entries/:id', async (req, res) => {
    const date = parseDate(req.params.date);
    const id = parseId(req.params.id, 'meal record');
    const answer = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM meal_entries WHERE id = $1 AND entry_date = $2',
        [id, date],
      );
      if (!rowCount) throw new HttpError(404, 'Meal record not found');
      return mealsOfDay(client, date);
    });
    res.json(answer);
  });

  return router;
}
