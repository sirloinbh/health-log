import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { inSnapshot, testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

const prefix = 'recent-test-';
// Far from any real record and from the days other test files use.
const days = ['1994-01-01', '1994-01-02', '1994-01-03'];

type Food = { id: number; name: string; calories: number | null };

let pool: Pool;

// Each test runs in a snapshot that is rolled back, so this only removes what an older version of
// this file may have left behind.
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
  await pool.end();
});

const addFood = async (db: Pool, name: string, calories: number) => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO foods (name, serving_size, serving_unit, calories) VALUES ($1, 100, 'g', $2)
     RETURNING id`,
    [`${prefix}${name}`, calories],
  );
  return Number(rows[0]!.id);
};

// The list covers every food in the database, and other test files record meals at the same time.
// Enough of them between this file's records and the read pushed its foods out of the ten (#137).
// So each test records and reads in one snapshot (inSnapshot): what others commit meanwhile is not
// in it, and the meals recorded here are its newest, so the list starts with exactly them.

test('each food shows once, by when it was last recorded', { skip }, async () => {
  await inSnapshot(pool, async (db) => {
    const rice = await addFood(db, 'rice', 300);
    const soup = await addFood(db, 'soup', 80);
    const egg = await addFood(db, 'egg', 70);
    await withApi(db, async (call) => {
      const record = (date: string, foodId: number) =>
        call(`/api/meals/${date}`, {
          method: 'POST',
          body: { meal: 'lunch', servings: 1, foodId },
        });
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
      await db.query('UPDATE foods SET calories = 320 WHERE id = $1', [rice]);

      const { status, data } = await call('/api/foods/recent');
      assert.equal(status, 200);
      const foods = data.foods as Food[];
      assert.ok(foods.length <= 10);
      assert.equal(new Set(foods.map((food) => food.id)).size, foods.length);
      assert.deepEqual(
        foods.slice(0, 3).map((food) => [food.id, food.calories]),
        [
          [rice, 320],
          [egg, 70],
          [soup, 80],
        ],
      );
    });
  });
});

test('typed-in food takes none of the ten places', { skip }, async () => {
  await inSnapshot(pool, async (db) => {
    const foodIds: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      foodIds.push(await addFood(db, `slot-${index}`, 10 + index));
    }
    await withApi(db, async (call) => {
      for (const foodId of foodIds) {
        await call(`/api/meals/${days[2]}`, {
          method: 'POST',
          body: { meal: 'breakfast', servings: 1, foodId },
        });
      }
      // The newest record of all has no food. Counted as a group of its own, it would take a place
      // and leave nine foods.
      await call(`/api/meals/${days[2]}`, {
        method: 'POST',
        body: { meal: 'snack', servings: 1, name: `${prefix}typed slot`, calories: 10 },
      });
      const foods = (await call('/api/foods/recent')).data.foods as Food[];
      // Exactly the ten just recorded, newest first: no place went to the typed-in entry.
      assert.deepEqual(
        foods.map((food) => food.id),
        [...foodIds].reverse(),
      );
    });
  });
});

test('a food removed from the store no longer shows', { skip }, async () => {
  await inSnapshot(pool, async (db) => {
    const gone = await addFood(db, 'gone', 50);
    const kept = await addFood(db, 'kept', 60);
    await withApi(db, async (call) => {
      for (const foodId of [kept, gone]) {
        await call(`/api/meals/${days[2]}`, {
          method: 'POST',
          body: { meal: 'dinner', servings: 1, foodId },
        });
      }
      await db.query('DELETE FROM foods WHERE id = $1', [gone]);
      const foods = (await call('/api/foods/recent')).data.foods as Food[];
      // The removed food was the newest; the one recorded before it now leads.
      assert.equal(foods[0]?.id, kept);
      assert.ok(!foods.some((food) => food.id === gone));
    });
  });
});
