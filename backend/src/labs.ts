import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { withNumbers } from './numbers.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount, likePattern } from './text.js';

// Checkup and blood test results (#330). Medical values are sensitive, so no message here repeats
// what was entered, and nothing in this file logs a request.

const maxValue = 1_000_000_000;
const pageSize = 20;

const fourDecimalsAtMost = (value: number) => Number(value.toFixed(4)) === value;

const amount = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} must be 0 or more`)
    .max(maxValue, `${label} must be 1 billion or less`)
    .refine(fourDecimalsAtMost, `${label} can have at most 4 decimal places`);

// Blank means no value; the database refuses empty text, so it is stored as null.
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} is not valid` })
    .trim()
    .refine((value) => charCount(value) <= max, {
      message: `${label} must be ${max} characters or fewer`,
      abort: true,
    })
    .nullable()
    .default(null)
    .transform((value) => value || null);

export const labInput = z
  .object(
    {
      date: z
        .string({ error: 'Choose a test date' })
        .refine(isRealDate, 'The test date is not valid'),
      name: z
        .string({ error: 'Enter the test name' })
        .trim()
        .refine((value) => value.length >= 1, 'Enter the test name')
        .refine((value) => charCount(value) <= 100, 'Test name must be 100 characters or fewer'),
      value: amount('Result'),
      unit: optionalText('Unit', 20),
      refLow: amount('Reference minimum').nullable().default(null),
      refHigh: amount('Reference maximum').nullable().default(null),
      note: optionalText('Note', 500),
      visitId: z
        .number({ error: 'The linked clinic visit is not valid' })
        .int('The linked clinic visit is not valid')
        .positive('The linked clinic visit is not valid')
        .nullable()
        .default(null),
    },
    { error: 'The request body is not valid' },
  )
  .refine((lab) => lab.refLow === null || lab.refHigh === null || lab.refLow <= lab.refHigh, {
    message: 'The reference minimum cannot be above the maximum',
  });

type LabInput = z.infer<typeof labInput>;

export const labListQuery = z.object({
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

type LabRow = {
  id: number;
  date: string;
  name: string;
  value: string;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
  note: string | null;
  /** The visit it was taken at, named so the list can say where; null when unlinked or once gone. */
  visit: { id: number; date: string; clinic: string } | null;
};

// json_build_object writes a date as "YYYY-MM-DD" and an id as a JSON number, and pg parses json.
const select = `
  SELECT l.id, l.test_date AS date, l.name, l.value, l.unit, l.ref_low AS "refLow",
    l.ref_high AS "refHigh", l.note,
    CASE WHEN v.id IS NULL THEN NULL
      ELSE json_build_object('id', v.id, 'date', v.visit_date, 'clinic', v.clinic) END AS visit
  FROM lab_results l
  LEFT JOIN clinic_visits v ON v.id = l.visit_id`;

type PgError = { code?: unknown; constraint?: unknown };

const unknownVisit = (error: unknown) => {
  const { code, constraint } = (error ?? {}) as PgError;
  return code === '23503' && constraint === 'lab_results_visit_id_fkey';
};

const toResult = (row: LabRow) => withNumbers(row, ['value', 'refLow', 'refHigh']);

export function labsRouter(pool: Pool) {
  const router = Router();

  const values = (lab: LabInput) => [
    lab.date,
    lab.name,
    lab.value,
    lab.unit,
    lab.refLow,
    lab.refHigh,
    lab.note,
    lab.visitId,
  ];

  const read = async (id: number) => {
    const { rows } = await pool.query<LabRow>(`${select} WHERE l.id = $1`, [id]);
    return rows[0];
  };

  // A visit that is gone, or never was, is the client's mistake rather than a server fault.
  const write = async <T>(run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (unknownVisit(error))
        throw new HttpError(400, 'The linked clinic visit could not be found');
      throw error;
    }
  };

  // A page of results, newest first, optionally searched by test name.
  router.get('/', async (req, res) => {
    const { q, offset } = labListQuery.parse(req.query);
    const { rows } = await pool.query<LabRow>(
      `${select}
       WHERE $1 = '' OR l.name ILIKE $2
       ORDER BY l.test_date DESC, l.id DESC
       LIMIT $3 OFFSET $4`,
      [q, likePattern(q), pageSize + 1, offset],
    );
    res.json({ results: rows.slice(0, pageSize).map(toResult), more: rows.length > pageSize });
  });

  router.post('/', async (req, res) => {
    const lab = labInput.parse(req.body);
    const id = await write(async () => {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO lab_results (test_date, name, value, unit, ref_low, ref_high, note, visit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        values(lab),
      );
      return rows[0].id;
    });
    res.status(201).json(toResult(await read(id)));
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'lab result');
    const lab = labInput.parse(req.body);
    const { rowCount } = await write(() =>
      pool.query(
        `UPDATE lab_results SET test_date = $1, name = $2, value = $3, unit = $4, ref_low = $5,
           ref_high = $6, note = $7, visit_id = $8, updated_at = now()
         WHERE id = $9`,
        [...values(lab), id],
      ),
    );
    if (!rowCount) throw new HttpError(404, 'Lab result not found');
    res.json(toResult(await read(id)));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'lab result');
    const { rowCount } = await pool.query('DELETE FROM lab_results WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Lab result not found');
    res.status(204).end();
  });

  return router;
}
