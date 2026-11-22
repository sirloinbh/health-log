import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { listenForFetch, testDatabaseSkip } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// #196: the three meal adding routes answer a retried request once. Far from any real record and
// from the days other test files use.
const days = ['1974-03-01', '1974-03-02', '1974-03-03', '1974-03-04'];
const prefix = 'retry-test-';

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM meal_entries WHERE entry_date = ANY($1)', [days]);
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

type Answer = { status: number; data: Record<string, unknown> };

/** Sends each POST with the given Idempotency-Key (none when undefined). */
const withRetryApi = async (
  run: (post: (path: string, body: unknown, key?: string) => Promise<Answer>) => Promise<void>,
) => {
  const { server, port } = await listenForFetch(createApp(pool));
  try {
    await run(async (path, body, key) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key === undefined ? {} : { 'idempotency-key': key }),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()) as Answer['data'] };
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const entriesOn = async (date: string) => {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*) FROM meal_entries WHERE entry_date = $1',
    [date],
  );
  return Number(rows[0]!.count);
};

const addFood = async (name: string, calories: number) => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO foods (name, serving_size, serving_unit, calories)
     VALUES ($1, 100, 'g', $2) RETURNING id`,
    [`${prefix}${name}`, calories],
  );
  return Number(rows[0]!.id);
};

test(
  'a typed entry sent twice with one key is recorded once and answered the same',
  { skip },
  async (t) => {
    t.after(clean);
    const date = days[0];
    const body = { meal: 'lunch', servings: 1, name: `${prefix}rice`, calories: 300 };
    await withRetryApi(async (post) => {
      const key = randomUUID();
      const first = await post(`/api/meals/${date}`, body, key);
      const again = await post(`/api/meals/${date}`, body, key);
      assert.equal(first.status, 201);
      assert.equal(again.status, 201);
      assert.deepEqual(again.data, first.data);
      assert.equal(await entriesOn(date), 1);

      // A new action has a new key and adds again; no key at all behaves as before.
      assert.equal((await post(`/api/meals/${date}`, body, randomUUID())).status, 201);
      assert.equal((await post(`/api/meals/${date}`, body)).status, 201);
      assert.equal(await entriesOn(date), 3);
    });
  },
);

test('a combo added twice with one key adds its foods once', { skip }, async (t) => {
  t.after(clean);
  const date = days[1];
  const rice = await addFood('combo-rice', 300);
  const soup = await addFood('combo-soup', 120);
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO meal_combos (name) VALUES ($1) RETURNING id',
    [`${prefix}set`],
  );
  const comboId = Number(rows[0]!.id);
  await pool.query(
    `INSERT INTO meal_combo_items (combo_id, position, food_id, servings)
     VALUES ($1, 1, $2, 1), ($1, 2, $3, 2)`,
    [comboId, rice, soup],
  );
  await withRetryApi(async (post) => {
    const key = randomUUID();
    const first = await post(`/api/meals/${date}/combos/${comboId}`, { meal: 'dinner' }, key);
    const again = await post(`/api/meals/${date}/combos/${comboId}`, { meal: 'dinner' }, key);
    assert.equal(first.status, 201);
    assert.deepEqual(again, first);
    assert.equal(await entriesOn(date), 2);
  });
});

test('a meal copied twice with one key is copied once', { skip }, async (t) => {
  t.after(clean);
  const from = days[0];
  const to = days[3];
  await pool.query(
    `INSERT INTO meal_entries (entry_date, meal, name, servings, calories)
     VALUES ($1, 'breakfast', $2, 1, 100), ($1, 'breakfast', $3, 1, 200)`,
    [from, `${prefix}toast`, `${prefix}milk`],
  );
  await withRetryApi(async (post) => {
    const key = randomUUID();
    const body = { from, meal: 'breakfast' };
    const first = await post(`/api/meals/${to}/copy`, body, key);
    const again = await post(`/api/meals/${to}/copy`, body, key);
    assert.equal(first.status, 201);
    assert.deepEqual(again, first);
    assert.equal(await entriesOn(to), 2);
  });
});

test('one key used for a different request is refused and adds nothing', { skip }, async (t) => {
  t.after(clean);
  const date = days[2];
  const body = { meal: 'snack', servings: 1, name: `${prefix}apple`, calories: 80 };
  await withRetryApi(async (post) => {
    const key = randomUUID();
    assert.equal((await post(`/api/meals/${date}`, body, key)).status, 201);
    const other = await post(`/api/meals/${date}`, { ...body, servings: 2 }, key);
    assert.equal(other.status, 409);
    assert.equal(other.data.error, 'This request key was already used for a different request');
    const elsewhere = await post(`/api/meals/${days[0]}`, body, key);
    assert.equal(elsewhere.status, 409);
    assert.equal(await entriesOn(date), 1);
    assert.equal(await entriesOn(days[0]), 0);
  });
});

test('a refused first request stores no key, so its retry runs again', { skip }, async (t) => {
  t.after(clean);
  const date = days[2];
  await withRetryApi(async (post) => {
    const key = randomUUID();
    const missing = { meal: 'lunch', servings: 1, foodId: 2_000_000_000 };
    assert.equal((await post(`/api/meals/${date}`, missing, key)).status, 404);
    assert.equal((await post(`/api/meals/${date}`, missing, key)).status, 404);
    const { rows } = await pool.query('SELECT 1 FROM meal_request_keys WHERE key = $1', [key]);
    assert.equal(rows.length, 0);
  });
});

test('two requests with one key at the same moment add the entry once', { skip }, async (t) => {
  t.after(clean);
  const date = days[3];
  const body = { meal: 'lunch', servings: 1, name: `${prefix}noodles`, calories: 500 };
  await withRetryApi(async (post) => {
    const key = randomUUID();
    const answers = await Promise.all([
      post(`/api/meals/${date}`, body, key),
      post(`/api/meals/${date}`, body, key),
    ]);
    assert.deepEqual(
      answers.map((answer) => answer.status),
      [201, 201],
    );
    assert.deepEqual(answers[1]!.data, answers[0]!.data);
    assert.equal(await entriesOn(date), 1);
  });
});
