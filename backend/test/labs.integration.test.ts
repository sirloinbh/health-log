import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record; made-up values only.
const marker = 'zz-test-lab';
const clinic = 'zz-test-lab-clinic';
const day = '1990-03-05';

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM lab_results WHERE name LIKE $1', [`${marker}%`]);
  await pool.query('DELETE FROM clinic_visits WHERE clinic = $1', [clinic]);
};

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

const body = (overrides: Record<string, unknown> = {}) => ({
  date: day,
  name: `${marker}-chol`,
  value: 190.5,
  unit: 'mg/dL',
  refLow: 0,
  refHigh: 200,
  note: null,
  visitId: null,
  ...overrides,
});

test('a result is created, read back with numbers, changed and deleted', { skip }, async () => {
  await withApi(pool, async (call) => {
    const created = await call('/api/labs', { method: 'POST', body: body() });
    assert.equal(created.status, 201);
    const { visitId: _unused, ...sent } = body();
    assert.deepEqual(created.data, { id: created.data.id, ...sent, visit: null });
    const id = created.data.id as number;

    const listed = await call(`/api/labs?q=${marker}`);
    assert.equal(listed.status, 200);
    assert.equal((listed.data.results as { id: number }[])[0]!.id, id);
    assert.equal(listed.data.more, false);

    const changed = await call(`/api/labs/${id}`, {
      method: 'PUT',
      body: body({ value: 150, unit: null, refLow: null, refHigh: null, note: '공복' }),
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.value, 150);
    assert.equal(changed.data.unit, null);
    assert.equal(changed.data.refLow, null);
    assert.equal(changed.data.note, '공복');

    assert.equal((await call(`/api/labs/${id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await call(`/api/labs/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await call(`/api/labs/${id}`, { method: 'PUT', body: body() })).status, 404);
  });
});

test('the list is newest first, searchable and paged', { skip }, async () => {
  await withApi(pool, async (call) => {
    for (let index = 0; index < 22; index += 1) {
      const date = `1990-03-${String(index + 1).padStart(2, '0')}`;
      await call('/api/labs', { method: 'POST', body: body({ date, name: `${marker}-page` }) });
    }
    await call('/api/labs', { method: 'POST', body: body({ name: `${marker}-other` }) });
    const first = await call(`/api/labs?q=${marker}-PAGE`);
    const results = first.data.results as { date: string }[];
    assert.equal(results.length, 20);
    assert.equal(first.data.more, true);
    assert.equal(results[0]!.date, '1990-03-22');
    const second = await call(`/api/labs?q=${marker}-page&offset=20`);
    assert.equal((second.data.results as unknown[]).length, 2);
    assert.equal(second.data.more, false);
  });
});

test(
  'a result links to a visit; an unknown visit is 400; deleting the visit unlinks',
  {
    skip,
  },
  async () => {
    await withApi(pool, async (call) => {
      const visit = await call('/api/visits', { method: 'POST', body: { date: day, clinic } });
      const visitId = visit.data.id as number;
      const created = await call('/api/labs', { method: 'POST', body: body({ visitId }) });
      assert.equal(created.status, 201);
      assert.deepEqual(created.data.visit, { id: visitId, date: day, clinic });

      const unknown = await call('/api/labs', {
        method: 'POST',
        body: body({ visitId: 999_999_999 }),
      });
      assert.equal(unknown.status, 400);
      assert.match(String(unknown.data.error), /could not be found/);
      const unknownPut = await call(`/api/labs/${created.data.id}`, {
        method: 'PUT',
        body: body({ visitId: 999_999_999 }),
      });
      assert.equal(unknownPut.status, 400);

      await call(`/api/visits/${visitId}`, { method: 'DELETE' });
      const after = await call(`/api/labs?q=${marker}-chol`);
      const row = (after.data.results as { id: number; visit: unknown }[]).find(
        (result) => result.id === created.data.id,
      );
      assert.equal(row?.visit, null);
    });
  },
);

test('the database itself refuses a negative value and an inverted range', { skip }, async () => {
  const insert = (value: number, low: number | null, high: number | null) =>
    pool.query(
      'INSERT INTO lab_results (test_date, name, value, ref_low, ref_high) VALUES ($1, $2, $3, $4, $5)',
      [day, `${marker}-db`, value, low, high],
    );
  await assert.rejects(insert(-1, null, null), { code: '23514' });
  await assert.rejects(insert(1, 5, 4), { code: '23514' });
});
