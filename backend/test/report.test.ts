import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const untouched = () => {
  const pool = {
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  } as unknown as Pool;
  return pool;
};

test('a report needs a known period and a real date', async () => {
  await withApi(untouched(), async (call) => {
    for (const [query, message] of [
      ['?date=2026-11-05', 'The period must be week or month'],
      ['?period=year&date=2026-11-05', 'The period must be week or month'],
      ['?period=week', 'The date is not valid'],
      ['?period=week&date=2026-02-30', 'The date is not valid'],
      ['?period=week&date=2026-11-05&date=2026-11-06', 'The date is not valid'],
    ]) {
      const { status, data } = await call(`/api/report${query}`);
      assert.equal(status, 400, query);
      assert.match(String(data.error), new RegExp(message), query);
    }
  });
});
