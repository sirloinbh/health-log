import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record.
const first = '1990-03-01';
const last = '1990-03-31';

let pool: Pool;

const clean = () =>
  pool.query('DELETE FROM intake_entries WHERE record_date BETWEEN $1 AND $2', [first, last]);

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await clean();
});

after(async () => {
  if (skip) return;
  await clean();
  await pool.end();
});

type Day = {
  date: string;
  kinds: Record<string, { count: number; amount: number }>;
  waterMl: number;
  caffeineMg: number;
};

test('counts go up and down, add up in ml and mg, and stop at 0', { skip }, async () => {
  await withApi(pool, async (call) => {
    const empty = await call('/api/intake/1990-03-05');
    assert.equal(empty.status, 200);
    assert.equal((empty.data as unknown as Day).waterMl, 0);

    for (const kind of ['water', 'water', 'coffee', 'coffee', 'tea']) {
      const { status } = await call('/api/intake/1990-03-05', { method: 'POST', body: { kind } });
      assert.equal(status, 201);
    }
    const day = (await call('/api/intake/1990-03-05')).data as unknown as Day;
    assert.deepEqual(day.kinds.water, { count: 2, amount: 500 });
    assert.deepEqual(day.kinds.coffee, { count: 2, amount: 190 });
    assert.equal(day.waterMl, 500);
    assert.equal(day.caffeineMg, 230);

    const minus = await call('/api/intake/1990-03-05/coffee', { method: 'DELETE' });
    assert.equal((minus.data as unknown as Day).kinds.coffee.count, 1);

    for (let i = 0; i < 3; i += 1)
      await call('/api/intake/1990-03-05/energy', { method: 'DELETE' });
    const after = (await call('/api/intake/1990-03-05')).data as unknown as Day;
    assert.equal(after.kinds.energy.count, 0);
  });
});

test('a drink on a past day has no time, other days are separate', { skip }, async () => {
  await withApi(pool, async (call) => {
    await call('/api/intake/1990-03-06', { method: 'POST', body: { kind: 'tea' } });
    const { rows } = await pool.query(
      "SELECT consumed_at FROM intake_entries WHERE record_date = '1990-03-06'",
    );
    assert.equal(rows[0].consumed_at, null);
    const other = (await call('/api/intake/1990-03-07')).data as unknown as Day;
    assert.equal(other.kinds.tea.count, 0);
  });
});

test('a drink counted on today keeps its time', { skip }, async () => {
  await withApi(
    pool,
    async (call) => {
      await call('/api/intake/1990-03-08', { method: 'POST', body: { kind: 'coffee' } });
      const { rows } = await pool.query(
        "SELECT consumed_at FROM intake_entries WHERE record_date = '1990-03-08'",
      );
      assert.ok(rows[0].consumed_at instanceof Date);
    },
    { today: () => '1990-03-08' },
  );
});

test('the count per kind is limited and bad input is a 400', { skip }, async () => {
  await withApi(pool, async (call) => {
    const bad = await call('/api/intake/1990-03-09', { method: 'POST', body: { kind: 'beer' } });
    assert.equal(bad.status, 400);
    assert.equal((await call('/api/intake/1990-03-09/beer', { method: 'DELETE' })).status, 400);
    assert.equal((await call('/api/intake/not-a-date')).status, 400);
    for (let i = 0; i < 52; i += 1) {
      await call('/api/intake/1990-03-09', { method: 'POST', body: { kind: 'water' } });
    }
    const day = (await call('/api/intake/1990-03-09')).data as unknown as Day;
    assert.equal(day.kinds.water.count, 50);
  });
});
