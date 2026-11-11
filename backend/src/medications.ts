import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
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

const medicationInput = z
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

const dayQuery = z.object({
  date: z
    .string({ error: 'The date is not valid' })
    .refine(isRealDate, 'The date is not valid')
    .optional(),
});

type MedicationRow = {
  id: string;
  name: string;
  dose: string | null;
  directions: string | null;
  start_on: string;
  end_on: string | null;
  note: string | null;
  visit_id: string | null;
  visit_date: string | null;
  clinic: string | null;
};

const toMedication = (row: MedicationRow) => ({
  id: Number(row.id),
  name: row.name,
  dose: row.dose,
  directions: row.directions,
  startOn: row.start_on,
  endOn: row.end_on,
  note: row.note,
  // The visit it came from, named so the list can say where; null once that visit is gone.
  visit:
    row.visit_id === null
      ? null
      : { id: Number(row.visit_id), date: row.visit_date ?? '', clinic: row.clinic ?? '' },
});

const medicationSql = (where: string, order: string) => `
  SELECT m.id, m.name, m.dose, m.directions, m.start_on, m.end_on, m.note, m.visit_id,
    v.visit_date, v.clinic
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
export function medicationsRouter(pool: Pool, today: () => string, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  const read = async (id: number) => {
    const { rows } = await pool.query<MedicationRow>(medicationSql('WHERE m.id = $1', 'm.id'), [
      id,
    ]);
    return rows[0] ? toMedication(rows[0]) : undefined;
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
      const { rows } = await pool.query<MedicationRow>(
        medicationSql(`WHERE ${takenOn('$1')}`, 'm.start_on, m.id'),
        [date],
      );
      res.json({ date, medications: rows.map(toMedication) });
      return;
    }
    const day = today();
    const [current, upcoming, past] = await Promise.all([
      pool.query<MedicationRow>(medicationSql(`WHERE ${takenOn('$1')}`, 'm.start_on DESC, m.id'), [
        day,
      ]),
      pool.query<MedicationRow>(medicationSql('WHERE m.start_on > $1', 'm.start_on, m.id'), [day]),
      pool.query<MedicationRow>(medicationSql('WHERE m.end_on < $1', 'm.end_on DESC, m.id DESC'), [
        day,
      ]),
    ]);
    res.json({
      today: day,
      current: current.rows.map(toMedication),
      upcoming: upcoming.rows.map(toMedication),
      past: past.rows.map(toMedication),
    });
  });

  router.post('/', async (req, res) => {
    const item = medicationInput.parse(req.body);
    const { rows } = await write(() =>
      pool.query<{ id: string }>(
        `INSERT INTO medications (name, dose, directions, start_on, end_on, note, visit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        values(item),
      ),
    );
    res.status(201).json(await read(Number(rows[0].id)));
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
