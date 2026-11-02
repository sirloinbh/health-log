import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
// These tests write. A shared machine's variable may name another project's test database.
const databaseName = url ? new URL(url).pathname.slice(1) : null;
const skip =
  databaseName === 'health_test'
    ? false
    : `health_test 전용 DB가 아닙니다: ${databaseName ?? '없음'}`;

// Far from any real record.
const first = '1990-02-01';
const last = '1990-02-28';

let pool: Pool;

const clean = () =>
  pool.query('DELETE FROM body_records WHERE record_date BETWEEN $1 AND $2', [first, last]);

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

test('a day without a record answers with no record', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/body/1990-02-01');
    assert.equal(status, 200);
    assert.equal(data.record, null);
  });
});

test('weight alone is saved and the rest stays empty, not zero', { skip }, async () => {
  await withApi(pool, async (call) => {
    const saved = await call('/api/body/1990-02-02', {
      method: 'PUT',
      body: { weightKg: 70.55 },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data, {
      date: '1990-02-02',
      weightKg: 70.55,
      bodyFatPercent: null,
      waistCm: null,
      systolicMmhg: null,
      diastolicMmhg: null,
      memo: null,
    });
    const { rows } = await pool.query<{ waist_cm: string | null }>(
      "SELECT waist_cm FROM body_records WHERE record_date = '1990-02-02'",
    );
    assert.equal(rows[0]!.waist_cm, null);
    assert.deepEqual((await call('/api/body/1990-02-02')).data.record, saved.data);
  });
});

test('saving a day again replaces the whole record', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = '/api/body/1990-02-03';
    await call(path, {
      method: 'PUT',
      body: { weightKg: 70, waistCm: 80.5, systolicMmhg: 120, diastolicMmhg: 80, memo: '아침' },
    });
    const saved = await call(path, { method: 'PUT', body: { bodyFatPercent: 18.25 } });
    assert.equal(saved.data.bodyFatPercent, 18.25);
    assert.equal(saved.data.weightKg, null);
    assert.equal(saved.data.systolicMmhg, null);
    assert.equal(saved.data.memo, null);
    const { rows } = await pool.query(
      "SELECT 1 FROM body_records WHERE record_date = '1990-02-03'",
    );
    assert.equal(rows.length, 1);
  });
});

test('every field comes back as it was sent', { skip }, async () => {
  await withApi(pool, async (call) => {
    const body = {
      weightKg: 500,
      bodyFatPercent: 100,
      waistCm: 300,
      systolicMmhg: 300,
      diastolicMmhg: 200,
      memo: '공복 측정',
    };
    const saved = await call('/api/body/1990-02-04', { method: 'PUT', body });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data, { date: '1990-02-04', ...body });
  });
});

test('a range returns its days in order and nothing outside', { skip }, async () => {
  await withApi(pool, async (call) => {
    for (const day of ['1990-02-20', '1990-02-10', '1990-02-15', '1990-02-25']) {
      await call(`/api/body/${day}`, { method: 'PUT', body: { weightKg: 70 } });
    }
    const { data } = await call('/api/body?from=1990-02-10&to=1990-02-20');
    assert.deepEqual(
      (data.records as { date: string }[]).map((record) => record.date),
      ['1990-02-10', '1990-02-15', '1990-02-20'],
    );
  });
});

test('deleting removes the record and a second delete is 404', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = '/api/body/1990-02-05';
    await call(path, { method: 'PUT', body: { weightKg: 70 } });
    assert.equal((await call(path, { method: 'DELETE' })).status, 204);
    assert.equal((await call(path)).data.record, null);
    assert.equal((await call(path, { method: 'DELETE' })).status, 404);
  });
});

test('the database itself refuses what the API refuses', { skip }, async () => {
  const insert = (column: string, ...values: number[]) => {
    const columns = column.split(',');
    const places = values.map((_, index) => `$${index + 2}`).join(', ');
    return pool.query(
      `INSERT INTO body_records (record_date, ${columns.join(', ')}) VALUES ($1, ${places})`,
      ['1990-02-06', ...values],
    );
  };
  const attempts: [string, ...number[]][] = [
    ['weight_kg', 0],
    ['body_fat_percent', 100.5],
    ['waist_cm', -1],
    ['systolic_mmhg', 120],
    ['diastolic_mmhg', 80],
    ['systolic_mmhg,diastolic_mmhg', 80, 90],
  ];
  for (const [column, ...values] of attempts) {
    await assert.rejects(insert(column, ...values), { code: '23514' }, column);
  }
});
