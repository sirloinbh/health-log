import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './standard/db.js';

/** A pool or a client inside a transaction: either can run the reads. */
export type Db = Pick<Pool, 'query'> | PoolClient;

/** Run first inside a transaction: every statement of a read then sees the same moment. */
export const snapshotRead = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

type TransactionOptions = {
  /** A statement run first, such as `snapshotRead`. */
  setup?: string;
  /** Turns a known database error into the error the route answers with; return others as they are. */
  mapError?: (error: unknown) => unknown;
};

/**
 * Runs `run` in one transaction: committed when it resolves, rolled back when it throws. The managed
 * withTransaction does the work, so a connection whose ROLLBACK fails is released with
 * `release(true)` and destroyed instead of going back to the pool.
 */
export const inTransaction = async <T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  { setup, mapError }: TransactionOptions = {},
) => {
  try {
    return await withTransaction<T, PoolClient>(pool, async (client) => {
      if (setup) await client.query(setup);
      return run(client);
    });
  } catch (error) {
    throw mapError ? mapError(error) : error;
  }
};
