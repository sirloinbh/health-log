import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { inSnapshot, testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// A day no other test file uses; everything here is rolled back anyway.
const day = '1994-02-01';

let pool: Pool;

before(() => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
});

after(async () => {
  if (skip) return;
  await pool.end();
});

test(
  'routes run their own transactions inside the snapshot, which is rolled back',
  { skip },
  async () => {
    await inSnapshot(pool, async (db) => {
      await withApi(db, async (call) => {
        const typed = { meal: 'snack', servings: 1, name: 'snapshot-test', calories: 10 };
        const read = async (entries: number) => {
          const answer = await call(`/api/meals/${day}`);
          assert.equal(answer.status, 200);
          assert.equal((answer.data.entries as unknown[]).length, entries);
        };
        // First, while no savepoint is open: a read-only REPEATABLE READ transaction (snapshotRead).
        await read(0);
        // BEGIN … COMMIT, then a 404 that rolls back its own part only.
        assert.equal(
          (await call(`/api/meals/${day}`, { method: 'POST', body: typed })).status,
          201,
        );
        const missing = await call(`/api/meals/${day}`, {
          method: 'POST',
          body: { meal: 'snack', servings: 1, foodId: 2147483647 },
        });
        assert.equal(missing.status, 404);
        // The snapshot is still usable after all of them.
        await read(1);
        assert.equal(
          (await call(`/api/meals/${day}`, { method: 'POST', body: typed })).status,
          201,
        );
        await read(2);
      });
    });
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM meal_entries WHERE entry_date = $1',
      [day],
    );
    assert.equal(rows[0].n, 0);
  },
);
