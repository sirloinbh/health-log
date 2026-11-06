import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// #38. Far from any real record and from the years other test files use. Each test keeps to its own
// month, so the weekly and monthly counts of one never include another's entries.
const prefix = 'junk-test-';
const first = '1983-01-01';
const last = '1983-12-31';

type Period = {
  from: string;
  to: string;
  times: number;
  days: number;
  calories: { value: number | null; missing: number };
};
type Day = {
  entries: { name: string; isJunk: boolean; calories: number | null }[];
  junk: { week: Period; month: Period };
};
type Call = Parameters<Parameters<typeof withApi>[1]>[0];

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM meal_entries WHERE entry_date BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM meal_combos WHERE name LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM foods WHERE name LIKE $1', [`${prefix}%`]);
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

const food = (name: string, isJunk: boolean | undefined, calories: number | null = 500) => ({
  name: `${prefix}${name}`,
  servingSize: 1,
  servingUnit: '개',
  calories,
  ...(isJunk === undefined ? {} : { isJunk }),
});

const addFood = async (
  call: Call,
  name: string,
  isJunk: boolean | undefined,
  calories?: number | null,
) => {
  const { status, data } = await call('/api/foods', {
    method: 'POST',
    body: food(name, isJunk, calories),
  });
  assert.equal(status, 201);
  return data as unknown as { id: number; isJunk: boolean };
};

const record = async (call: Call, date: string, body: object) => {
  const { status, data } = await call(`/api/meals/${date}`, { method: 'POST', body });
  assert.equal(status, 201, JSON.stringify(data));
  return data as unknown as Day;
};

const read = async (call: Call, date: string) =>
  (await call(`/api/meals/${date}`)).data as unknown as Day;

const counts = ({ times, days, calories }: Period) => ({ times, days, calories: calories.value });

test(
  'the same day twice counts two times on one day, and only marked food counts',
  { skip },
  async () => {
    await withApi(pool, async (call) => {
      const burger = await addFood(call, 'burger', true);
      const salad = await addFood(call, 'salad', undefined, 150);
      assert.equal(burger.isJunk, true);
      assert.equal(salad.isJunk, false, 'a food left unmarked is not junk food');

      const before = await read(call, '1983-01-10');
      assert.deepEqual(counts(before.junk.week), { times: 0, days: 0, calories: null });
      assert.deepEqual(before.junk.week, {
        ...before.junk.week,
        from: '1983-01-10',
        to: '1983-01-16',
      });

      await record(call, '1983-01-10', { meal: 'lunch', servings: 1, foodId: burger.id });
      // Servings change the amount, not how many times.
      await record(call, '1983-01-10', { meal: 'dinner', servings: 1.5, foodId: burger.id });
      await record(call, '1983-01-10', { meal: 'dinner', servings: 1, foodId: salad.id });
      // Typed-in food carries its own mark, and is not junk food unless marked.
      await record(call, '1983-01-12', {
        meal: 'snack',
        servings: 2,
        name: `${prefix}chips`,
        calories: 300,
        isJunk: true,
      });
      const day = await record(call, '1983-01-12', {
        meal: 'snack',
        servings: 1,
        name: `${prefix}apple`,
        calories: 90,
      });

      assert.deepEqual(counts(day.junk.week), { times: 3, days: 2, calories: 500 + 750 + 600 });
      assert.deepEqual(counts(day.junk.month), { times: 3, days: 2, calories: 1850 });
      assert.deepEqual(
        day.entries.map(({ isJunk }) => isJunk),
        [true, false],
      );
      const tenth = await read(call, '1983-01-10');
      assert.deepEqual(
        tenth.entries.map(({ isJunk }) => isJunk),
        [true, true, false],
      );
      assert.deepEqual(counts(tenth.junk.week), counts(day.junk.week));
    });
  },
);

test(
  'changing a food mark later keeps past days as recorded and applies to new ones',
  { skip },
  async () => {
    await withApi(pool, async (call) => {
      const pizza = await addFood(call, 'pizza', true);
      const ramen = await addFood(call, 'ramen', false);
      await record(call, '1983-04-11', { meal: 'lunch', servings: 1, foodId: pizza.id });
      await record(call, '1983-04-11', { meal: 'dinner', servings: 1, foodId: ramen.id });

      const unmark = await call(`/api/foods/${pizza.id}`, {
        method: 'PUT',
        body: food('pizza', false),
      });
      assert.equal(unmark.data.isJunk, false);
      const mark = await call(`/api/foods/${ramen.id}`, {
        method: 'PUT',
        body: food('ramen', true),
      });
      assert.equal(mark.data.isJunk, true);
      // An edit that leaves the mark out keeps it.
      const kept = await call(`/api/foods/${ramen.id}`, {
        method: 'PUT',
        body: food('ramen', undefined),
      });
      assert.equal(kept.data.isJunk, true);

      const past = await read(call, '1983-04-11');
      assert.deepEqual(
        past.entries.map(({ isJunk }) => isJunk),
        [true, false],
        'entries keep the mark they were recorded with',
      );
      assert.deepEqual(counts(past.junk.month), { times: 1, days: 1, calories: 500 });

      await record(call, '1983-04-12', { meal: 'lunch', servings: 1, foodId: pizza.id });
      const now = await record(call, '1983-04-12', {
        meal: 'dinner',
        servings: 1,
        foodId: ramen.id,
      });
      assert.deepEqual(
        now.entries.map(({ isJunk }) => isJunk),
        [false, true],
      );
      assert.deepEqual(counts(now.junk.month), { times: 2, days: 2, calories: 1000 });
    });
  },
);

