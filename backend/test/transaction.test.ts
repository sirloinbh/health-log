import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { inTransaction } from '../src/db.js';

// #193: the one inTransaction every route uses. A fake pool records what the client is sent.
const fakePool = (failOn?: string) => {
  const sent: string[] = [];
  const released: unknown[] = [];
  const client = {
    query: async (text: string) => {
      sent.push(text);
      if (text === failOn) throw new Error(`${text} failed`);
      return { rows: [] };
    },
    release: (destroy?: unknown) => released.push(destroy),
  };
  return { pool: { connect: async () => client } as unknown as Pool, sent, released };
};

test('the setup statement runs first, and the work is committed', async () => {
  const { pool, sent, released } = fakePool();
  const result = await inTransaction(
    pool,
    async (client) => {
      await client.query('SELECT 1');
      return 'done';
    },
    { setup: 'SET TRANSACTION READ ONLY' },
  );
  assert.equal(result, 'done');
  assert.deepEqual(sent, ['BEGIN', 'SET TRANSACTION READ ONLY', 'SELECT 1', 'COMMIT']);
  assert.deepEqual(released, [false]);
});

test('a failure rolls back and is rethrown as it was without a mapper', async () => {
  const { pool, sent } = fakePool('INSERT');
  await assert.rejects(
    inTransaction(pool, async (client) => client.query('INSERT')),
    /INSERT failed/,
  );
  assert.deepEqual(sent, ['BEGIN', 'INSERT', 'ROLLBACK']);
});

test('mapError turns a known failure into the answer, after the rollback', async () => {
  const { pool, sent } = fakePool('INSERT');
  const taken = new Error('name taken');
  await assert.rejects(
    inTransaction(pool, async (client) => client.query('INSERT'), { mapError: () => taken }),
    (error) => error === taken,
  );
  assert.deepEqual(sent, ['BEGIN', 'INSERT', 'ROLLBACK']);
});

test('a connection whose rollback fails is destroyed, not put back in the pool', async () => {
  const { pool, released } = fakePool('ROLLBACK');
  await assert.rejects(
    inTransaction(pool, async () => {
      throw new Error('work failed');
    }),
    /work failed/,
  );
  assert.deepEqual(released, [true]);
});
