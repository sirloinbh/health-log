import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

let pool: Pool;

before(() => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
});

after(async () => {
  if (skip) return;
  await pool.end();
});

// Reads only: nothing is written, so these dates need no cleaning up.
test(
  'the first and last dates the API takes give answers, not database errors',
  { skip },
  async () => {
    await withApi(pool, async (call) => {
      for (const date of ['1900-01-01', '2999-12-31']) {
        for (const path of [
          `/api/report?period=week&date=${date}`,
          `/api/report?period=month&date=${date}`,
          `/api/habits/${date}`,
          `/api/checks/${date}`,
          `/api/body?from=${date}&to=${date}`,
        ]) {
          const { status, data } = await call(path);
          assert.equal(status, 200, `${path}: ${JSON.stringify(data)}`);
        }
      }
    });
  },
);
