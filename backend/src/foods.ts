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
    .number({ error: `${label}은(는) 숫자로 입력해 주세요` })
    .min(0, `${label}은(는) 0 이상이어야 합니다`)
    .max(maxAmount, `${label}이(가) 너무 큽니다`)
    .refine(hasTwoDecimalsAtMost, `${label}은(는) 소수 둘째 자리까지 입력해 주세요`)
    .nullable()
    .default(null);

// Not .min()/.max(): those also run on a non-string with a length and add a second message.
// Lengths count characters, as the rest of the API does, so an emoji is one, not two (#101).
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label}이(가) 올바르지 않습니다` })
    .trim()
    // abort: the source rules below would otherwise add their messages to this one.
    .refine((value) => charCount(value) <= max, {
      message: `${label}은(는) ${max}자 이하로 입력해 주세요`,
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
        .string({ error: '음식 이름을 입력해 주세요' })
        .trim()
        .refine((value) => value.length >= 1, '음식 이름을 입력해 주세요')
        .refine((value) => charCount(value) <= 100, '음식 이름은 100자 이하로 입력해 주세요'),
      brand: optionalText('브랜드', 50),
      category: optionalText('분류', 30),
      servingSize: z
        .number({ error: '1회 제공량을 입력해 주세요' })
        .positive('1회 제공량은 0보다 커야 합니다')
        .max(maxAmount, '1회 제공량이 너무 큽니다')
        .refine(hasTwoDecimalsAtMost, '1회 제공량은 소수 둘째 자리까지 입력해 주세요'),
      servingUnit: z
        .string({ error: '1회 제공량 단위를 입력해 주세요' })
        .trim()
        .refine((value) => value.length >= 1, '1회 제공량 단위를 입력해 주세요')
        .refine((value) => charCount(value) <= 10, '1회 제공량 단위는 10자 이하로 입력해 주세요'),
      calories: amount('칼로리'),
      carbs: amount('탄수화물'),
      protein: amount('단백질'),
      fat: amount('지방'),
      sugars: amount('당류'),
      sodium: amount('나트륨'),
      sourceType: z
        .enum(['official', 'label', 'public', 'estimate', 'manual'], {
          error: '출처 종류가 올바르지 않습니다',
        })
        .default('manual'),
      sourceUrl: z
        .string({ error: '출처 주소가 올바르지 않습니다' })
        .trim()
        .refine((value) => charCount(value) <= 2000, '출처 주소가 너무 깁니다')
        .refine(isHttpUrl, '출처 주소는 http 또는 https로 시작해야 합니다')
        .nullable()
        .default(null),
      checkedOn: z
        .string({ error: '확인 날짜가 올바르지 않습니다' })
        .refine(isRealDate, '확인 날짜가 올바르지 않습니다')
        .nullable()
        .default(null),
      // Left out, a new food is not junk food and an edited one keeps its mark, so a screen that
      // predates the mark cannot clear it.
      isJunk: z.boolean({ error: '정크푸드 표시가 올바르지 않습니다' }).optional(),
    },
    { error: '요청 본문이 올바르지 않습니다' },
  )
  .superRefine((food, ctx) => {
    // A number that claims a source has to say where and when it was checked.
    if (['official', 'public'].includes(food.sourceType) && !food.sourceUrl) {
      ctx.addIssue({ code: 'custom', message: '공식·공공 자료는 출처 주소가 필요합니다' });
    }
    if (['official', 'public', 'label'].includes(food.sourceType) && !food.checkedOn) {
      ctx.addIssue({
        code: 'custom',
        message: '공식·공공 자료와 제품 표기는 확인 날짜가 필요합니다',
      });
    }
  });

const searchQuery = z.object({
  q: z
    .string({ error: '검색어가 올바르지 않습니다' })
    .trim()
    .refine((value) => charCount(value) <= 100, '검색어는 100자 이하로 입력해 주세요')
    .default(''),
  offset: z
    .string({ error: '목록 위치가 올바르지 않습니다' })
    .regex(/^\d{1,7}$/, '목록 위치가 올바르지 않습니다')
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
      throw new HttpError(400, '확인 날짜는 오늘 이후일 수 없습니다');
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
    const id = parseId(req.params.id, '음식');
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
    if (!rows[0]) throw new HttpError(404, '음식을 찾을 수 없습니다');
    res.json(toFood(rows[0]));
  });

  return router;
}
