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

const prefix = 'combo-test-';
// Far from any real record and from the days other test files use; each test keeps to its own day.
const days = ['1992-01-01', '1992-01-02', '1992-01-03', '1992-01-04'];
// A food with this name makes recording fail partway through (see the all-or-nothing test).
const failingName = `${prefix}fails-on-record`;
const trigger = 'combo_test_fail_on_record';

type Total = { value: number | null; missing: number };
type Day = { entries: Record<string, unknown>[]; totals: Record<string, Total> };
type Combo = {
  id: number;
  name: string;
  items: Record<string, unknown>[];
  calories: Total;
};

let pool: Pool;

const dropTrigger = async () => {
  await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON meal_entries`);
  await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
};

const clean = async () => {
  await dropTrigger();
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

const addFood = async (name: string, nutrients: Record<string, number> = {}) => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein, sodium)
     VALUES ($1, 'test-brand', 100, 'g', $2, $3, $4) RETURNING id`,
    [
      name.startsWith(prefix) ? name : `${prefix}${name}`,
      nutrients.calories ?? null,
      nutrients.protein ?? null,
      nutrients.sodium ?? null,
    ],
  );
  return Number(rows[0]!.id);
};

const comboBody = (name: string, items: [number, number][]) => ({
  name: `${prefix}${name}`,
  items: items.map(([foodId, servings]) => ({ foodId, servings })),
});

test('a combo lists its foods in order with the calories they add up to', { skip }, async () => {
  const rice = await addFood('rice', { calories: 123.45, protein: 2 });
  const soup = await addFood('soup', { calories: 80 });
  const water = await addFood('water');
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/combos', {
      method: 'POST',
      body: comboBody('lunch-set', [
        [soup, 2],
        [rice, 1.5],
        [water, 1],
      ]),
    });
    const combo = data as unknown as Combo;
    assert.equal(status, 201);
    assert.equal(combo.name, `${prefix}lunch-set`);
    assert.deepEqual(
      combo.items.map((item) => [item.foodId, item.servings, item.calories]),
      [
        [soup, 2, 160],
        [rice, 1.5, 185.18],
        [water, 1, null],
      ],
    );
    assert.equal(combo.items[0]!.brand, 'test-brand');
    assert.equal(combo.items[0]!.servingUnit, 'g');
    assert.deepEqual(combo.calories, { value: 345.18, missing: 1 });

    const listed = ((await call('/api/combos')).data.combos as Combo[]).find(
      (item) => item.id === combo.id,
    );
    assert.deepEqual(listed, combo);
  });
});

test('two combos cannot share a name, whatever the case', { skip }, async () => {
  const food = await addFood('dup-food', { calories: 10 });
  await withApi(pool, async (call) => {
    const first = await call('/api/combos', {
      method: 'POST',
      body: comboBody('Same', [[food, 1]]),
    });
    assert.equal(first.status, 201);
    const second = await call('/api/combos', {
      method: 'POST',
      body: comboBody('same', [[food, 1]]),
    });
    assert.equal(second.status, 409);
    assert.equal(second.data.error, '같은 이름의 조합이 이미 있습니다');
  });
});

test('a food that does not exist saves no part of the combo', { skip }, async () => {
  const food = await addFood('real', { calories: 10 });
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/combos', {
      method: 'POST',
      body: comboBody('with-missing', [
        [food, 1],
        [999_999_999, 1],
      ]),
    });
    assert.equal(status, 400);
    assert.equal(data.error, '찾을 수 없는 음식이 있습니다');
    const { rowCount } = await pool.query('SELECT 1 FROM meal_combos WHERE name = $1', [
      `${prefix}with-missing`,
    ]);
    assert.equal(rowCount, 0);
  });
});

test('recording a combo adds every food to the chosen meal in order', { skip }, async () => {
  const rice = await addFood('record-rice', { calories: 300, protein: 6 });
  const egg = await addFood('record-egg', { calories: 70, protein: 6, sodium: 60 });
  await withApi(pool, async (call) => {
    const combo = (
      await call('/api/combos', {
        method: 'POST',
        body: comboBody('record', [
          [rice, 1],
          [egg, 2],
        ]),
      })
    ).data as unknown as Combo;
    const { status, data } = await call(`/api/meals/${days[0]}/combos/${combo.id}`, {
      method: 'POST',
      body: { meal: 'breakfast' },
    });
    const day = data as unknown as Day;
    assert.equal(status, 201);
    assert.deepEqual(
      day.entries.map((entry) => [entry.meal, entry.foodId, entry.servings, entry.calories]),
      [
        ['breakfast', rice, 1, 300],
        ['breakfast', egg, 2, 140],
      ],
    );
    assert.deepEqual(day.totals.calories, { value: 440, missing: 0 });
    assert.deepEqual(day.totals.protein, { value: 18, missing: 0 });
    assert.deepEqual(day.totals.sodium, { value: 120, missing: 1 });
  });
});

