import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { type Db, inTransaction, snapshotRead } from './db.js';

/** Water is counted in cups; the others are caffeine drinks, one per cup or can. */
export const intakeKinds = ['water', 'coffee', 'tea', 'energy', 'other_caffeine'] as const;
export type IntakeKind = (typeof intakeKinds)[number];
/** What one tap adds: ml for water, mg of caffeine for the others (approximate cup or can sizes, #325). */
export const intakeAmounts: Record<IntakeKind, number> = {
  water: 250,
  coffee: 95,
  tea: 40,
  energy: 80,
  other_caffeine: 50,
};
// Far above any real day; stops a stuck button or a script from filling the table.
export const maxPerKind = 50;

export const intakeInput = z.object(
  { kind: z.enum(intakeKinds, { error: 'The drink type is not valid' }) },
  { error: 'The request body is not valid' },
);

type Total = { count: number; amount: number };

const readDay = async (db: Db, date: string) => {
  // count() and sum() of an integer are int8, which setInt8Parser already returns as a number.
  const { rows } = await db.query<{ kind: IntakeKind; count: number; amount: number }>(
    `SELECT kind, count(*) AS count, sum(amount) AS amount
     FROM intake_entries WHERE record_date = $1 GROUP BY kind`,
    [date],
  );
  const kinds = Object.fromEntries(
    intakeKinds.map((kind) => [kind, { count: 0, amount: 0 }]),
  ) as Record<IntakeKind, Total>;
  for (const row of rows) kinds[row.kind] = { count: row.count, amount: row.amount };
  const caffeineMg = intakeKinds
    .filter((kind) => kind !== 'water')
    .reduce((sum, kind) => sum + kinds[kind].amount, 0);
  return { date, kinds, waterMl: kinds.water.amount, caffeineMg };
};

export function intakeRouter(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    res.json(await inTransaction(pool, (client) => readDay(client, date), { setup: snapshotRead }));
  });

  // Plus: add one drink of a kind.
  router.post('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { kind } = intakeInput.parse(req.body);
    const day = await inTransaction(pool, async (client) => {
      // Taps of one day and kind take turns, so the limit below holds when two arrive together.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('intake:' || $1::text))", [date]);
      const { rows } = await client.query<{ count: number }>(
        'SELECT count(*) AS count FROM intake_entries WHERE record_date = $1 AND kind = $2',
        [date, kind],
      );
      if (rows[0].count < maxPerKind) {
        await client.query(
          `INSERT INTO intake_entries (record_date, kind, amount, consumed_at)
           VALUES ($1, $2, $3, CASE WHEN $1::date = $4::date THEN now() END)`,
          [date, kind, intakeAmounts[kind], today()],
        );
      }
      return readDay(client, date);
    });
    res.status(201).json(day);
  });

  // Minus: remove the newest drink of a kind. At 0 it changes nothing, so the count never goes below 0.
  router.delete('/:date/:kind', async (req, res) => {
    const date = parseDate(req.params.date);
    const kind = intakeInput.shape.kind.parse(req.params.kind);
    const day = await inTransaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('intake:' || $1::text))", [date]);
      await client.query(
        `DELETE FROM intake_entries WHERE id = (
           SELECT id FROM intake_entries WHERE record_date = $1 AND kind = $2
           ORDER BY id DESC LIMIT 1)`,
        [date, kind],
      );
      return readDay(client, date);
    });
    res.json(day);
  });

  return router;
}
