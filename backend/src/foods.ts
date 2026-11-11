import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

const maxAmount = 99_999;

// The columns keep two decimals; anything finer would be rounded silently, even down to zero.
export const hasTwoDecimalsAtMost = (value: number) => Number(value.toFixed(2)) === value;

const amount = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} must be 0 or more`)
    .max(maxAmount, `${label} is too large`)
    .refine(hasTwoDecimalsAtMost, `${label} can have at most 2 decimal places`)
    .nullable()
    .default(null);

// Not .min()/.max(): those also run on a non-string with a length and add a second message.
// Lengths count characters, as the rest of the API does, so an emoji is one, not two (#101).
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} is not valid` })
    .trim()
    // abort: the source rules below would otherwise add their messages to this one.
    .refine((value) => charCount(value) <= max, {
      message: `${label} must be ${max} characters or fewer`,
      abort: true,
    })
    .nullable()
    .default(null)
    .transform((value) => value || null);

const isHttpUrl = (value: string) => {
  // URL alone also accepts "http:foo", which is not an address anyone can open.
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const foodInput = z
  .object(
    {
      name: z
        .string({ error: 'Enter a food name' })
        .trim()
        .refine((value) => value.length >= 1, 'Enter a food name')
        .refine(
          (value) => charCount(value) <= 100,
          'The food name must be 100 characters or fewer',
        ),
      brand: optionalText('Brand', 50),
      category: optionalText('Category', 30),
      servingSize: z
        .number({ error: 'Enter a serving size' })
        .positive('The serving size must be greater than 0')
        .max(maxAmount, 'The serving size is too large')
        .refine(hasTwoDecimalsAtMost, 'The serving size can have at most 2 decimal places'),
      servingUnit: z
        .string({ error: 'Enter a serving size unit' })
        .trim()
        .refine((value) => value.length >= 1, 'Enter a serving size unit')
        .refine(
          (value) => charCount(value) <= 10,
          'The serving size unit must be 10 characters or fewer',
        ),
      calories: amount('Calories'),
      carbs: amount('Carbs'),
      protein: amount('Protein'),
      fat: amount('Fat'),
      sugars: amount('Sugars'),
      sodium: amount('Sodium'),
      sourceType: z
        .enum(['official', 'label', 'public', 'estimate', 'manual'], {
          error: 'The source type is not valid',
        })
        .default('manual'),
      sourceUrl: z
        .string({ error: 'The source URL is not valid' })
        .trim()
        .refine((value) => charCount(value) <= 2000, 'The source URL is too long')
        .refine(isHttpUrl, 'The source URL must start with http or https')
        .nullable()
        .default(null),
      checkedOn: z
        .string({ error: 'The verified date is not valid' })
        .refine(isRealDate, 'The verified date is not valid')
        .nullable()
        .default(null),
      // Left out, a new food is not junk food and an edited one keeps its mark, so a screen that
      // predates the mark cannot clear it.
      isJunk: z.boolean({ error: 'The junk food flag is not valid' }).optional(),
    },
    { error: 'The request body is not valid' },
  )
  .superRefine((food, ctx) => {
    // A number that claims a source has to say where and when it was checked.
    if (['official', 'public'].includes(food.sourceType) && !food.sourceUrl) {
      ctx.addIssue({ code: 'custom', message: 'Official and public data need a source URL' });
    }
    if (['official', 'public', 'label'].includes(food.sourceType) && !food.checkedOn) {
      ctx.addIssue({
        code: 'custom',
        message: 'Official and public data and product labels need a verified date',
      });
    }
  });

const searchQuery = z.object({
  q: z
    .string({ error: 'The search term is not valid' })
    .trim()
    .refine((value) => charCount(value) <= 100, 'The search term must be 100 characters or fewer')
    .default(''),
  offset: z
    .string({ error: 'The list offset is not valid' })
    .regex(/^\d{1,7}$/, 'The list offset is not valid')
    .transform(Number)
    .default(0),
});

/** How many foods one list or search request returns; the response says where the next page starts. */
const foodPageSize = 100;

type FoodRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  serving_size: string;
  serving_unit: string;
  calories: string | null;
  carbs: string | null;
  protein: string | null;
  fat: string | null;
  sugars: string | null;
  sodium: string | null;
  source_type: string;
  source_url: string | null;
  checked_on: string | null;
  is_junk: boolean;
};

