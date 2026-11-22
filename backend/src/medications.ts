import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

// Medicines taken over a period (#40). Medical details are sensitive, so no message here ever
// repeats what was entered, and nothing in this file logs a request.

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

export const medicationInput = z
  .object(
    {
      name: z
        .string({ error: 'Enter a medication name' })
        .trim()
        .refine((value) => value.length >= 1, 'Enter a medication name')
        .refine(
          (value) => charCount(value) <= 100,
          'The medication name must be 100 characters or fewer',
        ),
      dose: optionalText('Dose', 50),
      directions: optionalText('Directions', 100),
      startOn: z
        .string({ error: 'Choose a start date' })
        .refine(isRealDate, 'The start date is not valid'),
      endOn: z
        .string({ error: 'The end date is not valid' })
        .refine(isRealDate, 'The end date is not valid')
        .nullable()
        .default(null),
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
  .refine((item) => !item.endOn || item.endOn >= item.startOn, {
    message: 'The end date cannot be before the start date',
  });

type MedicationInput = z.infer<typeof medicationInput>;

export const dayQuery = z.object({
  date: z
    .string({ error: 'The date is not valid' })
    .refine(isRealDate, 'The date is not valid')
    .optional(),
});

type Medication = {
  id: number;
  name: string;
  dose: string | null;
  directions: string | null;
  startOn: string;
  endOn: string | null;
  note: string | null;
  /** The visit it came from, named so the list can say where; null once that visit is gone. */
  visit: { id: number; date: string; clinic: string } | null;
};

// json_build_object writes a date as "YYYY-MM-DD" and an id as a JSON number, and pg parses json.
const medicationSql = (where: string, order: string) => `
  SELECT m.id, m.name, m.dose, m.directions, m.start_on AS "startOn", m.end_on AS "endOn", m.note,
    CASE WHEN v.id IS NULL THEN NULL
      ELSE json_build_object('id', v.id, 'date', v.visit_date, 'clinic', v.clinic) END AS visit
  FROM medications m
  LEFT JOIN clinic_visits v ON v.id = m.visit_id
  ${where}
  ORDER BY ${order}`;

// Taken on a day when it has started and not yet ended; dates are calendar days, both ends included.
const takenOn = (param: string) =>
  `m.start_on <= ${param} AND (m.end_on IS NULL OR m.end_on >= ${param})`;

type PgError = { code?: unknown; constraint?: unknown };

const unknownVisit = (error: unknown) => {
  const { code, constraint } = (error ?? {}) as PgError;
  return code === '23503' && constraint === 'medications_visit_id_fkey';
};

/**
 * `today` is the service date (Asia/Seoul), so "being taken now" never follows the server's own
 * clock zone.
 */
export function medicationsRouter(pool: Pool, today: () => string) {
  const router = Router();

  const read = async (id: number) => {
    const { rows } = await pool.query<Medication>(medicationSql('WHERE m.id = $1', 'm.id'), [id]);
    return rows[0];
  };

  const values = (item: MedicationInput) => [
    item.name,
    item.dose,
    item.directions,
    item.startOn,
    item.endOn,
    item.note,
    item.visitId,
  ];

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

  // The medicines taken on one day (for the daily page), or every medicine split by today:
  // being taken, starting later, and finished.
  router.get('/', async (req, res) => {
    const { date } = dayQuery.parse(req.query);
    if (date) {
      const { rows } = await pool.query<Medication>(
        medicationSql(`WHERE ${takenOn('$1')}`, 'm.start_on, m.id'),
        [date],
      );
      res.json({ date, medications: rows });
      return;
    }
    const day = today();
    const [current, upcoming, past] = await Promise.all([
      pool.query<Medication>(medicationSql(`WHERE ${takenOn('$1')}`, 'm.start_on DESC, m.id'), [
        day,
      ]),
      pool.query<Medication>(medicationSql('WHERE m.start_on > $1', 'm.start_on, m.id'), [day]),
      pool.query<Medication>(medicationSql('WHERE m.end_on < $1', 'm.end_on DESC, m.id DESC'), [
        day,
      ]),
    ]);
    res.json({
      today: day,
      current: current.rows,
      upcoming: upcoming.rows,
      past: past.rows,
    });
  });

  router.post('/', async (req, res) => {
    const item = medicationInput.parse(req.body);
    const { rows } = await write(() =>
      pool.query<{ id: number }>(
        `INSERT INTO medications (name, dose, directions, start_on, end_on, note, visit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        values(item),
      ),
    );
    res.status(201).json(await read(rows[0].id));
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'medication record');
    const item = medicationInput.parse(req.body);
    const { rowCount } = await write(() =>
      pool.query(
        `UPDATE medications SET name = $1, dose = $2, directions = $3, start_on = $4, end_on = $5,
           note = $6, visit_id = $7, updated_at = now()
         WHERE id = $8`,
        [...values(item), id],
      ),
    );
    if (!rowCount) throw new HttpError(404, 'Medication record not found');
    res.json(await read(id));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'medication record');
    const { rowCount } = await pool.query('DELETE FROM medications WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Medication record not found');
    res.status(204).end();
  });

  return router;
}
