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
  pool.query('DELETE FROM habit_days WHERE record_date BETWEEN $1 AND $2', [first, last]);

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

type Summary = {
  from: string;
  to: string;
  smoking: { days: number; cigarettes: number | null };
  drinking: {
    days: number;
    drinkingDays: number;
    totals: { kind: string; unit: string; amount: number }[];
  };
};
type Day = {
  record: { date: string; cigarettes: number | null; drinks: unknown[] | null } | null;
  week: Summary;
  month: Summary;
};

const put = async (
  call: Parameters<Parameters<typeof withApi>[1]>[0],
  date: string,
  body: unknown,
) => {
  const { status, data } = await call(`/api/habits/${date}`, { method: 'PUT', body });
  assert.equal(status, 200, JSON.stringify(data));
  return data as unknown as Day;
};

test('a day with nothing recorded has no record and unknown totals', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/habits/1990-03-05');
    assert.equal(status, 200);
    const day = data as unknown as Day;
    assert.equal(day.record, null);
    assert.deepEqual(day.week.smoking, { days: 0, cigarettes: null });
    assert.deepEqual(day.week.drinking, { days: 0, drinkingDays: 0, totals: [] });
  });
});

test('zero is kept apart from not recorded, for smoking and for drinking', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    // Recorded as none for both.
    const none = await put(call, '1990-03-06', { cigarettes: 0, drinks: [] });
    assert.deepEqual(none.record, { date: '1990-03-06', cigarettes: 0, drinks: [] });
    assert.deepEqual(none.week.smoking, { days: 1, cigarettes: 0 });
    assert.deepEqual(none.week.drinking, { days: 1, drinkingDays: 0, totals: [] });

    // Smoking only: drinking stays unrecorded, not "did not drink".
    const smokeOnly = await put(call, '1990-03-07', { cigarettes: 3 });
    assert.deepEqual(smokeOnly.record, { date: '1990-03-07', cigarettes: 3, drinks: null });
    assert.deepEqual(smokeOnly.week.smoking, { days: 2, cigarettes: 3 });
    assert.equal(smokeOnly.week.drinking.days, 1);

    // Drinking only: smoking stays unrecorded.
    const drinkOnly = await put(call, '1990-03-08', {
      drinks: [{ kind: 'beer', unit: 'can', amount: 2 }],
    });
    assert.equal(drinkOnly.record?.cigarettes, null);
    assert.deepEqual(drinkOnly.week.smoking, { days: 2, cigarettes: 3 });
    assert.deepEqual(drinkOnly.week.drinking, {
      days: 2,
      drinkingDays: 1,
      totals: [{ kind: 'beer', unit: 'can', amount: 2 }],
    });
  });
});

test('saving again replaces the day, drinks included, in the order given', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-12', {
      cigarettes: 5,
      drinks: [
        { kind: 'soju', unit: 'bottle', amount: 1 },
        { kind: 'beer', unit: 'glass', amount: 3 },
      ],
    });
    const again = await put(call, '1990-03-12', {
      drinks: [
        { kind: 'wine', unit: 'glass', amount: 1.5 },
        { kind: 'soju', unit: 'glass', amount: 2 },
      ],
    });
    assert.deepEqual(again.record, {
      date: '1990-03-12',
      cigarettes: null,
      drinks: [
        { kind: 'wine', unit: 'glass', amount: 1.5 },
        { kind: 'soju', unit: 'glass', amount: 2 },
      ],
    });
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM habit_drinks WHERE record_date = $1',
      ['1990-03-12'],
    );
    assert.equal(rows[0].n, 2);

    // Back to smoking only: the drinks go, and drinking reads as not recorded again.
    const smokeOnly = await put(call, '1990-03-12', { cigarettes: 1 });
    assert.deepEqual(smokeOnly.record, { date: '1990-03-12', cigarettes: 1, drinks: null });
    const left = await pool.query(
      'SELECT count(*)::int AS n FROM habit_drinks WHERE record_date = $1',
      ['1990-03-12'],
    );
    assert.equal(left.rows[0].n, 0);
  });
});

