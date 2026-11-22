import { createHash } from 'node:crypto';

import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod/v4';

import { HttpError } from './standard/http.js';

// Safe retries for the meal POST routes (#196), as docs/project-setup.md 6.2 describes: the screen sends
// one UUID `Idempotency-Key` per user action. The first request stores its answer under the key in the
// same transaction as its rows; a retry with the same key and the same request gets that answer back and
// adds nothing. The same key with a different request is a 409. Without the header a request runs as
// before.

export const requestKeyHeader = 'Idempotency-Key';

export const requestKeySchema = z.uuid({ error: 'The Idempotency-Key header must be a UUID' });

/** How long a key is kept. A retry comes within seconds or minutes; a day leaves room for a slow network. */
const keepFor = '1 day';

/** The request's key, or undefined without the header. A malformed key is a 400. */
export const requestKeyOf = (req: Request) => {
  const value = req.get(requestKeyHeader);
  if (value === undefined) return undefined;
  const parsed = requestKeySchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  return parsed.data.toLowerCase();
};

/** SHA-256 of the method, the path and the parsed body (its keys in the schema's order). */
export const fingerprintOf = (req: Request, input: unknown) =>
  createHash('sha256')
    .update(JSON.stringify([req.method, `${req.baseUrl}${req.path}`, input]))
    .digest('hex');

/**
 * Runs `run` once per key, inside the caller's transaction. Without a key it simply runs. The advisory
 * lock makes a second request with the same key wait until the first commits or rolls back, so both never
 * insert. A failed first request stores nothing, so its retry runs again.
 */
export async function oncePerKey<T>(
  client: PoolClient,
  key: string | undefined,
  fingerprint: string,
  run: () => Promise<T>,
): Promise<T> {
  if (key === undefined) return run();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
  await client.query(
    `DELETE FROM meal_request_keys WHERE created_at < now() - interval '${keepFor}'`,
  );
  const { rows } = await client.query<{ fingerprint: string; answer: T }>(
    'SELECT fingerprint, answer FROM meal_request_keys WHERE key = $1',
    [key],
  );
  if (rows[0]) {
    if (rows[0].fingerprint !== fingerprint) {
      throw new HttpError(409, 'This request key was already used for a different request');
    }
    return rows[0].answer;
  }
  const answer = await run();
  await client.query(
    'INSERT INTO meal_request_keys (key, fingerprint, answer) VALUES ($1, $2, $3)',
    [key, fingerprint, JSON.stringify(answer)],
  );
  return answer;
}
