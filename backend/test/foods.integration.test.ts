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

const prefix = 'integration-test-';
const base = { servingSize: 100, servingUnit: 'g' };

let pool: Pool;

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await pool.query('DELETE FROM foods WHERE name LIKE $1', [`${prefix}%`]);
});

after(async () => {
  if (skip) return;
  await pool.query('DELETE FROM foods WHERE name LIKE $1', [`${prefix}%`]);
  await pool.end();
});

// The statement docs/food-data.md gives for researched data.
const importFood = (name: string, calories: number, checkedOn: string) =>
  pool.query(
    `INSERT INTO foods (name, brand, serving_size, serving_unit, calories, source_type, source_url, checked_on)
     VALUES ($1, 'integration-brand', 100, 'g', $2, 'official', 'https://example.com/menu', $3)
     ON CONFLICT (name, COALESCE(brand, '')) DO UPDATE SET
       calories = EXCLUDED.calories,
       source_type = EXCLUDED.source_type,
       source_url = EXCLUDED.source_url,
       checked_on = EXCLUDED.checked_on,
       updated_at = now()
     WHERE foods.checked_on IS NULL OR EXCLUDED.checked_on > foods.checked_on`,
    [name, calories, checkedOn],
  );

const countAndCalories = async (name: string) => {
  const { rows } = await pool.query<{ calories: string }>(
    'SELECT calories FROM foods WHERE name = $1',
    [name],
  );
  return { count: rows.length, calories: rows[0] ? Number(rows[0].calories) : null };
};

test('importing the same researched data twice leaves one food', { skip }, async () => {
  const name = `${prefix}import-twice`;
  await importFood(name, 500, '2026-10-31');
  await importFood(name, 500, '2026-10-31');
  assert.deepEqual(await countAndCalories(name), { count: 1, calories: 500 });
});

test('only newer research replaces a food, so a re-run keeps later edits', { skip }, async () => {
  const name = `${prefix}newer-only`;
  await importFood(name, 500, '2026-10-31');
  await pool.query('UPDATE foods SET calories = 510 WHERE name = $1', [name]);

  await importFood(name, 500, '2026-10-31');
  assert.equal((await countAndCalories(name)).calories, 510);

  await importFood(name, 520, '2026-11-30');
  assert.equal((await countAndCalories(name)).calories, 520);
});

test('an unknown nutrient stays "no value" and a known zero stays zero', { skip }, async () => {
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/foods', {
      method: 'POST',
      body: { ...base, name: `${prefix}unknown`, calories: 0 },
    });
    assert.equal(status, 201);
    assert.equal(data.calories, 0);
    assert.equal(data.sodium, null);

    const { rows } = await pool.query<{ calories: string; sodium: string | null }>(
      'SELECT calories, sodium FROM foods WHERE id = $1',
      [data.id],
    );
    assert.equal(Number(rows[0]!.calories), 0);
    assert.equal(rows[0]!.sodium, null);
  });
});

test('the same name and brand conflict, while another brand does not', { skip }, async () => {
  await withApi(pool, async (call) => {
    const food = { ...base, name: `${prefix}duplicate`, brand: 'A' };
    assert.equal((await call('/api/foods', { method: 'POST', body: food })).status, 201);

    const again = await call('/api/foods', { method: 'POST', body: food });
    assert.equal(again.status, 409);
    assert.equal(again.data.error, '이미 등록된 항목입니다');

    const other = await call('/api/foods', { method: 'POST', body: { ...food, brand: 'B' } });
    assert.equal(other.status, 201);

    const noBrand = { ...base, name: `${prefix}no-brand` };
    assert.equal((await call('/api/foods', { method: 'POST', body: noBrand })).status, 201);
    assert.equal((await call('/api/foods', { method: 'POST', body: noBrand })).status, 409);
  });
});

test('search matches name and brand and treats % as a character', { skip }, async () => {
  await withApi(pool, async (call) => {
    const add = (body: object) => call('/api/foods', { method: 'POST', body });
    await add({ ...base, name: `${prefix}search-100%-grain` });
    await add({ ...base, name: `${prefix}search-plain`, brand: `${prefix}brand-match` });

    const names = async (q: string) => {
      const { data } = await call(`/api/foods?q=${encodeURIComponent(q)}`);
      return (data.foods as { name: string }[]).map((food) => food.name);
    };
    assert.deepEqual(await names(`${prefix}search-100%`), [`${prefix}search-100%-grain`]);
    assert.deepEqual(await names(`${prefix}search-1_0`), []);
    assert.deepEqual(await names(`${prefix}brand-match`), [`${prefix}search-plain`]);
  });
});

test('editing replaces the food and returns numbers, not strings', { skip }, async () => {
  await withApi(pool, async (call) => {
    const created = await call('/api/foods', {
      method: 'POST',
      body: { ...base, name: `${prefix}edit`, calories: 100.5 },
    });
    assert.equal(created.data.calories, 100.5);
    assert.equal(created.data.servingSize, 100);

    const edited = await call(`/api/foods/${String(created.data.id)}`, {
      method: 'PUT',
      body: {
        ...base,
        name: `${prefix}edit`,
        protein: 12.25,
        sourceType: 'official',
        sourceUrl: 'https://example.com/menu',
        checkedOn: '2026-10-31',
      },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.calories, null);
    assert.equal(edited.data.protein, 12.25);
    assert.equal(edited.data.checkedOn, '2026-10-31');
  });
});

test('the database itself refuses negative nutrients', { skip }, async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO foods (name, serving_size, serving_unit, calories) VALUES ($1, 1, 'g', -1)`,
      [`${prefix}negative`],
    ),
    { code: '23514' },
  );
});