test('weeks run Monday to Sunday and months stop at their last day', { skip }, async () => {
  await withApi(pool, async (call) => {
    const fries = await addFood(call, 'fries', true, 300);
    // Sunday of one week, then Monday and Tuesday of the next; Tuesday is the first of March.
    for (const date of ['1983-02-27', '1983-02-28', '1983-03-01'])
      await record(call, date, { meal: 'snack', servings: 1, foodId: fries.id });

    const march = await read(call, '1983-03-01');
    assert.deepEqual(
      { from: march.junk.week.from, to: march.junk.week.to, ...counts(march.junk.week) },
      { from: '1983-02-28', to: '1983-03-06', times: 2, days: 2, calories: 600 },
    );
    assert.deepEqual(
      { from: march.junk.month.from, to: march.junk.month.to, ...counts(march.junk.month) },
      { from: '1983-03-01', to: '1983-03-31', times: 1, days: 1, calories: 300 },
    );
    const february = await read(call, '1983-02-27');
    assert.deepEqual(
      { from: february.junk.week.from, ...counts(february.junk.week) },
      { from: '1983-02-21', times: 1, days: 1, calories: 300 },
    );
    assert.deepEqual(
      { to: february.junk.month.to, ...counts(february.junk.month) },
      { to: '1983-02-28', times: 2, days: 2, calories: 600 },
    );
  });
});

test('a combo and a copied meal carry the marks as recorded', { skip }, async () => {
  await withApi(pool, async (call) => {
    const cola = await addFood(call, 'cola', true, 140);
    const rice = await addFood(call, 'rice', false, 300);
    const combo = await call('/api/combos', {
      method: 'POST',
      body: {
        name: `${prefix}set`,
        items: [
          { foodId: cola.id, servings: 2 },
          { foodId: rice.id, servings: 1 },
        ],
      },
    });
    assert.equal(combo.status, 201);
    const recorded = await call(`/api/meals/1983-05-09/combos/${combo.data.id}`, {
      method: 'POST',
      body: { meal: 'lunch' },
    });
    assert.equal(recorded.status, 201);
    assert.deepEqual(counts((recorded.data as unknown as Day).junk.week), {
      times: 1,
      days: 1,
      calories: 280,
    });

    // The copy takes the day's own entries, not the food's mark of today.
    await call(`/api/foods/${cola.id}`, { method: 'PUT', body: food('cola', false, 140) });
    const copied = await call('/api/meals/1983-05-10/copy', {
      method: 'POST',
      body: { from: '1983-05-09', meal: 'lunch' },
    });
    assert.equal(copied.status, 201);
    const day = copied.data as unknown as Day;
    assert.deepEqual(
      day.entries.map(({ isJunk }) => isJunk),
      [true, false],
    );
    assert.deepEqual(counts(day.junk.week), { times: 2, days: 2, calories: 560 });
  });
});

test(
  'junk food with no known calories is counted and its calories reported missing',
  { skip },
  async () => {
    await withApi(pool, async (call) => {
      const mystery = await addFood(call, 'mystery', true, null);
      const donut = await addFood(call, 'donut', true, 250);
      const only = await record(call, '1983-06-13', {
        meal: 'snack',
        servings: 1,
        foodId: mystery.id,
      });
      assert.deepEqual(only.junk.week.calories, { value: null, missing: 1 });
      assert.equal(only.junk.week.times, 1);
      const both = await record(call, '1983-06-13', {
        meal: 'snack',
        servings: 1,
        foodId: donut.id,
      });
      assert.deepEqual(both.junk.week.calories, { value: 250, missing: 1 });
      assert.deepEqual(
        { times: both.junk.week.times, days: both.junk.week.days },
        { times: 2, days: 1 },
      );
    });
  },
);

test('deleting an entry removes it from the counts', { skip }, async () => {
  await withApi(pool, async (call) => {
    const kebab = await addFood(call, 'kebab', true, 400);
    const day = await record(call, '1983-07-11', { meal: 'dinner', servings: 1, foodId: kebab.id });
    assert.equal(day.junk.week.times, 1);
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM meal_entries WHERE entry_date = $1',
      ['1983-07-11'],
    );
    const removed = await call(`/api/meals/1983-07-11/entries/${rows[0]!.id}`, {
      method: 'DELETE',
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(counts((removed.data as unknown as Day).junk.week), {
      times: 0,
      days: 0,
      calories: null,
    });
  });
});
