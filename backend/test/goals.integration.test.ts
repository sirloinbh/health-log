import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// 1981 is used by no other test file. 1981-03-02 and 03-09 are Mondays.
const first = '1981-01-01';
const last = '1981-12-31';

let pool: Pool;

const clean = async () => {
  // Goals hold from their date onwards, so none from this file may outlive it.
  await pool.query('DELETE FROM goals WHERE effective_from BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM meal_entries WHERE entry_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM sleep_records WHERE sleep_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM habit_days WHERE record_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM day_checks WHERE record_date BETWEEN $1 AND $2', [first, last]);
};

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await clean();
  // A goal from before this file's year would judge its days too.
  const { rows } = await pool.query('SELECT 1 FROM goals WHERE effective_from < $1', [first]);
  assert.equal(rows.length, 0, 'goals older than 1981 in health_test would change these results');
});

after(async () => {
  if (skip) return;
  await clean();
  await pool.end();
});

type Goal = { from: string; target: number } | null;
type Item = { item: string; goal: Goal; status: string | null; actual: Record<string, unknown> };
type Day = {
  date: string;
  items: Item[];
  checks: { dietKept: boolean | null; sleepGood: boolean | null } | null;
};
type Goals = {
  today: string;
  week: { from: string; to: string };
  current: Record<string, Goal>;
  history: { item: string; from: string; target: number | null }[];
};
type Call = Parameters<Parameters<typeof withApi>[1]>[0];

const setGoal = async (call: Call, item: string, from: string, target: number | null) => {
  const { status, data } = await call(`/api/goals/${item}`, {
    method: 'PUT',
    body: { from, target },
  });
  assert.equal(status, 200, JSON.stringify(data));
  return data as unknown as Goals;
};

const day = async (call: Call, date: string) => {
  const { status, data } = await call(`/api/goals/days/${date}`);
  assert.equal(status, 200, JSON.stringify(data));
  return data as unknown as Day;
};

const itemOf = (value: Day, item: string) => {
  const found = value.items.find((entry) => entry.item === item);
  assert.ok(found, item);
  return found;
};

const eat = (date: string, calories: number | null, protein: number | null, servings = 1) =>
  pool.query(
    `INSERT INTO meal_entries (entry_date, meal, name, servings, calories, protein)
     VALUES ($1, 'lunch', '테스트 음식', $2, $3, $4)`,
    [date, servings, calories, protein],
  );

const sleep = (date: string, minutes: number) => {
  // Up at 07:00 Seoul time on the day.
  const wakeAt = new Date(`${date}T07:00:00+09:00`);
  const bedAt = new Date(wakeAt.getTime() - minutes * 60_000);
  return pool.query(
    `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes)
     VALUES ($1, $2, $3, $4)`,
    [date, bedAt.toISOString(), wakeAt.toISOString(), minutes],
  );
};

const drinks = async (date: string, drank: boolean) => {
  await pool.query('INSERT INTO habit_days (record_date, drinks_recorded) VALUES ($1, true)', [
    date,
  ]);
  if (drank) {
    await pool.query(
      `INSERT INTO habit_drinks (record_date, position, kind, unit, amount)
       VALUES ($1, 0, 'soju', 'glass', 2)`,
      [date],
    );
  }
};

test('a changed goal leaves past days judged by the goal they had', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await setGoal(call, 'calories', '1981-03-01', 2000);
    await setGoal(call, 'calories', '1981-03-10', 1800);
    await eat('1981-03-05', 1900, null);
    await eat('1981-03-12', 1900, null);

    const before = itemOf(await day(call, '1981-03-05'), 'calories');
    assert.deepEqual(before.goal, { from: '1981-03-01', target: 2000 });
    assert.equal(before.status, 'met');
    const after = itemOf(await day(call, '1981-03-12'), 'calories');
    assert.deepEqual(after.goal, { from: '1981-03-10', target: 1800 });
    assert.equal(after.status, 'missed');
    // The day a change starts already answers to it.
    assert.equal(itemOf(await day(call, '1981-03-10'), 'calories').goal?.target, 1800);
  });
});

