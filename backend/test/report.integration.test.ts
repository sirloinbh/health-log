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

// Far from any real record, and from the years other test files clean up, since files run in
// parallel. 1979 has the same calendar as 1990: 1979-04-01 is a Sunday; the week of 04-02 runs to 04-08.
const first = '1979-02-01';
const last = '1979-05-31';

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM sleep_records WHERE sleep_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM meal_entries WHERE entry_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM habit_days WHERE record_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM day_checks WHERE record_date BETWEEN $1 AND $2', [first, last]);
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

// Wake at 07:00 Seoul time on `date`, after `minutes` of sleep.
const sleep = (date: string, minutes: number) =>
  pool.query(
    `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes)
     VALUES ($1, ($1::date + time '07:00') AT TIME ZONE 'Asia/Seoul' - make_interval(mins => $2),
       ($1::date + time '07:00') AT TIME ZONE 'Asia/Seoul', $2)`,
    [date, minutes],
  );

const meal = (date: string, calories: number | null, servings = 1) =>
  pool.query(
    `INSERT INTO meal_entries (entry_date, meal, name, servings, calories)
     VALUES ($1, 'lunch', 'integration-meal', $2, $3)`,
    [date, servings, calories],
  );

const habit = async (date: string, cigarettes: number | null, drinks: number | null) => {
  await pool.query(
    'INSERT INTO habit_days (record_date, cigarettes, drinks_recorded) VALUES ($1, $2, $3)',
    [date, cigarettes, drinks !== null],
  );
  for (let position = 0; position < (drinks ?? 0); position += 1) {
    await pool.query(
      `INSERT INTO habit_drinks (record_date, position, kind, unit, amount)
       VALUES ($1, $2, $3, 'glass', 1)`,
      [date, position, ['soju', 'beer', 'wine'][position]],
    );
  }
};

const check = (date: string, dietKept: boolean | null, sleepGood: boolean | null) =>
  pool.query('INSERT INTO day_checks (record_date, diet_kept, sleep_good) VALUES ($1, $2, $3)', [
    date,
    dietKept,
    sleepGood,
  ]);

type Summary = {
  from: string;
  to: string;
  sleep: { days: number; averageMinutes: number | null };
  calories: { days: number; incompleteDays: number; average: number | null };
  drinking: { days: number; drinkingDays: number };
  smoking: { days: number; cigarettes: number | null; averagePerDay: number | null };
  diet: { days: number; yes: number };
  sleepGood: { days: number; yes: number };
};
type Night = { nights: number; averageMinutes: number | null };
type Report = {
  period: string;
  current: Summary;
  previous: Summary;
  days: {
    date: string;
    sleepMinutes: number | null;
    calories: number | null;
    drank: boolean | null;
  }[];
  sleepAfterDrinking: { afterDrinking: Night; afterNoDrinking: Night };
};

const report = async (
  call: Parameters<Parameters<typeof withApi>[1]>[0],
  period: string,
  date: string,
) => {
  const { status, data } = await call(`/api/report?period=${period}&date=${date}`);
  assert.equal(status, 200, JSON.stringify(data));
  return data as unknown as Report;
};

test(
  'a period with nothing recorded has no averages, and every day is a gap',
  { skip },
  async () => {
    await withApi(pool, async (call) => {
      const empty = await report(call, 'week', '1979-02-14');
      assert.deepEqual([empty.current.from, empty.current.to], ['1979-02-12', '1979-02-18']);
      assert.deepEqual(empty.current.sleep, { days: 0, averageMinutes: null });
      assert.deepEqual(empty.current.calories, { days: 0, incompleteDays: 0, average: null });
      assert.deepEqual(empty.current.smoking, { days: 0, cigarettes: null, averagePerDay: null });
      assert.equal(empty.days.length, 7);
      assert.ok(
        empty.days.every(
          (day) => day.sleepMinutes === null && day.calories === null && day.drank === null,
        ),
      );
    });
  },
);

test('averages are over the days with a record, not over the whole period', { skip }, async (t) => {
  t.after(clean);
  // Monday and Wednesday only, in the week of 1979-04-02.
  await sleep('1979-04-02', 420);
  await sleep('1979-04-04', 480);
  await meal('1979-04-02', 500);
  await meal('1979-04-02', 250, 2);
  await meal('1979-04-04', 1500);
  // A day with an entry of unknown calories is counted apart, not averaged as a low day.
  await meal('1979-04-05', 300);
  await meal('1979-04-05', null);
  await habit('1979-04-02', 10, 1);
  await habit('1979-04-03', 0, 0);
  await habit('1979-04-05', null, 2);
  await check('1979-04-02', true, null);
  await check('1979-04-03', false, true);
  // A memo alone answers neither check.
  await pool.query("INSERT INTO day_checks (record_date, memo) VALUES ('1979-04-04', 'x')");

  await withApi(pool, async (call) => {
    const week = (await report(call, 'week', '1979-04-05')).current;
    assert.deepEqual(week.sleep, { days: 2, averageMinutes: 450 });
    assert.deepEqual(week.calories, { days: 2, incompleteDays: 1, average: 1250 });
    assert.deepEqual(week.drinking, { days: 3, drinkingDays: 2 });
    assert.deepEqual(week.smoking, { days: 2, cigarettes: 10, averagePerDay: 5 });
    assert.deepEqual(week.diet, { days: 2, yes: 1 });
    assert.deepEqual(week.sleepGood, { days: 1, yes: 1 });

    const { days } = await report(call, 'week', '1979-04-05');
    assert.deepEqual(days.slice(0, 4), [
      { date: '1979-04-02', sleepMinutes: 420, calories: 1000, drank: true },
      { date: '1979-04-03', sleepMinutes: null, calories: null, drank: false },
      { date: '1979-04-04', sleepMinutes: 480, calories: 1500, drank: null },
      // Unknown calories leave the day's total unknown, not 300.
      { date: '1979-04-05', sleepMinutes: null, calories: null, drank: true },
    ]);
  });
});

