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

const prefix = 'meal-test-';
// Far from any real record; each test keeps to its own day.
const days = [
  '1991-01-01',
  '1991-01-02',
  '1991-01-03',
  '1991-01-04',
  '1991-01-05',
  '1991-01-06',
  '1991-01-07',
  '1991-01-08',
];

type Total = { value: number | null; missing: number };
type Day = {
  entries: Record<string, unknown>[];
  totals: Record<string, Total>;
};

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM meal_entries WHERE entry_date = ANY($1)', [days]);
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

const addFood = async (name: string, nutrients: Record<string, number> = {}, brand?: string) => {
  let id = 0;
  await withApi(pool, async (call) => {
    const { data } = await call('/api/foods', {
      method: 'POST',
      body: { name: `${prefix}${name}`, brand, servingSize: 100, servingUnit: 'g', ...nutrients },
    });
    id = Number(data.id);
  });
  return id;
};

test('a day with nothing eaten has no totals rather than zero', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call(`/api/meals/${days[0]}`);
    const day = data as unknown as Day;
    assert.equal(status, 200);
    assert.deepEqual(day.entries, []);
    assert.deepEqual(day.totals.calories, { value: null, missing: 0 });
  });
});

test('1.5 servings count exactly in calories and every nutrient', { skip }, async () => {
  const foodId = await addFood('ratio', {
    calories: 123.45,
    carbs: 10.1,
    protein: 20,
    fat: 0.33,
    sugars: 1.1,
    sodium: 500,
  });
  await withApi(pool, async (call) => {
    const { status, data } = await call(`/api/meals/${days[1]}`, {
      method: 'POST',
      body: { meal: 'lunch', servings: 1.5, foodId },
    });
    const day = data as unknown as Day;
    assert.equal(status, 201);
    assert.equal(day.entries[0]!.servings, 1.5);
    assert.equal(day.entries[0]!.name, `${prefix}ratio`);
    assert.equal(day.entries[0]!.calories, 185.18);
    assert.deepEqual(day.totals.calories, { value: 185.18, missing: 0 });
    assert.deepEqual(day.totals.carbs, { value: 15.15, missing: 0 });
    assert.deepEqual(day.totals.protein, { value: 30, missing: 0 });
    assert.deepEqual(day.totals.fat, { value: 0.5, missing: 0 });
    assert.deepEqual(day.totals.sugars, { value: 1.65, missing: 0 });
    assert.deepEqual(day.totals.sodium, { value: 750, missing: 0 });
  });
});

test('editing a food later leaves past days as they were', { skip }, async () => {
  const foodId = await addFood('edited', { calories: 200, protein: 10 }, 'snapshot-brand');
  await withApi(pool, async (call) => {
    await call(`/api/meals/${days[2]}`, {
      method: 'POST',
      body: { meal: 'dinner', servings: 2, foodId },
    });
    const edited = await call(`/api/foods/${foodId}`, {
      method: 'PUT',
      body: { name: `${prefix}renamed`, servingSize: 50, servingUnit: 'ml', calories: 999 },
    });
    assert.equal(edited.status, 200);

    const { data } = await call(`/api/meals/${days[2]}`);
    const day = data as unknown as Day;
    assert.equal(day.entries[0]!.name, `${prefix}edited`);
    assert.equal(day.entries[0]!.brand, 'snapshot-brand');
    assert.equal(day.entries[0]!.foodId, foodId);
    assert.equal(day.entries[0]!.servingSize, 100);
    assert.equal(day.entries[0]!.servingUnit, 'g');
    assert.deepEqual(day.totals.calories, { value: 400, missing: 0 });
    assert.deepEqual(day.totals.protein, { value: 20, missing: 0 });
  });
});