test('a day with several drinks counts once among the drinking days', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-13', {
      drinks: [
        { kind: 'soju', unit: 'bottle', amount: 1 },
        { kind: 'beer', unit: 'glass', amount: 2 },
        { kind: 'beer', unit: 'can', amount: 1 },
      ],
    });
    const day = await put(call, '1990-03-14', { drinks: [] });
    assert.equal(day.week.drinking.days, 2);
    assert.equal(day.week.drinking.drinkingDays, 1);
    assert.equal(day.week.drinking.totals.length, 3);
  });
});

test('weekly and monthly totals stop at their boundaries', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    // Saturday and Sunday close the week of 03-26; Monday 04-02 opens the next one.
    await put(call, '1990-03-31', {
      cigarettes: 4,
      drinks: [{ kind: 'soju', unit: 'bottle', amount: 1 }],
    });
    await put(call, '1990-04-01', {
      cigarettes: 6,
      drinks: [{ kind: 'soju', unit: 'bottle', amount: 0.5 }],
    });
    await put(call, '1990-04-02', {
      cigarettes: 10,
      drinks: [{ kind: 'beer', unit: 'glass', amount: 2 }],
    });
    // The last day of April and the first of May.
    await put(call, '1990-04-30', { cigarettes: 1, drinks: [] });
    await put(call, '1990-05-01', { cigarettes: 20 });

    const sunday = (await call('/api/habits/1990-04-01')).data as unknown as Day;
    assert.deepEqual([sunday.week.from, sunday.week.to], ['1990-03-26', '1990-04-01']);
    assert.deepEqual(sunday.week.smoking, { days: 2, cigarettes: 10 });
    assert.deepEqual(sunday.week.drinking, {
      days: 2,
      drinkingDays: 2,
      totals: [{ kind: 'soju', unit: 'bottle', amount: 1.5 }],
    });
    // April holds 04-01, 04-02 and 04-30, not 03-31 or 05-01.
    assert.deepEqual([sunday.month.from, sunday.month.to], ['1990-04-01', '1990-04-30']);
    assert.deepEqual(sunday.month.smoking, { days: 3, cigarettes: 17 });
    assert.deepEqual(sunday.month.drinking, {
      days: 3,
      drinkingDays: 2,
      totals: [
        { kind: 'soju', unit: 'bottle', amount: 0.5 },
        { kind: 'beer', unit: 'glass', amount: 2 },
      ],
    });

    const monday = (await call('/api/habits/1990-04-02')).data as unknown as Day;
    assert.deepEqual([monday.week.from, monday.week.to], ['1990-04-02', '1990-04-08']);
    assert.deepEqual(monday.week.smoking, { days: 1, cigarettes: 10 });

    // 04-30 is a Monday whose week runs into May; the month does not.
    const lastOfApril = (await call('/api/habits/1990-04-30')).data as unknown as Day;
    assert.deepEqual(lastOfApril.week.smoking, { days: 2, cigarettes: 21 });
    assert.deepEqual(lastOfApril.month.smoking, { days: 3, cigarettes: 17 });
  });
});

test(
  'deleting a day removes its drinks too, and a second delete answers 404',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      await put(call, '1990-03-20', { drinks: [{ kind: 'makgeolli', unit: 'bottle', amount: 1 }] });
      assert.equal((await call('/api/habits/1990-03-20', { method: 'DELETE' })).status, 204);
      const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM habit_drinks WHERE record_date = $1',
        ['1990-03-20'],
      );
      assert.equal(rows[0].n, 0);
      assert.equal((await call('/api/habits/1990-03-20')).data.record, null);
      assert.equal((await call('/api/habits/1990-03-20', { method: 'DELETE' })).status, 404);
    });
  },
);

