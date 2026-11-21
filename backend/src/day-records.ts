import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './standard/db.js';

/** A pool or a client inside a transaction: either can run the reads. */
export type Db = Pick<Pool, 'query'> | PoolClient;

/** Run first inside a transaction: every statement of a read then sees the same moment. */
export const snapshotRead = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

/** Runs `run` in one transaction (managed withTransaction), rolled back if it throws. `setup` runs first. */
export const inTransaction = <T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  setup?: string,
) =>
  withTransaction<T, PoolClient>(pool, async (client) => {
    if (setup) await client.query(setup);
    return run(client);
  });

const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// Dates here are calendar days in the service time zone, already fixed by the caller. Counting
// them as UTC midnights keeps every boundary on the day it names, whatever the server's zone.
export function periodsOf(date: string) {
  const day = Date.parse(`${date}T00:00:00Z`);
  // Weeks run Monday to Sunday.
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  const monday = day - sinceMonday * 86_400_000;
  const [year, month] = date.split('-').map(Number);
  return {
    week: { from: toDate(monday), to: toDate(monday + 6 * 86_400_000) },
    month: {
      from: `${date.slice(0, 7)}-01`,
      to: toDate(Date.UTC(year, month, 0)),
    },
  };
}