test(
  'weeks and months end on Seoul calendar days, and the previous period sits right before',
  { skip },
  async (t) => {
    t.after(clean);
    // Sunday 04-01 closes the week of 03-26; Monday 04-02 opens the next. 03-31 ends March.
    await sleep('1979-03-31', 300);
    await sleep('1979-04-01', 360);
    await sleep('1979-04-02', 600);
    await sleep('1979-04-30', 420);
    await sleep('1979-05-01', 540);

    await withApi(pool, async (call) => {
      const sunday = await report(call, 'week', '1979-04-01');
      assert.deepEqual([sunday.current.from, sunday.current.to], ['1979-03-26', '1979-04-01']);
      assert.deepEqual(sunday.current.sleep, { days: 2, averageMinutes: 330 });
      assert.deepEqual([sunday.previous.from, sunday.previous.to], ['1979-03-19', '1979-03-25']);
      assert.equal(sunday.previous.sleep.days, 0);

      const monday = await report(call, 'week', '1979-04-02');
      assert.deepEqual(monday.current.sleep, { days: 1, averageMinutes: 600 });
      assert.deepEqual(monday.previous.sleep, { days: 2, averageMinutes: 330 });

      const april = await report(call, 'month', '1979-04-15');
      assert.deepEqual([april.current.from, april.current.to], ['1979-04-01', '1979-04-30']);
      assert.deepEqual(april.current.sleep, { days: 3, averageMinutes: 460 });
      assert.deepEqual([april.previous.from, april.previous.to], ['1979-03-01', '1979-03-31']);
      assert.deepEqual(april.previous.sleep, { days: 1, averageMinutes: 300 });
      assert.equal(april.days.length, 30);
    });
  },
);

test(
  'sleep after drinking compares the next night, with the number of nights in each group',
  { skip },
  async (t) => {
    t.after(clean);
    // Drank on 04-02 and 04-04, recorded not drinking on 04-03; 04-05 unrecorded.
    await habit('1979-04-02', null, 1);
    await habit('1979-04-03', null, 0);
    await habit('1979-04-04', null, 2);
    await sleep('1979-04-03', 360); // after drinking on 04-02
    await sleep('1979-04-04', 480); // after not drinking on 04-03
    await sleep('1979-04-05', 300); // after drinking on 04-04
    await sleep('1979-04-06', 540); // after an unrecorded day: left out
    // Drinking on Sunday 04-08 is in the week; its night is dated Monday 04-09.
    await habit('1979-04-08', null, 1);
    await sleep('1979-04-09', 420);
    // Drinking on the Sunday before belongs to the week before, even though its night is dated
    // Monday 04-02, the first day of this week.
    await habit('1979-04-01', null, 1);
    await sleep('1979-04-02', 100);

    await withApi(pool, async (call) => {
      const { sleepAfterDrinking } = await report(call, 'week', '1979-04-04');
      assert.deepEqual(sleepAfterDrinking, {
        afterDrinking: { nights: 3, averageMinutes: 360 },
        afterNoDrinking: { nights: 1, averageMinutes: 480 },
      });
    });
  },
);

test('the previous period is summed the same way as the current one', { skip }, async (t) => {
  t.after(clean);
  // The week before the week of 1979-04-02.
  await meal('1979-03-27', 1200);
  await meal('1979-03-28', 800);
  await meal('1979-03-29', null);
  await habit('1979-03-27', 4, 1);
  await habit('1979-03-28', 2, 0);
  await check('1979-03-27', true, false);
  await check('1979-03-28', false, null);

  await withApi(pool, async (call) => {
    const { previous } = await report(call, 'week', '1979-04-04');
    assert.deepEqual([previous.from, previous.to], ['1979-03-26', '1979-04-01']);
    assert.deepEqual(previous.calories, { days: 2, incompleteDays: 1, average: 1000 });
    assert.deepEqual(previous.drinking, { days: 2, drinkingDays: 1 });
    assert.deepEqual(previous.smoking, { days: 2, cigarettes: 6, averagePerDay: 3 });
    assert.deepEqual(previous.diet, { days: 2, yes: 1 });
    assert.deepEqual(previous.sleepGood, { days: 1, yes: 0 });
  });
});
