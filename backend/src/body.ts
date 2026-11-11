import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';
import { charCount } from './text.js';

const maxRangeDays = 366;

// The columns keep two decimals; anything finer would be rounded silently.
const hasTwoDecimalsAtMost = (value: number) => Number(value.toFixed(2)) === value;

const measure = (label: string, max: number) =>
  z
    .number({ error: `${label} must be a number` })
    .gt(0, `${label} must be greater than 0`)
    .max(max, `${label} must be ${max} or less`)
    .refine(hasTwoDecimalsAtMost, `${label} can have at most 2 decimal places`)
    .nullable()
    .default(null);

const pressure = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be ${min} or more`)
    .max(max, `${label} must be ${max} or less`)
    .nullable()
    .default(null);

const bodyInput = z
  .object(
    {
      weightKg: measure('Weight', 500),
      bodyFatPercent: measure('Body fat', 100),
      waistCm: measure('Waist', 300),
      systolicMmhg: pressure('Systolic blood pressure', 50, 300),
      diastolicMmhg: pressure('Diastolic blood pressure', 20, 200),
      memo: z
        .string({ error: 'The note is not valid' })
        .trim()
        .refine((value) => charCount(value) <= 500, 'The note must be 500 characters or fewer')
        .nullable()
        .default(null)
        .transform((value) => value || null),
    },
    { error: 'The request body is not valid' },
  )
  .superRefine((input, ctx) => {
    const { systolicMmhg: systolic, diastolicMmhg: diastolic } = input;
    if ((systolic === null) !== (diastolic === null)) {
      ctx.addIssue({ code: 'custom', message: 'Enter both systolic and diastolic blood pressure' });
    }
    if (systolic !== null && diastolic !== null && systolic <= diastolic) {
      ctx.addIssue({
        code: 'custom',
        message: 'Systolic blood pressure must be higher than diastolic',
      });
    }
    if (Object.values(input).every((value) => value === null)) {
      ctx.addIssue({ code: 'custom', message: 'Enter at least one value to save' });
    }
  });

type BodyRow = {
  record_date: string;
  weight_kg: string | null;
  body_fat_percent: string | null;
  waist_cm: string | null;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
  memo: string | null;
};

const columns =
  'record_date, weight_kg, body_fat_percent, waist_cm, systolic_mmhg, diastolic_mmhg, memo';

// pg returns NUMERIC as a string.
const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

const toRecord = (row: BodyRow) => ({
  date: row.record_date,
  weightKg: optionalNumber(row.weight_kg),
  bodyFatPercent: optionalNumber(row.body_fat_percent),
  waistCm: optionalNumber(row.waist_cm),
  systolicMmhg: row.systolic_mmhg,
  diastolicMmhg: row.diastolic_mmhg,
  memo: row.memo,
});

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function bodyRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/', async (req, res) => {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from > to) throw new HttpError(400, 'The start date cannot be after the end date');
    if (daysBetween(from, to) >= maxRangeDays) {
      throw new HttpError(400, `The date range must be ${maxRangeDays} days or fewer`);
    }
    const { rows } = await pool.query<BodyRow>(
      `SELECT ${columns} FROM body_records WHERE record_date BETWEEN $1 AND $2 ORDER BY record_date`,
      [from, to],
    );
    res.json({ records: rows.map(toRecord) });
  });

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rows } = await pool.query<BodyRow>(
      `SELECT ${columns} FROM body_records WHERE record_date = $1`,
      [date],
    );
    res.json({ record: rows[0] ? toRecord(rows[0]) : null });
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = bodyInput.parse(req.body);
    const { rows } = await pool.query<BodyRow>(
      `INSERT INTO body_records (record_date, weight_kg, body_fat_percent, waist_cm, systolic_mmhg, diastolic_mmhg, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (record_date) DO UPDATE SET
         weight_kg = EXCLUDED.weight_kg,
         body_fat_percent = EXCLUDED.body_fat_percent,
         waist_cm = EXCLUDED.waist_cm,
         systolic_mmhg = EXCLUDED.systolic_mmhg,
         diastolic_mmhg = EXCLUDED.diastolic_mmhg,
         memo = EXCLUDED.memo,
         updated_at = now()
       RETURNING ${columns}`,
      [
        date,
        input.weightKg,
        input.bodyFatPercent,
        input.waistCm,
        input.systolicMmhg,
        input.diastolicMmhg,
        input.memo,
      ],
    );
    res.json(toRecord(rows[0]));
  });

  router.delete('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rowCount } = await pool.query('DELETE FROM body_records WHERE record_date = $1', [
      date,
    ]);
    if (!rowCount) throw new HttpError(404, 'Body record not found');
    res.status(204).end();
  });

  return router;
}
