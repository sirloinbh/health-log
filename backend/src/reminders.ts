import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate, shiftDay } from './dates.js';
import { HttpError } from './standard/http.js';

// Reminders shown in the app (#48): the next visit day of a clinic visit (#39) and the last day of
// a medicine (#40). Medical details are sensitive, so no message here repeats what was entered, and
// nothing in this file logs a request.

/** Days ahead a reminder starts showing; today counts as day 0. */
const leadDays = 7;

export const doneInput = z.object(
  {
    kind: z.enum(['visit', 'medication'], { error: 'The reminder type is not valid' }),
    id: z
      .number({ error: 'The reminder target is not valid' })
      .int('The reminder target is not valid')
      .positive('The reminder target is not valid'),
    dueOn: z.string({ error: 'The reminder date is not valid' }).refine(isRealDate, {
      message: 'The reminder date is not valid',
    }),
  },
  { error: 'The request body is not valid' },
);

type VisitReminder = {
  kind: 'visit';
  id: number;
  dueOn: string;
  daysLeft: number;
  clinic: string;
  department: string | null;
  procedures: string[];
};

type MedicationReminder = {
  kind: 'medication';
  id: number;
  dueOn: string;
  daysLeft: number;
  name: string;
};

// Each kind's date column and the column its done marks are kept under.
const targets = {
  visit: { table: 'clinic_visits', due: 'next_visit_on', mark: 'visit_id' },
  medication: { table: 'medications', due: 'end_on', mark: 'medication_id' },
} as const;

/** On the same day, the appointment comes before the medicine. */
const kindOrder = { visit: 0, medication: 1 } as const;

const isForeignKeyError = (error: unknown) => (error as { code?: unknown })?.code === '23503';

/** `today` is the service date (Asia/Seoul), so "tomorrow" never follows the server clock's zone. */
export function remindersRouter(pool: Pool, today: () => string) {
  const router = Router();

  // Due from today to `leadDays` ahead, both ends included, and not marked done for that day.
  router.get('/', async (_req, res) => {
    const day = today();
    const [visits, medications] = await Promise.all([
      pool.query<VisitReminder>(
        `SELECT 'visit' AS kind, v.id, v.next_visit_on AS "dueOn",
           v.next_visit_on - $1::date AS "daysLeft", v.clinic, v.department,
           ARRAY(SELECT p.name FROM clinic_procedures p WHERE p.visit_id = v.id ORDER BY p.position)
             AS procedures
         FROM clinic_visits v
         WHERE v.next_visit_on BETWEEN $1::date AND $1::date + $2::int
           AND NOT EXISTS (
             SELECT 1 FROM reminders_done d WHERE d.visit_id = v.id AND d.due_on = v.next_visit_on)`,
        [day, leadDays],
      ),
      pool.query<MedicationReminder>(
        `SELECT 'medication' AS kind, m.id, m.end_on AS "dueOn", m.end_on - $1::date AS "daysLeft",
           m.name
         FROM medications m
         WHERE m.end_on BETWEEN $1::date AND $1::date + $2::int
           AND NOT EXISTS (
             SELECT 1 FROM reminders_done d WHERE d.medication_id = m.id AND d.due_on = m.end_on)`,
        [day, leadDays],
      ),
    ]);
    const reminders = [...visits.rows, ...medications.rows].sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) || kindOrder[a.kind] - kindOrder[b.kind] || a.id - b.id,
    );
    res.json({ today: day, until: shiftDay(day, leadDays), leadDays, reminders });
  });

  // Marks one reminder done for the day it is due. The day must still be the record's: a reminder
  // read before the visit or medicine was moved to another day is not marked under the old one.
  // Marking it twice is the same as once.
  router.post('/done', async (req, res) => {
    const { kind, id, dueOn } = doneInput.parse(req.body);
    const { table, due, mark } = targets[kind];
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO reminders_done (${mark}, due_on)
         SELECT id, ${due} FROM ${table} WHERE id = $1 AND ${due} = $2
         ON CONFLICT DO NOTHING`,
        [id, dueOn],
      );
      if (!rowCount) {
        const { rowCount: already } = await pool.query(
          `SELECT 1 FROM reminders_done d JOIN ${table} t ON t.id = d.${mark}
           WHERE d.${mark} = $1 AND d.due_on = $2 AND t.${due} = $2`,
          [id, dueOn],
        );
        if (!already) throw new HttpError(404, 'Reminder not found');
      }
    } catch (error) {
      // Deleted between the read and the write.
      if (isForeignKeyError(error)) throw new HttpError(404, 'Reminder not found');
      throw error;
    }
    res.status(204).end();
  });

  return router;
}
