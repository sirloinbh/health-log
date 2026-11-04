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

const prefix = 'recent-test-';
// Far from any real record and from the days other test files use.
const days = ['1994-01-01', '1994-01-02', '1994-01-03'];

type Food = { id: number; name: string; calories: number | null };

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

const addFood = async (name: string, calories: number) => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO foods (name, serving_size, serving_unit, calories) VALUES ($1, 100, 'g', $2)
     RETURNING id`,
    [`${prefix}${name}`, calories],
  );
  return Number(rows[0]!.id);
};

// The list covers every food in the database, and other test files record meals at the same time.
// Only this file's foods are compared. Pushing them out of the ten would take more than seven other
// foods recorded in the moment between the last record and the read.
const ours = (foods: Food[]) => foods.filter((food) => food.name.startsWith(prefix));

test('each food shows once, by when it was last recorded', { skip }, async () => {
  const rice = await addFood('rice', 300);
  const soup = await addFood('soup', 80);
  const egg = await addFood('egg', 70);
  await withApi(pool, async (call) => {
    const record = (date: string, foodId: number) =>
      call(`/api/meals/${date}`, { method: 'POST', body: { meal: 'lunch', servings: 1, foodId } });
    // Rice twice; the later of the two counts. A past day recorded now is still recent.
    await record(days[1]!, rice);
    await record(days[1]!, soup);
    await record(days[1]!, egg);
    await record(days[0]!, rice);
    // Typed in, so not a stored food.
    await call(`/api/meals/${days[1]}`, {
      method: 'POST',
      body: { meal: 'snack', servings: 1, name: `${prefix}typed`, calories: 10 },
    });
    // The food changed after it was recorded; the list offers what the store says now.
    await pool.query('UPDATE foods SET calories = 320 WHERE id = $1', [rice]);

    const { status, data } = await call('/api/foods/recent');
    assert.equal(status, 200);
    const foods = data.foods as Food[];
    assert.ok(foods.length <= 10);
    assert.equal(new Set(foods.map((food) => food.id)).size, foods.length);
    assert.deepEqual(
      ours(foods).map((food) => [food.id, food.calories]),
      [
        [rice, 320],
        [egg, 70],
        [soup, 80],
      ],
    );
  });
});

test('a food removed from the store no longer shows', { skip }, async () => {
  const gone = await addFood('gone', 50);
  const kept = await addFood('kept', 60);
  await withApi(pool, async (call) => {
    for (const foodId of [kept, gone]) {
      await call(`/api/meals/${days[2]}`, {
        method: 'POST',
        body: { meal: 'dinner', servings: 1, foodId },
      });
    }
    await pool.query('DELETE FROM foods WHERE id = $1', [gone]);
    const foods = (await call('/api/foods/recent')).data.foods as Food[];
    assert.ok(ours(foods).some((food) => food.id === kept));
    assert.ok(!foods.some((food) => food.id === gone));
  });
});