test('an unknown nutrient is counted as missing, and a known zero is not', { skip }, async () => {
  const known = await addFood('known', { calories: 100, sodium: 0 });
  await withApi(pool, async (call) => {
    await call(`/api/meals/${days[3]}`, {
      method: 'POST',
      body: { meal: 'breakfast', servings: 1, foodId: known },
    });
    const { data } = await call(`/api/meals/${days[3]}`, {
      method: 'POST',
      body: { meal: 'snack', servings: 2, name: '떡볶이', calories: 480 },
    });
    const day = data as unknown as Day;
    assert.equal(day.entries.length, 2);
    assert.equal(day.entries[1]!.foodId, null);
    assert.equal(day.entries[1]!.calories, 960);
    assert.deepEqual(day.totals.calories, { value: 1060, missing: 0 });
    assert.deepEqual(day.totals.sodium, { value: 0, missing: 1 });
    assert.deepEqual(day.totals.protein, { value: null, missing: 2 });
  });
});

test('the totals add up the rows as shown, in the order recorded', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = `/api/meals/${days[6]}`;
    let day = {} as Day;
    for (const name of ['첫째', '둘째', '셋째']) {
      const { data } = await call(path, {
        method: 'POST',
        body: { meal: 'snack', servings: 1.5, name, calories: 83.33 },
      });
      day = data as unknown as Day;
    }
    assert.deepEqual(
      day.entries.map((entry) => [entry.name, entry.calories]),
      [
        ['첫째', 125],
        ['둘째', 125],
        ['셋째', 125],
      ],
    );
    assert.deepEqual(day.totals.calories, { value: 375, missing: 0 });
  });
});

test('removing a food keeps what was eaten', { skip }, async () => {
  const foodId = await addFood('removed', { calories: 100 });
  await withApi(pool, async (call) => {
    const path = `/api/meals/${days[7]}`;
    await call(path, { method: 'POST', body: { meal: 'lunch', servings: 1, foodId } });
    await pool.query('DELETE FROM foods WHERE id = $1', [foodId]);
    const day = (await call(path)).data as unknown as Day;
    assert.equal(day.entries[0]!.foodId, null);
    assert.equal(day.entries[0]!.name, `${prefix}removed`);
    assert.deepEqual(day.totals.calories, { value: 100, missing: 0 });
  });
});

test('a food that does not exist is a 404 and records nothing', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call(`/api/meals/${days[4]}`, {
      method: 'POST',
      body: { meal: 'lunch', servings: 1, foodId: 999_999_999 },
    });
    assert.equal(status, 404);
    assert.equal(data.error, '음식을 찾을 수 없습니다');
    assert.deepEqual(((await call(`/api/meals/${days[4]}`)).data as unknown as Day).entries, []);
  });
});

test('deleting removes an entry from the totals; only on its own day', { skip }, async () => {
  await withApi(pool, async (call) => {
    const path = `/api/meals/${days[5]}`;
    const added = await call(path, {
      method: 'POST',
      body: { meal: 'lunch', servings: 1, name: '김밥', calories: 300 },
    });
    const id = Number((added.data as unknown as Day).entries[0]!.id);

    const wrongDay = await call(`/api/meals/${days[0]}/entries/${id}`, { method: 'DELETE' });
    assert.equal(wrongDay.status, 404);

    const removed = await call(`${path}/entries/${id}`, { method: 'DELETE' });
    const day = removed.data as unknown as Day;
    assert.equal(removed.status, 200);
    assert.deepEqual(day.entries, []);
    assert.deepEqual(day.totals.calories, { value: null, missing: 0 });

    const again = await call(`${path}/entries/${id}`, { method: 'DELETE' });
    assert.equal(again.status, 404);
    assert.equal(again.data.error, '식사 기록을 찾을 수 없습니다');
  });
});

test('the database itself refuses a quantity of zero', { skip }, async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO meal_entries (entry_date, meal, servings, name)
       VALUES ($1, 'lunch', 0, 'x')`,
      [days[0]],
    ),
    { code: '23514' },
  );
});
