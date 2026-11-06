import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record.
const date = '1985-06-10';
const foodName = '#92 글자 수 확인용 음식';

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM day_checks WHERE record_date = $1', [date]);
  await pool.query('DELETE FROM body_records WHERE record_date = $1', [date]);
  await pool.query(
    'DELETE FROM meal_combos WHERE id IN (SELECT combo_id FROM meal_combo_items i JOIN foods f ON f.id = i.food_id WHERE f.name = $1)',
    [foodName],
  );
  await pool.query('DELETE FROM foods WHERE name = $1', [foodName]);
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

// An emoji is two UTF-16 units but one character for the database's char_length.
const emoji = (count: number) => '🍙'.repeat(count);

test('a memo of as many emoji as the limit says is saved whole', { skip }, async () => {
  await withApi(pool, async (call) => {
    const check = await call(`/api/checks/${date}`, { method: 'PUT', body: { memo: emoji(200) } });
    assert.equal(check.status, 200, JSON.stringify(check.data));
    assert.equal((check.data.record as { memo: string }).memo, emoji(200));

    const body = await call(`/api/body/${date}`, { method: 'PUT', body: { memo: emoji(500) } });
    assert.equal(body.status, 200, JSON.stringify(body.data));
    assert.equal(body.data.memo, emoji(500));
  });
});

test('a combo name of 50 emoji is saved whole', { skip }, async () => {
  await withApi(pool, async (call) => {
    const food = await call('/api/foods', {
      method: 'POST',
      body: { name: foodName, servingSize: 1, servingUnit: 'g' },
    });
    assert.equal(food.status, 201, JSON.stringify(food.data));
    const combo = await call('/api/combos', {
      method: 'POST',
      body: { name: emoji(50), items: [{ foodId: food.data.id, servings: 1 }] },
    });
    assert.equal(combo.status, 201, JSON.stringify(combo.data));
    assert.equal(combo.data.name, emoji(50));
  });
});