test('a day without records is "none", not missed, for every goal', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await setGoal(call, 'calories', '1981-04-01', 2000);
    await setGoal(call, 'protein', '1981-04-01', 100);
    await setGoal(call, 'sleep', '1981-04-01', 420);
    await setGoal(call, 'sober_days', '1981-04-01', 5);
    const empty = await day(call, '1981-04-08');
    assert.deepEqual(
      empty.items.map(({ item, status }) => [item, status]),
      [
        ['calories', 'none'],
        ['protein', 'none'],
        ['sleep', 'none'],
        ['sober_days', 'none'],
      ],
    );
    assert.equal(empty.checks, null);
  });
});

test('no goal set, or one turned off, judges nothing', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await eat('1981-05-04', 2500, 30);
    const unset = itemOf(await day(call, '1981-05-04'), 'calories');
    assert.equal(unset.goal, null);
    assert.equal(unset.status, null);
    // The record is still there to show.
    assert.deepEqual(unset.actual, { entries: 1, total: 2500, missing: 0 });

    await setGoal(call, 'calories', '1981-05-01', 2000);
    await setGoal(call, 'calories', '1981-05-04', null);
    assert.equal(itemOf(await day(call, '1981-05-04'), 'calories').status, null);
    // Turning it off later leaves the days before still judged.
    await eat('1981-05-02', 2500, null);
    assert.equal(itemOf(await day(call, '1981-05-02'), 'calories').status, 'missed');
  });
});

test('meal totals are counted per serving, and protein is a floor', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await setGoal(call, 'protein', '1981-06-01', 100);
    await eat('1981-06-02', 300, 40, 2);
    await eat('1981-06-02', 200, 20);
    const met = itemOf(await day(call, '1981-06-02'), 'protein');
    assert.deepEqual(met.actual, { entries: 2, total: 100, missing: 0 });
    assert.equal(met.status, 'met');

    // An entry with unknown protein leaves a short day undecided.
    await eat('1981-06-03', 300, 40);
    await eat('1981-06-03', 300, null);
    const open = itemOf(await day(call, '1981-06-03'), 'protein');
    assert.deepEqual(open.actual, { entries: 2, total: 40, missing: 1 });
    assert.equal(open.status, 'unknown');
  });
});

test('sleep is judged by the night filed under the day', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await setGoal(call, 'sleep', '1981-07-01', 420);
    await sleep('1981-07-02', 420);
    await sleep('1981-07-03', 419);
    const enough = itemOf(await day(call, '1981-07-02'), 'sleep');
    assert.deepEqual(enough.actual, { minutes: 420 });
    assert.equal(enough.status, 'met');
    assert.equal(itemOf(await day(call, '1981-07-03'), 'sleep').status, 'missed');
  });
});

test('sober days count over the Monday-to-Sunday week', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    // From Wednesday: the week of 03-02 still answers to it, as its Sunday is past the change.
    await setGoal(call, 'sober_days', '1981-03-04', 5);
    await drinks('1981-03-02', true);
    await drinks('1981-03-03', false);
    // The next Monday belongs to another week.
    await drinks('1981-03-09', true);

    const monday = itemOf(await day(call, '1981-03-02'), 'sober_days');
    assert.deepEqual(monday.goal, { from: '1981-03-04', target: 5 });
    assert.deepEqual(monday.actual, {
      from: '1981-03-02',
      to: '1981-03-08',
      recordedDays: 2,
      soberDays: 1,
    });
    assert.equal(monday.status, 'unknown');

    await drinks('1981-03-04', true);
    // Two drinking days still leave five.
    assert.equal(itemOf(await day(call, '1981-03-08'), 'sober_days').status, 'unknown');
    await drinks('1981-03-05', true);
    // Three drinking days out of seven leave at most four sober.
    assert.equal(itemOf(await day(call, '1981-03-08'), 'sober_days').status, 'missed');
    // A day whose drinking was not recorded is not sober.
    await pool.query("INSERT INTO habit_days (record_date, cigarettes) VALUES ('1981-03-10', 0)");
    const next = itemOf(await day(call, '1981-03-10'), 'sober_days');
    assert.deepEqual([next.actual.recordedDays, next.actual.soberDays], [1, 0]);
  });
});

