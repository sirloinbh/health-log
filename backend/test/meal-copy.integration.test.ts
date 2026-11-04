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

const prefix = 'copy-test-';
// Far from any real record and from the days other test files use.
const days = Array.from(
  { length: 10 },
  (_, index) => `1993-01-${String(index + 1).padStart(2, '0')}`,
);
// An entry with this name fails to be copied (see the all-or-nothing test).
const failingName = `${prefix}fails-on-copy`;
const trigger = 'copy_test_fail_on_copy';

type Total = { value: number | null; missing: number };
type Entry = Record<string, unknown> & { id: number; meal: string; name: string };
type Day = { entries: Entry[]; totals: Record<string, Total> };

let pool: Pool;

const dropTrigger = async () => {
  await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON meal_entries`);
  await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
};

const clean = async () => {
  await dropTrigger();
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

const addFood = async (name: string, calories: number, protein: number | null) => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein)
     VALUES ($1, 'test-brand', 100, 'g', $2, $3) RETURNING id`,
    [`${prefix}${name}`, calories, protein],
  );
  return Number(rows[0]!.id);
};

/** Everything an entry says about what was eaten, without its own id. */
const eaten = ({ id: _id, ...rest }: Entry) => rest;

test('a copied meal carries the values it was recorded with, in order', { skip }, async () => {
  const [from, to] = [days[0]!, days[1]!];
  const rice = await addFood('rice', 123.45, 2.5);
  await withApi(pool, async (call) => {
    await call(`/api/meals/${from}`, {
      method: 'POST',
      body: { meal: 'lunch', servings: 1.5, foodId: rice },
    });
    await call(`/api/meals/${from}`, {
      method: 'POST',
      body: { meal: 'lunch', servings: 2, name: `${prefix}typed soup`, calories: 80 },
    });
    // Another meal of the same day stays where it is.
    await call(`/api/meals/${from}`, {
      method: 'POST',
      body: { meal: 'dinner', servings: 1, name: `${prefix}dinner`, calories: 500 },
    });
    // The food changes after the meal was recorded; the copy keeps the recorded values.
    await pool.query('UPDATE foods SET calories = 999, protein = NULL WHERE id = $1', [rice]);
    // The day already has something; the copy adds to it.
    await call(`/api/meals/${to}`, {
      method: 'POST',
      body: { meal: 'lunch', servings: 1, name: `${prefix}already there`, calories: 10 },
    });
    const source = (await call(`/api/meals/${from}`)).data as unknown as Day;

    const { status, data } = await call(`/api/meals/${to}/copy`, {
      method: 'POST',
      body: { from, meal: 'lunch' },
    });
    const copied = data as unknown as Day;
    assert.equal(status, 201);
    assert.deepEqual(
      copied.entries.map((entry) => entry.name),
      [`${prefix}already there`, `${prefix}rice`, `${prefix}typed soup`],
    );
    assert.deepEqual(
      copied.entries.slice(1).map(eaten),
      source.entries.filter((entry) => entry.meal === 'lunch').map(eaten),
    );
    assert.equal(copied.entries[1]!.calories, 185.18);
    assert.equal(copied.entries[1]!.protein, 3.75);
    assert.equal(copied.entries[1]!.foodId, rice);
    assert.deepEqual(copied.totals.calories, { value: 355.18, missing: 0 });
    assert.deepEqual(copied.totals.protein, { value: 3.75, missing: 2 });
    // A second read gives the same day: the answer was the stored state.
    assert.deepEqual((await call(`/api/meals/${to}`)).data, data);
  });
});

test('deleting the original later leaves the copy as it was', { skip }, async () => {
  const [from, to] = [days[2]!, days[3]!];
  const egg = await addFood('egg', 70, 6);
  await withApi(pool, async (call) => {
    const recorded = (
      await call(`/api/meals/${from}`, {
        method: 'POST',
        body: { meal: 'breakfast', servings: 2, foodId: egg },
      })
    ).data as unknown as Day;
    const copied = (
      await call(`/api/meals/${to}/copy`, {
        method: 'POST',
        body: { from, meal: 'breakfast' },
      })
    ).data as unknown as Day;

    const original = recorded.entries[0]!;
    assert.equal(
      (await call(`/api/meals/${from}/entries/${original.id}`, { method: 'DELETE' })).status,
      200,
    );
    await pool.query('DELETE FROM foods WHERE id = $1', [egg]);

    const later = (await call(`/api/meals/${to}`)).data as unknown as Day;
    assert.equal(later.entries.length, 1);
    // The food is gone, so the link is cleared; what was eaten stays.
    assert.deepEqual(eaten(later.entries[0]!), { ...eaten(copied.entries[0]!), foodId: null });
    assert.equal(later.entries[0]!.calories, 140);
  });
});

test('if one entry fails to copy, none of the meal is copied', { skip }, async () => {
  const [from, to] = [days[4]!, days[5]!];
  await withApi(pool, async (call) => {
    for (const name of [`${prefix}first`, failingName]) {
      await call(`/api/meals/${from}`, {
        method: 'POST',
        body: { meal: 'dinner', servings: 1, name, calories: 100 },
      });
    }
    // Fails the second insert of the copy, after the first entry went in.
    await pool.query(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'copy test failure'; END $$`,
    );
    await pool.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON meal_entries FOR EACH ROW
       WHEN (NEW.name = '${failingName}' AND NEW.entry_date = '${to}')
       EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      const { status, data } = await call(`/api/meals/${to}/copy`, {
        method: 'POST',
        body: { from, meal: 'dinner' },
      });
      assert.equal(status, 500);
      assert.equal(data.error, '서버 오류가 발생했습니다');
    } finally {
      await dropTrigger();
    }
    const day = (await call(`/api/meals/${to}`)).data as unknown as Day;
    assert.deepEqual(day.entries, []);
  });
});

test('a meal with nothing recorded has nothing to copy', { skip }, async () => {
  const [from, to] = [days[6]!, days[7]!];
  await withApi(pool, async (call) => {
    // Something on the day, but not in the chosen meal.
    await call(`/api/meals/${from}`, {
      method: 'POST',
      body: { meal: 'snack', servings: 1, name: `${prefix}snack`, calories: 100 },
    });
    const { status, data } = await call(`/api/meals/${to}/copy`, {
      method: 'POST',
      body: { from, meal: 'breakfast' },
    });
    assert.equal(status, 404);
    assert.equal(data.error, '복사할 기록이 없습니다');
    assert.deepEqual(((await call(`/api/meals/${to}`)).data as unknown as Day).entries, []);
  });
});
