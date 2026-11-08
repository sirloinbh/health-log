import type { Pool, PoolClient } from 'pg';

/** A pool or a client inside a transaction: either can run the reads. */
export type Db = Pick<Pool, 'query'> | PoolClient;

/** Begins a read where every statement sees the same moment. */
export const snapshotRead = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';

/** Runs `run` in one transaction, rolled back if it throws. */
export const inTransaction = async <T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  begin = 'BEGIN',
) => {
  const client = await pool.connect();
  try {
    await client.query(begin);
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
