import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

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

// The statement docs/food-data.md tells data issues to copy, so the document itself is under test.
const documentedSql = (() => {
  const text = readFileSync(new URL('../../docs/food-data.md', import.meta.url), 'utf8');
  const sql = /```sql\r?\n([\s\S]*?)```/.exec(text)?.[1];
  if (!sql) throw new Error('docs/food-data.md has no SQL block');
  return sql;
})();

// The documented statement with its one example row replaced by this test's values.
const importFood = (name: string, calories: number, checkedOn: string) =>
  pool.query(
    documentedSql.replace(
      /VALUES[\s\S]*?ON CONFLICT/,
      `VALUES ($1, 'integration-brand', NULL, 100, 'g', $2, NULL, NULL, NULL, NULL, NULL, 'official', 'https://example.com/menu', $3, true)\nON CONFLICT`,
    ),
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

// #38. Franchise fast food is imported marked; a newer research updates the numbers, not the mark.
test('an imported food keeps the junk food mark the user changed', { skip }, async () => {
  const name = `${prefix}junk-mark`;
  const mark = async () =>
    (await pool.query<{ is_junk: boolean }>('SELECT is_junk FROM foods WHERE name = $1', [name]))
      .rows[0]?.is_junk;
  await importFood(name, 500, '2026-10-31');
  assert.equal(await mark(), true);
  await pool.query('UPDATE foods SET is_junk = false WHERE name = $1', [name]);
  await importFood(name, 520, '2026-11-30');
  assert.equal((await countAndCalories(name)).calories, 520);
  assert.equal(await mark(), false);
});

test('a re-run never overwrites a food whose date was cleared by an edit', { skip }, async () => {
  const name = `${prefix}cleared-date`;
  await importFood(name, 500, '2026-10-31');
  await pool.query(
    `UPDATE foods SET calories = 510, source_type = 'manual', source_url = NULL, checked_on = NULL
     WHERE name = $1`,
    [name],
  );
  await importFood(name, 500, '2026-10-31');
  assert.equal((await countAndCalories(name)).calories, 510);
});

test('popular foods are stored per serving with a checkable public source', { skip }, async () => {
  const { rows } = await pool.query<{ total: string; sourced: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (
              WHERE source_type = 'public'
                AND source_url LIKE 'https://various.foodsafetykorea.go.kr/%'
                AND checked_on IS NOT NULL
            ) AS sourced
     FROM foods WHERE source_url LIKE '%foodsafetykorea%'`,
  );
  assert.ok(Number(rows[0]!.total) >= 95, `${rows[0]!.total} foods`);
  assert.equal(rows[0]!.sourced, rows[0]!.total);

  // A source page with no food group once stored the next field's label as the category.
  const labels = await pool.query("SELECT name FROM foods WHERE category LIKE '%품목대표%'");
  assert.deepEqual(labels.rows, []);

  // Measured values win: the calculated record would give 590 mL with 342 mg of sodium.
  const ramen = await pool.query<{ serving_size: string; sodium: string }>(
    "SELECT serving_size, sodium FROM foods WHERE name = '라면' AND brand IS NULL",
  );
  assert.equal(Number(ramen.rows[0]!.serving_size), 550);
  assert.equal(Number(ramen.rows[0]!.sodium), 1556.5);

  // Measured records filed under another spelling: 자장면 and 돼지고기볶음(제육볶음) at the source.
  const servings = await pool.query<{ name: string; serving_size: string; serving_unit: string }>(
    "SELECT name, serving_size, serving_unit FROM foods WHERE name IN ('짜장면(자장면)', '제육볶음') AND brand IS NULL ORDER BY name",
  );
  assert.deepEqual(
    servings.rows.map((row) => [row.name, Number(row.serving_size), row.serving_unit]),
    [
      ['제육볶음', 250, 'g'],
      ['짜장면(자장면)', 650, 'g'],
    ],
  );

  // The source gives 61 kcal per 100 g and a total of 400 g; its Korean name must decode too.
  const stew = await pool.query<{ serving_size: string; serving_unit: string; calories: string }>(
    "SELECT serving_size, serving_unit, calories FROM foods WHERE name = '김치찌개' AND brand IS NULL",
  );
  assert.equal(stew.rowCount, 1);
  assert.equal(Number(stew.rows[0]!.serving_size), 400);
  assert.equal(stew.rows[0]!.serving_unit, 'g');
  assert.equal(Number(stew.rows[0]!.calories), 244);
});

test('popular foods can be found by the words people search for', { skip }, async () => {
  await withApi(pool, async (call) => {
    const expected = {
      닭가슴살: '닭가슴살(삶은것)',
      계란: '삶은 달걀(계란)',
      치킨: '닭튀김(치킨)',
      돈까스: '돈가스(돈까스)',
      콜라: '콜라',
      요거트: '플레인 요거트(요구르트)',
      찜닭: '찜닭(안동찜닭)',
      참치김밥: '참치김밥',
    };
    for (const [q, name] of Object.entries(expected)) {
      const { data } = await call(`/api/foods?q=${encodeURIComponent(q)}`);
      const names = (data.foods as { name: string }[]).map((food) => food.name);
      assert.ok(names.includes(name), `${q}: ${names.join(', ')}`);
    }
  });
});

test('the documented example runs as written and repeats safely', { skip }, async (t) => {
  // Its Korean literals must decode: the escapes spell 예시 and 브랜드.
  const example = "name = '예시' AND brand = '브랜드'";
  const clean = () => pool.query(`DELETE FROM foods WHERE ${example}`);
  await clean();
  t.after(clean);
  await pool.query(documentedSql);
  await pool.query(documentedSql);
  const { rows } = await pool.query(`SELECT calories FROM foods WHERE ${example}`);
  assert.equal(rows.length, 1);
});

test('the database refuses a claimed source without an address or date', { skip }, async () => {
  const insert = (sourceUrl: string | null, checkedOn: string | null, sourceType = 'official') =>
    pool.query(
      `INSERT INTO foods (name, serving_size, serving_unit, source_type, source_url, checked_on)
       VALUES ($1, 1, 'g', $2, $3, $4)`,
      [`${prefix}claimed`, sourceType, sourceUrl, checkedOn],
    );
  await assert.rejects(insert(null, '2026-10-31'), { code: '23514' });
  await assert.rejects(insert('https://example.com', null), { code: '23514' });
  await assert.rejects(insert(null, null, 'public'), { code: '23514' });
  await assert.rejects(insert(null, null, 'label'), { code: '23514' });
  await assert.rejects(insert('javascript:alert(1)', '2026-10-31', 'manual'), { code: '23514' });
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
    assert.deepEqual(await names(`${prefix}search-%-grain`), []);
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

test('with 150 matching foods, paging reaches every one exactly once', { skip }, async () => {
  const name = `${prefix}paging-`;
  // Names come in pairs, without and with a brand, after one food alone: in the order the 100th
  // and 101st foods are then one pair, so the page edge falls inside a name.
  for (let index = 0; index < 150; index += 1) {
    const pair = Math.floor((index + 1) / 2);
    await pool.query(
      `INSERT INTO foods (name, brand, serving_size, serving_unit) VALUES ($1, $2, 100, 'g')`,
      [`${name}${String(pair).padStart(3, '0')}`, index % 2 ? 'brand' : null],
    );
  }
  await withApi(pool, async (call) => {
    const edge = await call(`/api/foods?q=${encodeURIComponent(name)}&offset=99`);
    const [last, first] = (edge.data.foods as { name: string; brand: string | null }[]).slice(0, 2);
    assert.equal(last.name, first.name);
    assert.deepEqual([last.brand, first.brand], [null, 'brand']);

    const seen: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null) {
      const page = await call(`/api/foods?q=${encodeURIComponent(name)}&offset=${offset}`);
      assert.equal(page.status, 200);
      for (const food of page.data.foods as { name: string; brand: string | null }[]) {
        seen.push(`${food.name}/${food.brand ?? ''}`);
      }
      offset = page.data.nextOffset as number | null;
      pages += 1;
    }
    assert.equal(pages, 2);
    assert.equal(seen.length, 150);
    assert.equal(new Set(seen).size, 150);

    // Without a search word the pages cover the whole store too.
    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM foods');
    let all = 0;
    offset = 0;
    while (offset !== null) {
      const page = await call(`/api/foods?offset=${offset}`);
      all += (page.data.foods as unknown[]).length;
      offset = page.data.nextOffset as number | null;
    }
    assert.equal(all, Number(rows[0].count));
  });
});
