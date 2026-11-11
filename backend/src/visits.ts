import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError, parseId } from './standard/http.js';
import { charCount } from './text.js';

// Clinic visits and their procedures (#39). Medical details are sensitive, so no message here ever
// repeats what was entered, and nothing in this file logs a request.

const maxProcedures = 10;
const maxCost = 100_000_000;
const visitPageSize = 20;

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

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `Enter ${label.toLowerCase()}` })
    .trim()
    .refine((value) => value.length >= 1, `Enter ${label.toLowerCase()}`)
    .refine((value) => charCount(value) <= max, `${label} must be ${max} characters or fewer`);

const cost = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number of won`)
    .min(0, `${label} must be 0 won or more`)
    .max(maxCost, `${label} must be 100 million won or less`)
    .nullable()
    .default(null);

const visitInput = z
  .object(
    {
      date: z
        .string({ error: 'Choose a visit date' })
        .refine(isRealDate, 'The visit date is not valid'),
      clinic: requiredText('Clinic name', 100),
      department: optionalText('Department', 50),
      note: optionalText('Symptoms and diagnosis note', 1000),
      cost: cost('Visit cost'),
      nextVisitOn: z
        .string({ error: 'The next appointment date is not valid' })
        .refine(isRealDate, 'The next appointment date is not valid')
        .nullable()
        .default(null),
      procedures: z
        .array(
          z.object(
            {
              name: requiredText('Procedure name', 100),
              area: optionalText('Procedure area', 50),
              amount: optionalText('Dose or count', 50),
              cost: cost('Procedure cost'),
              note: optionalText('Procedure note', 500),
            },
            { error: 'The procedure is not valid' },
          ),
          { error: 'The procedure list is not valid' },
        )
        .max(maxProcedures, `You can record up to ${maxProcedures} procedures per visit`)
        .default([]),
    },
    { error: 'The request body is not valid' },
  )
  .refine((visit) => !visit.nextVisitOn || visit.nextVisitOn >= visit.date, {
    message: 'The next appointment date cannot be before the visit date',
  });

type VisitInput = z.infer<typeof visitInput>;

const listQuery = z.object({
  q: z
    .string({ error: 'The search term is not valid' })
    .trim()
    .refine((value) => charCount(value) <= 100, 'The search term must be 100 characters or fewer')
    .default(''),
  date: z
    .string({ error: 'The date is not valid' })
    .refine(isRealDate, 'The date is not valid')
    .optional(),
  offset: z
    .string({ error: 'The list offset is not valid' })
    .regex(/^\d{1,7}$/, 'The list offset is not valid')
    .transform(Number)
    .default(0),
});

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

type Procedure = {
  name: string;
  area: string | null;
  amount: string | null;
  cost: number | null;
  note: string | null;
};

type VisitRow = {
  id: string;
  visit_date: string;
  clinic: string;
  department: string | null;
  note: string | null;
  cost: number | null;
  next_visit_on: string | null;
  procedures: Procedure[];
};

const toVisit = (row: VisitRow) => ({
  id: Number(row.id),
  date: row.visit_date,
  clinic: row.clinic,
  department: row.department,
  note: row.note,
  cost: row.cost,
  nextVisitOn: row.next_visit_on,
  procedures: row.procedures,
});

// One row per visit with its procedures in order; the newest visit first.
const visitSql = (where: string, page = '') => `
  SELECT v.id, v.visit_date, v.clinic, v.department, v.note, v.cost, v.next_visit_on,
    COALESCE(
      json_agg(
        json_build_object('name', p.name, 'area', p.area, 'amount', p.amount, 'cost', p.cost,
          'note', p.note)
        ORDER BY p.position
      ) FILTER (WHERE p.visit_id IS NOT NULL),
      '[]'
    ) AS procedures
  FROM clinic_visits v
  LEFT JOIN clinic_procedures p ON p.visit_id = v.id
  ${where}
  GROUP BY v.id
  ORDER BY v.visit_date DESC, v.id DESC
  ${page}`;

export function visitsRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  const read = async (db: Pick<Pool, 'query'> | PoolClient, id: number) => {
    const { rows } = await db.query<VisitRow>(visitSql('WHERE v.id = $1'), [id]);
    return rows[0] ? toVisit(rows[0]) : undefined;
  };

  // A visit and its procedures change together, or not at all.
  const inTransaction = async <T>(run: (client: PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  // One statement per procedure keeps the order explicit; the transaction undoes them all on failure.
  const putProcedures = async (
    client: PoolClient,
    visitId: number,
    list: VisitInput['procedures'],
  ) => {
    for (const [index, item] of list.entries()) {
      await client.query(
        `INSERT INTO clinic_procedures (visit_id, position, name, area, amount, cost, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [visitId, index + 1, item.name, item.area, item.amount, item.cost, item.note],
      );
    }
  };

  const values = (visit: VisitInput) => [
    visit.date,
    visit.clinic,
    visit.department,
    visit.note,
    visit.cost,
    visit.nextVisitOn,
  ];

  // A day's visits (for the daily page), or a page of every visit, optionally searched by the
  // clinic's name or a procedure's name.
  router.get('/', async (req, res) => {
    const { q, date, offset } = listQuery.parse(req.query);
    if (date) {
      const { rows } = await pool.query<VisitRow>(visitSql('WHERE v.visit_date = $1'), [date]);
      res.json({ visits: rows.map(toVisit), more: false });
      return;
    }
    const { rows } = await pool.query<VisitRow>(
      visitSql(
        `WHERE $1 = '' OR v.clinic ILIKE $2 OR EXISTS (
           SELECT 1 FROM clinic_procedures s WHERE s.visit_id = v.id AND s.name ILIKE $2)`,
        'LIMIT $3 OFFSET $4',
      ),
      [q, likePattern(q), visitPageSize + 1, offset],
    );
    const more = rows.length > visitPageSize;
    res.json({ visits: rows.slice(0, visitPageSize).map(toVisit), more });
  });

  router.post('/', async (req, res) => {
    const visit = visitInput.parse(req.body);
    const created = await inTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO clinic_visits (visit_date, clinic, department, note, cost, next_visit_on)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        values(visit),
      );
      const id = Number(rows[0].id);
      await putProcedures(client, id, visit.procedures);
      return read(client, id);
    });
    res.status(201).json(created);
  });

  // Replaces the visit and its whole list of procedures.
  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'clinic visit');
    const visit = visitInput.parse(req.body);
    const updated = await inTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE clinic_visits SET visit_date = $1, clinic = $2, department = $3, note = $4,
           cost = $5, next_visit_on = $6, updated_at = now()
         WHERE id = $7`,
        [...values(visit), id],
      );
      if (!rowCount) throw new HttpError(404, 'Clinic visit record not found');
      await client.query('DELETE FROM clinic_procedures WHERE visit_id = $1', [id]);
      await putProcedures(client, id, visit.procedures);
      return read(client, id);
    });
    res.json(updated);
  });

  // The procedures go with it (ON DELETE CASCADE).
  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'clinic visit');
    const { rowCount } = await pool.query('DELETE FROM clinic_visits WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Clinic visit record not found');
    res.status(204).end();
  });

  return router;
}