test('a save that fails partway leaves the earlier record whole', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await put(call, '1990-03-21', {
      cigarettes: 2,
      drinks: [{ kind: 'beer', unit: 'can', amount: 1 }],
    });
  });
  // The second drink of the new save fails after the day and the first drink were written.
  const failing = Object.create(pool) as Pool;
  failing.connect = (async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    // A stand-in, so the client goes back to the pool unchanged.
    return Object.assign(Object.create(client) as typeof client, {
      release: (error?: Error | boolean) => client.release(error),
      query: (text: unknown, values?: unknown[]) => {
        if (
          typeof text === 'string' &&
          text.includes('INSERT INTO habit_drinks') &&
          values?.[1] === 1
        ) {
          return Promise.reject(new Error('second drink failed'));
        }
        return query(text as string, values);
      },
    });
  }) as unknown as Pool['connect'];
  await withApi(failing, async (call) => {
    const { status } = await call('/api/habits/1990-03-21', {
      method: 'PUT',
      body: {
        cigarettes: 9,
        drinks: [
          { kind: 'soju', unit: 'bottle', amount: 1 },
          { kind: 'wine', unit: 'glass', amount: 1 },
        ],
      },
    });
    assert.equal(status, 500);
  });
  await withApi(pool, async (call) => {
    const day = (await call('/api/habits/1990-03-21')).data as unknown as Day;
    assert.deepEqual(day.record, {
      date: '1990-03-21',
      cigarettes: 2,
      drinks: [{ kind: 'beer', unit: 'can', amount: 1 }],
    });
  });
});

test('the database refuses rows the API would never write', { skip }, async (t) => {
  t.after(clean);
  await assert.rejects(pool.query("INSERT INTO habit_days (record_date) VALUES ('1990-03-22')"));
  await assert.rejects(
    pool.query("INSERT INTO habit_days (record_date, cigarettes) VALUES ('1990-03-22', 201)"),
  );
  await pool.query(
    "INSERT INTO habit_days (record_date, drinks_recorded) VALUES ('1990-03-22', true)",
  );
  for (const values of ["'sake', 'glass', 1", "'soju', 'shot', 1", "'soju', 'glass', 0"]) {
    await assert.rejects(
      pool.query(
        `INSERT INTO habit_drinks (record_date, position, kind, unit, amount) VALUES ('1990-03-22', 0, ${values})`,
      ),
      values,
    );
  }
  // Drinks only belong to a day whose drinking was recorded.
  await pool.query("INSERT INTO habit_days (record_date, cigarettes) VALUES ('1990-03-23', 1)");
  await assert.rejects(
    pool.query(
      "INSERT INTO habit_drinks (record_date, position, kind, unit, amount) VALUES ('1990-03-23', 0, 'soju', 'glass', 1)",
    ),
  );
  await pool.query(
    "INSERT INTO habit_drinks (record_date, position, kind, unit, amount) VALUES ('1990-03-22', 0, 'soju', 'glass', 1)",
  );
  // A day that still has drinks cannot be marked "not recorded".
  await assert.rejects(
    pool.query(
      "UPDATE habit_days SET drinks_recorded = false, cigarettes = 0 WHERE record_date = '1990-03-22'",
    ),
  );
});

test(
  'two saves of one day at the same time both succeed, and one of them wins whole',
  { skip },
  async (t) => {
    t.after(clean);
    const a = { cigarettes: 1, drinks: [{ kind: 'soju', unit: 'bottle', amount: 1 }] };
    const b = {
      cigarettes: 2,
      drinks: [
        { kind: 'beer', unit: 'can', amount: 2 },
        { kind: 'wine', unit: 'glass', amount: 1 },
      ],
    };
    await withApi(pool, async (call) => {
      // From smoking only, and from drinks already there.
      for (const start of [{ cigarettes: 5 }, a]) {
        await put(call, '1990-03-27', start);
        for (let round = 0; round < 5; round += 1) {
          const results = await Promise.all([
            call('/api/habits/1990-03-27', { method: 'PUT', body: a }),
            call('/api/habits/1990-03-27', { method: 'PUT', body: b }),
          ]);
          assert.deepEqual(
            results.map(({ status }) => status),
            [200, 200],
            JSON.stringify(results.map(({ data }) => data)),
          );
          const { record } = (await call('/api/habits/1990-03-27')).data as unknown as Day;
          const won = [a, b].find((body) => body.cigarettes === record?.cigarettes);
          assert.deepEqual(record?.drinks, won?.drinks);
        }
      }
    });
  },
);
