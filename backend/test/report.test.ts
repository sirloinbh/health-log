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
      ['?date=2026-11-05', '기간은 week 또는 month'],
      ['?period=year&date=2026-11-05', '기간은 week 또는 month'],
      ['?period=week', '날짜가 올바르지 않습니다'],
      ['?period=week&date=2026-02-30', '날짜가 올바르지 않습니다'],
      ['?period=week&date=2026-11-05&date=2026-11-06', '날짜가 올바르지 않습니다'],
    ]) {
      const { status, data } = await call(`/api/report${query}`);
      assert.equal(status, 400, query);
      assert.match(String(data.error), new RegExp(message), query);
    }
  });
});