test('the day answers with its own checks beside the verdicts', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await pool.query(
      "INSERT INTO day_checks (record_date, diet_kept, sleep_good) VALUES ('1981-08-03', false, NULL)",
    );
    assert.deepEqual((await day(call, '1981-08-03')).checks, { dietKept: false, sleepGood: null });
  });
});

test(
  'goals list the current ones and every change, and one change can be removed',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(
      pool,
      async (call) => {
        await setGoal(call, 'sleep', '1981-09-01', 420);
        await setGoal(call, 'sleep', '1981-09-20', 480);
        // A start date after today is kept but not current yet.
        const goals = await setGoal(call, 'sleep', '1981-10-01', 400);
        assert.equal(goals.today, '1981-09-25');
        assert.deepEqual(goals.current.sleep, { from: '1981-09-20', target: 480 });
        assert.equal(goals.current.calories, null);
        assert.deepEqual(
          goals.history
            .filter((goal) => goal.item === 'sleep' && goal.from.startsWith('1981'))
            .map((goal) => goal.from),
          ['1981-10-01', '1981-09-20', '1981-09-01'],
        );
        // Setting the same start date again replaces that change only.
        const replaced = await setGoal(call, 'sleep', '1981-09-20', 450);
        assert.deepEqual(replaced.current.sleep, { from: '1981-09-20', target: 450 });
        assert.equal(
          replaced.history.filter((goal) => goal.item === 'sleep' && goal.from.startsWith('1981'))
            .length,
          3,
        );

        assert.equal((await call('/api/goals/sleep/1981-09-20', { method: 'DELETE' })).status, 204);
        const { data } = await call('/api/goals');
        assert.deepEqual((data as unknown as Goals).current.sleep, {
          from: '1981-09-01',
          target: 420,
        });
        assert.equal((await call('/api/goals/sleep/1981-09-20', { method: 'DELETE' })).status, 404);
      },
      { today: () => '1981-09-25' },
    );
  },
);

test('the current sober goal is the one this week is judged by', { skip }, async (t) => {
  t.after(clean);
  // Wednesday 1981-03-04; its week runs 03-02 to 03-08.
  await withApi(
    pool,
    async (call) => {
      await setGoal(call, 'sober_days', '1981-03-01', 5);
      await setGoal(call, 'calories', '1981-03-01', 2000);
      // Both changed from Friday of the same week.
      await setGoal(call, 'calories', '1981-03-06', 1800);
      const goals = await setGoal(call, 'sober_days', '1981-03-06', 6);
      assert.deepEqual(goals.week, { from: '1981-03-02', to: '1981-03-08' });
      // A daily goal from Friday is not today's yet; a weekly one already judges this week.
      assert.deepEqual(goals.current.calories, { from: '1981-03-01', target: 2000 });
      assert.deepEqual(goals.current.sober_days, { from: '1981-03-06', target: 6 });
      // The daily page judges today's week by the same number.
      const today = itemOf(await day(call, '1981-03-04'), 'sober_days');
      assert.deepEqual(today.goal, goals.current.sober_days);
      // A change from next Monday is still to come.
      const next = await setGoal(call, 'sober_days', '1981-03-09', 7);
      assert.deepEqual(next.current.sober_days, { from: '1981-03-06', target: 6 });
    },
    { today: () => '1981-03-04' },
  );
});

test('the database refuses goals the API would never write', { skip }, async (t) => {
  t.after(clean);
  const insert = (item: string, target: number | null) =>
    pool.query("INSERT INTO goals (item, effective_from, target) VALUES ($1, '1981-11-01', $2)", [
      item,
      target,
    ]);
  await assert.rejects(insert('water', 1));
  await assert.rejects(insert('calories', 99));
  await assert.rejects(insert('protein', 1001));
  await assert.rejects(insert('sleep', 59));
  await assert.rejects(insert('sober_days', 0));
  await assert.rejects(insert('sober_days', 8));
  await insert('sober_days', null);
});