const columns =
  'id, name, brand, category, serving_size, serving_unit, calories, carbs, protein, fat, sugars, sodium, source_type, source_url, checked_on, is_junk';

// pg returns BIGINT and NUMERIC as strings.
const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

const toFood = (row: FoodRow) => ({
  id: Number(row.id),
  name: row.name,
  brand: row.brand,
  category: row.category,
  servingSize: Number(row.serving_size),
  servingUnit: row.serving_unit,
  calories: optionalNumber(row.calories),
  carbs: optionalNumber(row.carbs),
  protein: optionalNumber(row.protein),
  fat: optionalNumber(row.fat),
  sugars: optionalNumber(row.sugars),
  sodium: optionalNumber(row.sodium),
  sourceType: row.source_type,
  sourceUrl: row.source_url,
  checkedOn: row.checked_on,
  isJunk: row.is_junk,
});

const inputValues = (food: z.infer<typeof foodInput>) => [
  food.name,
  food.brand,
  food.category,
  food.servingSize,
  food.servingUnit,
  food.calories,
  food.carbs,
  food.protein,
  food.fat,
  food.sugars,
  food.sodium,
  food.sourceType,
  food.sourceUrl,
  food.checkedOn,
];

/** How many recently eaten foods the meal card offers before any search. */
const recentLimit = 10;

// A search for "100%" means those characters, not a LIKE wildcard.
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

export function foodsRouter(pool: Pool, today: () => string, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  const parseFood = (body: unknown) => {
    const food = foodInput.parse(body);
    // A future date would also make every later research look older and be ignored.
    if (food.checkedOn && food.checkedOn > today()) {
      throw new HttpError(400, 'The verified date cannot be in the future');
    }
    return food;
  };

  router.get('/', async (req, res) => {
    const { q, offset } = searchQuery.parse(req.query);
    // One row past the page says whether another page exists, without counting every match.
    // Pages only add up if every food has one place in the order. A name and brand are already
    // unique; id keeps that true even if the rule is ever relaxed.
    const { rows } = await pool.query<FoodRow>(
      `SELECT ${columns} FROM foods
       WHERE $1 = '' OR name ILIKE $2 OR brand ILIKE $2
       ORDER BY name, brand NULLS FIRST, id
       LIMIT $3 OFFSET $4`,
      [q, likePattern(q), foodPageSize + 1, offset],
    );
    const more = rows.length > foodPageSize;
    res.json({
      foods: rows.slice(0, foodPageSize).map(toFood),
      nextOffset: more ? offset + foodPageSize : null,
    });
  });

  // Stored foods by when they were last recorded, each once. Typed-in entries have no food, and an
  // entry whose food was removed has lost its link, so neither can show up.
  router.get('/recent', async (_req, res) => {
    const { rows } = await pool.query<FoodRow>(
      `SELECT ${columns} FROM foods
       JOIN (
         SELECT food_id, max(id) AS last_entry FROM meal_entries
         WHERE food_id IS NOT NULL
         GROUP BY food_id
         ORDER BY last_entry DESC
         LIMIT ${recentLimit}
       ) recent ON recent.food_id = foods.id
       ORDER BY recent.last_entry DESC`,
    );
    res.json({ foods: rows.map(toFood) });
  });

  router.post('/', async (req, res) => {
    const food = parseFood(req.body);
    const { rows } = await pool.query<FoodRow>(
      `INSERT INTO foods (name, brand, category, serving_size, serving_unit, calories, carbs, protein,
         fat, sugars, sodium, source_type, source_url, checked_on, is_junk)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${columns}`,
      [...inputValues(food), food.isJunk ?? false],
    );
    res.status(201).json(toFood(rows[0]));
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'food');
    const food = parseFood(req.body);
    const { rows } = await pool.query<FoodRow>(
      `UPDATE foods SET name = $1, brand = $2, category = $3, serving_size = $4, serving_unit = $5,
         calories = $6, carbs = $7, protein = $8, fat = $9, sugars = $10, sodium = $11,
         source_type = $12, source_url = $13, checked_on = $14,
         is_junk = COALESCE($15, is_junk), updated_at = now()
       WHERE id = $16
       RETURNING ${columns}`,
      [...inputValues(food), food.isJunk ?? null, id],
    );
    if (!rows[0]) throw new HttpError(404, 'Food not found');
    res.json(toFood(rows[0]));
  });

  return router;
}
