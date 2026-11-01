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
const days = ['1990-01-02', '1990-01-03', '1990-01-04', '1990-01-05', '1990-01-06'];
const times = (day: string, previousDay: string) => ({
  bedAt: `${previousDay}T23:30:00+09:00`,
  wakeAt: `${day}T07:00:00+09:00`,
});

let pool: Pool;

const clean = () => pool.query('DELETE FROM sleep_records WHERE sleep_date = ANY($1)', [days]);

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
    const { status, data } = await call(`/api/sleep/${days[0]}`);
    assert.equal(status, 200);
    assert.equal(data.record, null);
  });
});

test('a saved sleep comes back with its length and source', { skip }, async () => {
  await withApi(pool, async (call) => {
    const saved = await call(`/api/sleep/${days[1]}`, {
      method: 'PUT',
      body: times('1990-01-03', '1990-01-02'),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.durationMinutes, 450);
    assert.equal(saved.data.source, 'manual');

    const { data } = await call(`/api/sleep/${days[1]}`);
    assert.deepEqual(data.record, {
      date: '1990-01-03',
      bedAt: '1990-01-02T14:30:00.000Z',
      wakeAt: '1990-01-02T22:00:00.000Z',
      durationMinutes: 450,
      deepMinutes: null,
      lightMinutes: null,
      remMinutes: null,
      awakeMinutes: null,
      sleepScore: null,
      source: 'manual',
    });
  });
});

test('saving a day again replaces its one record', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = `/api/sleep/${days[2]}`;
    await call(path, { method: 'PUT', body: times('1990-01-04', '1990-01-03') });
    await call(path, {
      method: 'PUT',
      body: { bedAt: '1990-01-04T01:00:00+09:00', wakeAt: '1990-01-04T07:00:00+09:00' },
    });
    const { rows } = await pool.query<{ duration_minutes: number }>(
      'SELECT duration_minutes FROM sleep_records WHERE sleep_date = $1',
      [days[2]],
    );
    assert.deepEqual(
      rows.map((row) => row.duration_minutes),
      [360],
    );
  });
});

test('typing over an imported sleep drops the stages that no longer apply', { skip }, async () => {
  await pool.query(
    `INSERT INTO sleep_records
       (sleep_date, bed_at, wake_at, duration_minutes, deep_minutes, sleep_score, source)
     VALUES ($1, '1990-01-04T14:00:00Z', '1990-01-04T22:00:00Z', 480, 90, 80, 'garmin')`,
    [days[3]],
  );
  await withApi(pool, async (call) => {
    const before = await call(`/api/sleep/${days[3]}`);
    const imported = before.data.record as Record<string, unknown>;
    assert.equal(imported.source, 'garmin');
    assert.equal(imported.deepMinutes, 90);
    assert.equal(imported.sleepScore, 80);

    const { data } = await call(`/api/sleep/${days[3]}`, {
      method: 'PUT',
      body: times('1990-01-05', '1990-01-04'),
    });
    assert.equal(data.source, 'manual');
    assert.equal(data.deepMinutes, null);
    assert.equal(data.sleepScore, null);
  });
});

test('exactly a day is accepted by the server and the database', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call(`/api/sleep/${days[4]}`, {
      method: 'PUT',
      body: { bedAt: '1990-01-05T07:00:00+09:00', wakeAt: '1990-01-06T07:00:00+09:00' },
    });
    assert.equal(status, 200);
    assert.equal(data.durationMinutes, 1440);
  });
  await pool.query('DELETE FROM sleep_records WHERE sleep_date = $1', [days[4]]);
});

test('deleting removes the record, and deleting again is a 404', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = `/api/sleep/${days[4]}`;
    await call(path, { method: 'PUT', body: times('1990-01-06', '1990-01-05') });
    assert.equal((await call(path, { method: 'DELETE' })).status, 204);
    assert.equal((await call(path)).data.record, null);
    const again = await call(path, { method: 'DELETE' });
    assert.equal(again.status, 404);
    assert.equal(again.data.error, '수면 기록을 찾을 수 없습니다');
  });
});

test('the database itself refuses a sleep longer than a day', { skip }, async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes)
       VALUES ('1990-01-02', '1990-01-01T00:00:00Z', '1990-01-02T00:01:00Z', 60)`,
    ),
    { code: '23514' },
  );
});

test('the database itself refuses a wake time before the bed time', { skip }, async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes)
       VALUES ('1990-01-02', '1990-01-02T07:00:00Z', '1990-01-02T06:00:00Z', 60)`,
    ),
    { code: '23514' },
  );
});
