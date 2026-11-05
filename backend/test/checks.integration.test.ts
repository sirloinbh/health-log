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

// Far from any real record. 1990-04-01 is a Sunday and 1990-04-30 a Monday.
const first = '1990-03-01';
const last = '1990-05-31';

let pool: Pool;

const clean = () =>
  pool.query('DELETE FROM day_checks WHERE record_date BETWEEN $1 AND $2', [first, last]);

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

type Rate = { days: number; yes: number };
type Day = {
  record: {
    date: string;
    dietKept: boolean | null;
    sleepGood: boolean | null;
    memo: string | null;
  } | null;
  week: { from: string; to: string; diet: Rate; sleep: Rate };
  month: { from: string; to: string; diet: Rate; sleep: Rate };
};

type Call = Parameters<Parameters<typeof withApi>[1]>[0];

const put = async (call: Call, date: string, body: unknown) => {
  const { status, data } = await call(`/api/checks/${date}`, { method: 'PUT', body });
  assert.equal(status, 200, JSON.stringify(data));
  return data as unknown as Day;
};

test('a day with no check has no record and nothing counted', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/checks/1990-03-05');
    assert.equal(status, 200);
    const day = data as unknown as Day;
    assert.equal(day.record, null);
    assert.deepEqual(day.week.diet, { days: 0, yes: 0 });
    assert.deepEqual(day.week.sleep, { days: 0, yes: 0 });
  });
});

test(
  'an unchecked item is not a no, and each rate counts only its own answered days',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      // Monday to Wednesday of one week.
      await put(call, '1990-03-05', { dietKept: true, sleepGood: false });
      // Diet only: sleep stays unchecked.
      await put(call, '1990-03-06', { dietKept: false });
      // A memo alone checks nothing.
      const memoOnly = await put(call, '1990-03-07', { memo: '  회식  ' });
      assert.deepEqual(memoOnly.record, {
        date: '1990-03-07',
        dietKept: null,
        sleepGood: null,
        memo: '회식',
      });
      // Diet answered twice, one yes; sleep answered once, no yes.
      assert.deepEqual(memoOnly.week.diet, { days: 2, yes: 1 });
      assert.deepEqual(memoOnly.week.sleep, { days: 1, yes: 0 });
    });
  },
);

test('saving again replaces every field, a cleared one included', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-12', { dietKept: true, sleepGood: true, memo: '좋음' });
    const again = await put(call, '1990-03-12', { sleepGood: false });
    assert.deepEqual(again.record, {
      date: '1990-03-12',
      dietKept: null,
      sleepGood: false,
      memo: null,
    });
    assert.deepEqual(again.week.diet, { days: 0, yes: 0 });
    assert.deepEqual(again.week.sleep, { days: 1, yes: 0 });
  });
});

test('weekly and monthly rates stop at their boundaries', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-31', { dietKept: true, sleepGood: true });
    await put(call, '1990-04-01', { dietKept: false, sleepGood: true });
    await put(call, '1990-04-02', { dietKept: true });
    await put(call, '1990-04-30', { dietKept: true, sleepGood: false });
    await put(call, '1990-05-01', { dietKept: false, sleepGood: false });

    const sunday = (await call('/api/checks/1990-04-01')).data as unknown as Day;
    assert.deepEqual([sunday.week.from, sunday.week.to], ['1990-03-26', '1990-04-01']);
    assert.deepEqual(sunday.week.diet, { days: 2, yes: 1 });
    assert.deepEqual(sunday.week.sleep, { days: 2, yes: 2 });
    assert.deepEqual([sunday.month.from, sunday.month.to], ['1990-04-01', '1990-04-30']);
    assert.deepEqual(sunday.month.diet, { days: 3, yes: 2 });
    assert.deepEqual(sunday.month.sleep, { days: 2, yes: 1 });

    const monday = (await call('/api/checks/1990-04-02')).data as unknown as Day;
    assert.deepEqual(monday.week.diet, { days: 1, yes: 1 });
    assert.deepEqual(monday.week.sleep, { days: 0, yes: 0 });

    // 04-30 is a Monday whose week runs into May; the month does not.
    const lastOfApril = (await call('/api/checks/1990-04-30')).data as unknown as Day;
    assert.deepEqual(lastOfApril.week.diet, { days: 2, yes: 1 });
    assert.deepEqual(lastOfApril.month.diet, { days: 3, yes: 2 });
  });
});

test('deleting a day removes its check, and a second delete answers 404', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-20', { dietKept: true });
    assert.equal((await call('/api/checks/1990-03-20', { method: 'DELETE' })).status, 204);
    const day = (await call('/api/checks/1990-03-20')).data as unknown as Day;
    assert.equal(day.record, null);
    assert.deepEqual(day.week.diet, { days: 0, yes: 0 });
    assert.equal((await call('/api/checks/1990-03-20', { method: 'DELETE' })).status, 404);
  });
});

test('the database refuses rows the API would never write', { skip }, async (t) => {
  t.after(clean);
  await assert.rejects(pool.query("INSERT INTO day_checks (record_date) VALUES ('1990-03-22')"));
  await assert.rejects(
    pool.query("INSERT INTO day_checks (record_date, memo) VALUES ('1990-03-22', '')"),
  );
  await assert.rejects(
    pool.query(
      "INSERT INTO day_checks (record_date, memo) VALUES ('1990-03-22', repeat('a', 201))",
    ),
  );
});

test(
  'a memo of exactly 200 characters is kept, and spaces around it do not count',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      const full = '가'.repeat(200);
      const day = await put(call, '1990-03-26', { memo: `  ${full}  ` });
      assert.equal(day.record?.memo, full);
      const { status } = await call('/api/checks/1990-03-26', {
        method: 'PUT',
        body: { memo: `${full}가` },
      });
      assert.equal(status, 400);
    });
    // The database takes the same 200 the API lets through.
    await pool.query(
      "INSERT INTO day_checks (record_date, memo) VALUES ('1990-03-27', repeat('a', 200))",
    );
  },
);
