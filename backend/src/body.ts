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
    .number({ error: `${label}은(는) 숫자로 입력해 주세요` })
    .gt(0, `${label}은(는) 0보다 커야 합니다`)
    .max(max, `${label}은(는) ${max} 이하로 입력해 주세요`)
    .refine(hasTwoDecimalsAtMost, `${label}은(는) 소수 둘째 자리까지 입력해 주세요`)
    .nullable()
    .default(null);

const pressure = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label}은(는) 숫자로 입력해 주세요` })
    .int(`${label}은(는) 정수로 입력해 주세요`)
    .min(min, `${label}은(는) ${min} 이상으로 입력해 주세요`)
    .max(max, `${label}은(는) ${max} 이하로 입력해 주세요`)
    .nullable()
    .default(null);

const bodyInput = z
  .object(
    {
      weightKg: measure('체중', 500),
      bodyFatPercent: measure('체지방률', 100),
      waistCm: measure('허리둘레', 300),
      systolicMmhg: pressure('수축기 혈압', 50, 300),
      diastolicMmhg: pressure('이완기 혈압', 20, 200),
      memo: z
        .string({ error: '메모가 올바르지 않습니다' })
        .trim()
        .refine((value) => charCount(value) <= 500, '메모는 500자 이하로 입력해 주세요')
        .nullable()
        .default(null)
        .transform((value) => value || null),
    },
    { error: '요청 본문이 올바르지 않습니다' },
  )
  .superRefine((input, ctx) => {
    const { systolicMmhg: systolic, diastolicMmhg: diastolic } = input;
    if ((systolic === null) !== (diastolic === null)) {
      ctx.addIssue({ code: 'custom', message: '혈압은 수축기와 이완기를 함께 입력해 주세요' });
    }
    if (systolic !== null && diastolic !== null && systolic <= diastolic) {
      ctx.addIssue({ code: 'custom', message: '수축기 혈압은 이완기 혈압보다 높아야 합니다' });
    }
    if (Object.values(input).every((value) => value === null)) {
      ctx.addIssue({ code: 'custom', message: '저장할 값을 하나 이상 입력해 주세요' });
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
    if (from > to) throw new HttpError(400, '시작 날짜는 끝 날짜보다 늦을 수 없습니다');
    if (daysBetween(from, to) >= maxRangeDays) {
      throw new HttpError(400, `조회 기간은 ${maxRangeDays}일 이하로 지정해 주세요`);
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
    if (!rowCount) throw new HttpError(404, '신체 기록을 찾을 수 없습니다');
    res.status(204).end();
  });

  return router;
}
