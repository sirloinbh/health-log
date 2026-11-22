import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { inTransaction } from './db.js';
import { servingsInput } from './meals.js';
import { optionalNumber } from './numbers.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

const maxItems = 20;

export const comboInput = z.object(
  {
    name: z
      .string({ error: 'Enter a combo name' })
      .trim()
      .refine((value) => value.length >= 1, 'Enter a combo name')
      .refine((value) => charCount(value) <= 50, 'The combo name must be 50 characters or fewer'),
    items: z
      .array(
        z.object(
          {
            foodId: z
              .number({ error: 'The food is not valid' })
              .int('The food is not valid')
              .positive('The food is not valid'),
            servings: servingsInput,
          },
          { error: 'A food in the combo is not valid' },
        ),
        { error: 'Choose the foods for the combo' },
      )
      .min(1, 'Add at least one food to the combo')
      .max(maxItems, `A combo can have up to ${maxItems} foods`)
      .refine(
        (items) => new Set(items.map((item) => item.foodId)).size === items.length,
        'Add each food only once and adjust the quantity instead',
      ),
  },
  { error: 'The request body is not valid' },
);

type ComboInput = z.infer<typeof comboInput>;

// One row per food of a combo (or one row with no food), under the API's names. NUMERIC columns
// are strings; ids and counts are int8, which setInt8Parser returns as numbers.
type ComboRow = {
  id: number;
  name: string;
  foodId: number | null;
  foodName: string | null;
  brand: string | null;
  servings: string | null;
  servingSize: string | null;
  servingUnit: string | null;
  calories: string | null;
  caloriesTotal: string | null;
  caloriesMissing: number;
};

// Calories are multiplied and added in the database: NUMERIC is exact, so the total matches what
// recording the combo would add to a day. LEFT JOIN keeps a combo whose foods were all removed.
const comboSql = (where: string) => `
  SELECT c.id, c.name, i.food_id AS "foodId", f.name AS "foodName", f.brand, i.servings,
    f.serving_size AS "servingSize", f.serving_unit AS "servingUnit",
    round(f.calories * i.servings, 2) AS calories,
    sum(round(f.calories * i.servings, 2)) OVER (PARTITION BY c.id) AS "caloriesTotal",
    count(*) FILTER (WHERE i.food_id IS NOT NULL AND f.calories IS NULL)
      OVER (PARTITION BY c.id) AS "caloriesMissing"
  FROM meal_combos c
  LEFT JOIN meal_combo_items i ON i.combo_id = c.id
  LEFT JOIN foods f ON f.id = i.food_id
  ${where}
  ORDER BY lower(c.name), c.id, i.position`;

type Combo = {
  id: number;
  name: string;
  items: {
    foodId: number;
    name: string;
    brand: string | null;
    servings: number;
    servingSize: number | null;
    servingUnit: string | null;
    /** For all the servings; null when the food's calories are not known. */
    calories: number | null;
  }[];
  /** `missing` counts foods whose calories are not known, so `value` leaves them out. */
  calories: { value: number | null; missing: number };
};

const toCombos = (rows: ComboRow[]) => {
  const combos = new Map<number, Combo>();
  for (const row of rows) {
    const combo: Combo = combos.get(row.id) ?? {
      id: row.id,
      name: row.name,
      items: [],
      calories: { value: optionalNumber(row.caloriesTotal), missing: row.caloriesMissing },
    };
    combos.set(row.id, combo);
    if (row.foodId === null) continue;
    combo.items.push({
      foodId: row.foodId,
      name: row.foodName ?? '',
      brand: row.brand,
      servings: Number(row.servings),
      servingSize: optionalNumber(row.servingSize),
      servingUnit: row.servingUnit,
      calories: optionalNumber(row.calories),
    });
  }
  return [...combos.values()];
};

type PgError = { code?: unknown; constraint?: unknown };

const nameTaken = (error: unknown) => {
  const { code, constraint } = (error ?? {}) as PgError;
  return code === '23505' && constraint === 'meal_combos_name_key';
};

export function combosRouter(pool: Pool) {
  const router = Router();

  const read = async (db: Pick<Pool, 'query'> | PoolClient, id: number) => {
    const { rows } = await db.query<ComboRow>(comboSql('WHERE c.id = $1'), [id]);
    return toCombos(rows)[0];
  };

  // The combo and its foods change together, or not at all.
  const inComboTransaction = <T>(run: (client: PoolClient) => Promise<T>) =>
    inTransaction(pool, run, {
      mapError: (error) =>
        nameTaken(error) ? new HttpError(409, 'A combo with that name already exists') : error,
    });

  // Foods that do not exist are left out by the join, so a short count means one was missing.
  const putItems = async (client: PoolClient, comboId: number, items: ComboInput['items']) => {
    const { rowCount } = await client.query(
      `INSERT INTO meal_combo_items (combo_id, position, food_id, servings)
       SELECT $1, item.position, f.id, item.servings
       FROM unnest($2::bigint[], $3::numeric[]) WITH ORDINALITY AS item(food_id, servings, position)
       JOIN foods f ON f.id = item.food_id`,
      [comboId, items.map((item) => item.foodId), items.map((item) => item.servings)],
    );
    if (rowCount !== items.length) throw new HttpError(400, 'Some foods could not be found');
  };

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query<ComboRow>(comboSql(''));
    res.json({ combos: toCombos(rows) });
  });

  router.post('/', async (req, res) => {
    const combo = comboInput.parse(req.body);
    const created = await inComboTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        'INSERT INTO meal_combos (name) VALUES ($1) RETURNING id',
        [combo.name],
      );
      const id = rows[0].id;
      await putItems(client, id, combo.items);
      return read(client, id);
    });
    res.status(201).json(created);
  });

  // Replaces the name and the whole list of foods.
  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'combo');
    const combo = comboInput.parse(req.body);
    const updated = await inComboTransaction(async (client) => {
      const { rowCount } = await client.query(
        'UPDATE meal_combos SET name = $1, updated_at = now() WHERE id = $2',
        [combo.name, id],
      );
      if (!rowCount) throw new HttpError(404, 'Combo not found');
      await client.query('DELETE FROM meal_combo_items WHERE combo_id = $1', [id]);
      await putItems(client, id, combo.items);
      return read(client, id);
    });
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'combo');
    const { rowCount } = await pool.query('DELETE FROM meal_combos WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Combo not found');
    res.status(204).end();
  });

  return router;
}