test(
  'changing the combo or its foods later leaves recorded meals as they were',
  { skip },
  async () => {
    const rice = await addFood('later-rice', { calories: 300 });
    const egg = await addFood('later-egg', { calories: 70 });
    await withApi(pool, async (call) => {
      const combo = (
        await call('/api/combos', {
          method: 'POST',
          body: comboBody('later', [[rice, 1]]),
        })
      ).data as unknown as Combo;
      const path = `/api/meals/${days[1]}`;
      await call(`${path}/combos/${combo.id}`, { method: 'POST', body: { meal: 'lunch' } });
      const recorded = ((await call(path)).data as unknown as Day).entries;

      const edited = await call(`/api/combos/${combo.id}`, {
        method: 'PUT',
        body: comboBody('later-edited', [
          [egg, 3],
          [rice, 2],
        ]),
      });
      assert.equal(edited.status, 200);
      assert.deepEqual(
        (edited.data as unknown as Combo).items.map((item) => [item.foodId, item.servings]),
        [
          [egg, 3],
          [rice, 2],
        ],
      );
      assert.equal((edited.data as unknown as Combo).name, `${prefix}later-edited`);
      await pool.query('UPDATE foods SET calories = 999, name = $2 WHERE id = $1', [
        rice,
        `${prefix}later-renamed`,
      ]);
      const deleted = await call(`/api/combos/${combo.id}`, { method: 'DELETE' });
      assert.equal(deleted.status, 204);

      const later = (await call(path)).data as unknown as Day;
      assert.deepEqual(later.entries, recorded);
      assert.equal(later.entries[0]!.name, `${prefix}later-rice`);
      assert.deepEqual(later.totals.calories, { value: 300, missing: 0 });
    });
  },
);

test('if one food fails to record, none of the combo is recorded', { skip }, async () => {
  const ok = await addFood('atomic-ok', { calories: 100 });
  const failing = await addFood(failingName, { calories: 100 });
  // Fails the second insert of the statement, after the first food went in.
  await pool.query(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION 'combo test failure'; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON meal_entries FOR EACH ROW
     WHEN (NEW.name = '${failingName}') EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    await withApi(pool, async (call) => {
      const combo = (
        await call('/api/combos', {
          method: 'POST',
          body: comboBody('atomic', [
            [ok, 1],
            [failing, 1],
          ]),
        })
      ).data as unknown as Combo;
      const path = `/api/meals/${days[2]}`;
      const { status } = await call(`${path}/combos/${combo.id}`, {
        method: 'POST',
        body: { meal: 'dinner' },
      });
      assert.equal(status, 500);
      assert.deepEqual(((await call(path)).data as unknown as Day).entries, []);
    });
  } finally {
    await dropTrigger();
  }
});

test(
  'a missing combo is a 404, and one whose foods are gone records nothing',
  { skip },
  async () => {
    const food = await addFood('vanishing', { calories: 50 });
    await withApi(pool, async (call) => {
      const path = `/api/meals/${days[3]}`;
      const missing = await call(`${path}/combos/999999999`, {
        method: 'POST',
        body: { meal: 'snack' },
      });
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, '조합을 찾을 수 없습니다');

      const combo = (
        await call('/api/combos', {
          method: 'POST',
          body: comboBody('vanishing', [[food, 1]]),
        })
      ).data as unknown as Combo;
      await pool.query('DELETE FROM foods WHERE id = $1', [food]);
      const listed = ((await call('/api/combos')).data.combos as Combo[]).find(
        (item) => item.id === combo.id,
      );
      assert.deepEqual(listed?.items, []);
      assert.deepEqual(listed?.calories, { value: null, missing: 0 });

      const empty = await call(`${path}/combos/${combo.id}`, {
        method: 'POST',
        body: { meal: 'snack' },
      });
      assert.equal(empty.status, 400);
      assert.equal(empty.data.error, '조합에 음식이 없습니다');
      assert.deepEqual(((await call(path)).data as unknown as Day).entries, []);
    });
  },
);

test('editing or deleting a combo that is not there is a 404', { skip }, async () => {
  const food = await addFood('nowhere', { calories: 1 });
  await withApi(pool, async (call) => {
    const edited = await call('/api/combos/999999999', {
      method: 'PUT',
      body: comboBody('nowhere', [[food, 1]]),
    });
    assert.equal(edited.status, 404);
    assert.equal(edited.data.error, '조합을 찾을 수 없습니다');
    const deleted = await call('/api/combos/999999999', { method: 'DELETE' });
    assert.equal(deleted.status, 404);
    assert.equal(deleted.data.error, '조합을 찾을 수 없습니다');
  });
});

test('a failed edit keeps the combo as it was', { skip }, async () => {
  const food = await addFood('kept', { calories: 10 });
  await withApi(pool, async (call) => {
    const combo = (
      await call('/api/combos', { method: 'POST', body: comboBody('kept', [[food, 2]]) })
    ).data as unknown as Combo;
    const edited = await call(`/api/combos/${combo.id}`, {
      method: 'PUT',
      body: comboBody('kept-renamed', [[999_999_999, 1]]),
    });
    assert.equal(edited.status, 400);
    const listed = ((await call('/api/combos')).data.combos as Combo[]).find(
      (item) => item.id === combo.id,
    );
    assert.deepEqual(listed, combo);
  });
});
