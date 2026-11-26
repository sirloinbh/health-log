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
      `VALUES ($1, 'integration-brand', NULL, 100, 'g', $2, NULL, NULL, NULL, NULL, NULL, 'official', 'https://example.com/menu', $3, true, NULL)\nON CONFLICT`,
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
  const { rows } = await pool.query<{ total: number; sourced: number }>(
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
    "SELECT serving_size, sodium FROM foods WHERE name = 'Ramyeon (instant noodles)' AND brand IS NULL",
  );
  assert.equal(Number(ramen.rows[0]!.serving_size), 550);
  assert.equal(Number(ramen.rows[0]!.sodium), 1556.5);

  // Measured records filed under another spelling at the source: 자장면 (jajangmyeon) and 돼지고기볶음 (stir-fried pork, jeyuk-bokkeum).
  const servings = await pool.query<{ name: string; serving_size: string; serving_unit: string }>(
    "SELECT name, serving_size, serving_unit FROM foods WHERE name IN ('Jajangmyeon (black bean noodles)', 'Jeyuk-bokkeum (spicy stir-fried pork)') AND brand IS NULL ORDER BY name",
  );
  assert.deepEqual(
    servings.rows.map((row) => [row.name, Number(row.serving_size), row.serving_unit]),
    [
      ['Jajangmyeon (black bean noodles)', 650, 'g'],
      ['Jeyuk-bokkeum (spicy stir-fried pork)', 250, 'g'],
    ],
  );

  // The source gives 61 kcal per 100 g and a total of 400 g.
  const stew = await pool.query<{ serving_size: string; serving_unit: string; calories: string }>(
    "SELECT serving_size, serving_unit, calories FROM foods WHERE name = 'Kimchi stew' AND brand IS NULL",
  );
  assert.equal(stew.rowCount, 1);
  assert.equal(Number(stew.rows[0]!.serving_size), 400);
  assert.equal(stew.rows[0]!.serving_unit, 'g');
  assert.equal(Number(stew.rows[0]!.calories), 244);
});

// #31. Franchise menus: official numbers only, each with where and when they were checked.
const franchiseBrands = ["McDonald's", 'Burger King', 'Lotteria', 'KFC', "Mom's Touch"];

test(
  'franchise menus carry an official source, a date and the junk food mark',
  { skip },
  async () => {
    const { rows } = await pool.query<{
      brand: string;
      burgers: string;
      sides: string;
      drinks: string;
      unchecked: number;
    }>(
      `SELECT brand,
            count(*) FILTER (WHERE category = 'Burgers') AS burgers,
            count(*) FILTER (WHERE category = 'Sides') AS sides,
            count(*) FILTER (WHERE category = 'Drinks') AS drinks,
            count(*) FILTER (
              WHERE source_type <> 'official' OR source_url NOT LIKE 'https://%'
                OR checked_on IS NULL OR NOT is_junk
                OR carbs IS NOT NULL OR fat IS NOT NULL
                OR calories IS NULL OR protein IS NULL OR sugars IS NULL OR sodium IS NULL
            ) AS unchecked
     FROM foods WHERE brand = ANY($1) GROUP BY brand`,
      [franchiseBrands],
    );
    const byBrand = Object.fromEntries(
      rows.map((row) => [
        row.brand,
        [Number(row.burgers), Number(row.sides), Number(row.drinks), Number(row.unchecked)],
      ]),
    );
    // Burger King publishes no row for its fries and soft drinks (docs/changes/31-franchise-foods.md).
    assert.deepEqual(byBrand, {
      "McDonald's": [21, 2, 10, 0],
      'Burger King': [37, 0, 0, 0],
      Lotteria: [28, 2, 3, 0],
      KFC: [12, 2, 12, 0],
      "Mom's Touch": [29, 2, 4, 0],
    });

    // One value per brand as the source prints it, so a shifted column would show.
    const samples = await pool.query<{ brand: string; name: string; values: string }>(
      `SELECT brand, name, concat_ws('/', serving_size::float8, serving_unit, calories::float8,
              sugars::float8, protein::float8, sodium::float8) AS values
     FROM foods
     WHERE (brand, name) IN (('McDonald''s', 'Big Mac'), ('Burger King', 'Whopper'), ('Lotteria', 'Ria Bulgogi'),
                             ('KFC', 'Zinger'), ('Mom''s Touch', 'Thigh Burger'),
                             ('McDonald''s', 'Coca-Cola Medium'))
     ORDER BY brand COLLATE "C", name COLLATE "C"`,
    );
    assert.deepEqual(
      samples.rows.map((row) => `${row.brand} ${row.name} ${row.values}`),
      [
        'Burger King Whopper 286/g/706/10/30/1098',
        'KFC Zinger 225/g/553/5/33/866',
        'Lotteria Ria Bulgogi 192/g/462/11/21/880',
        // 013 wrote 'ml'; 020 writes it 'mL' like the rest of the data (#199).
        "McDonald's Big Mac 223/g/582/8/27/902",
        "McDonald's Coca-Cola Medium 425/mL/133/33/0/9",
        "Mom's Touch Thigh Burger 230/g/594/14/28/1009",
      ],
    );
  },
);

// #32. Bibigo retort soups: official, labelled for the whole package, not junk food.
test('Bibigo soups are found by name and keep their label values', { skip }, async () => {
  const { rows } = await pool.query<{ total: number; unchecked: number }>(
    `SELECT count(*) AS total,
            count(*) FILTER (
              WHERE source_type <> 'official' OR checked_on IS NULL OR is_junk
                OR source_url NOT LIKE 'https://www.cjthemarket.com/the/product/product-main?prdCd=%'
                OR calories IS NULL OR protein IS NULL OR fat IS NULL OR sodium IS NULL
            ) AS unchecked
     FROM foods WHERE brand = 'Bibigo' AND category = 'Soups and stews'`,
  );
  assert.deepEqual(rows[0], { total: 27, unchecked: 0 });

  await withApi(pool, async (call) => {
    const { data } = await call(`/api/foods?q=${encodeURIComponent('갈비탕')}`);
    const galbitang = (data.foods as Record<string, unknown>[]).find(
      (food) => food.brand === 'Bibigo',
    );
    // "Less than 4 g" on the label is not a value, so carbohydrate stays unknown.
    assert.deepEqual(
      galbitang && {
        name: galbitang.name,
        servingSize: galbitang.servingSize,
        calories: galbitang.calories,
        carbs: galbitang.carbs,
        protein: galbitang.protein,
        fat: galbitang.fat,
        sodium: galbitang.sodium,
        isJunk: galbitang.isJunk,
      },
      {
        name: 'Galbitang (beef rib soup) 400g',
        servingSize: 400,
        calories: 85,
        carbs: null,
        protein: 13,
        fat: 4.8,
        sodium: 810,
        isJunk: false,
      },
    );
  });
});

// #351: the seeded foods are English now; the old Korean text is a hidden search alias.
test('popular foods can be found by the Korean words people search for', { skip }, async () => {
  await withApi(pool, async (call) => {
    const expected = {
      닭가슴살: 'Chicken breast (boiled)',
      계란: 'Boiled egg',
      치킨: 'Fried chicken',
      돈까스: 'Pork cutlet (donkatsu)',
      콜라: 'Cola',
      요거트: 'Plain yogurt',
      찜닭: 'Andong braised chicken (jjimdak)',
      참치김밥: 'Tuna gimbap',
    };
    for (const [q, name] of Object.entries(expected)) {
      const { data } = await call(`/api/foods?q=${encodeURIComponent(q)}`);
      const names = (data.foods as { name: string }[]).map((food) => food.name);
      assert.ok(names.includes(name), `${q}: ${names.join(', ')}`);
    }
  });
});

// #199: each seeded food keeps the unit its source gives, milliliters are written one way, and the
// three solid foods the source listed in mL are in grams, with their numbers unchanged.
test('seeded serving units are corrected once and a rerun changes nothing', { skip }, async () => {
  const unitOf = async (name: string, brand: string | null) => {
    const { rows } = await pool.query<{ unit: string; size: string }>(
      `SELECT serving_unit AS unit, serving_size::text AS size FROM foods
       WHERE name = $1 AND brand IS NOT DISTINCT FROM $2`,
      [name, brand],
    );
    assert.equal(rows.length, 1, name);
    return `${Number(rows[0].size)}${rows[0].unit}`;
  };
  assert.equal(await unitOf('Tangsuyuk (sweet and sour pork)', null), '343g');
  assert.equal(await unitOf('Fried squid', null), '77g');
  assert.equal(await unitOf('Toast (sliced bread)', null), '230.3g');
  // Drinks stay as their sources give them: MFDS per 100 g, McDonald's in milliliters.
  assert.equal(await unitOf('Cola', null), '100g');
  assert.equal(await unitOf('Americano', null), '532mL');
  assert.equal(await unitOf('Coca-Cola Medium', "McDonald's"), '425mL');
  // Only researched rows: other test files add typed-in foods with their own units at the same time.
  const { rows } = await pool.query<{ lower: number; mcdonalds: number }>(
    `SELECT count(*) FILTER (WHERE serving_unit = 'ml') AS lower,
            count(*) FILTER (WHERE brand = 'McDonald''s' AND serving_unit = 'mL') AS mcdonalds
     FROM foods WHERE source_type IN ('official', 'public')`,
  );
  // No researched row is left with a lowercase 'ml', and all 10 McDonald's drinks are 'mL'.
  assert.deepEqual(
    { lower: Number(rows[0].lower), mcdonalds: Number(rows[0].mcdonalds) },
    { lower: 0, mcdonalds: 10 },
  );

  const migration = readFileSync(
    new URL('../../database/migrations/020_foods_serving_units.sql', import.meta.url),
    'utf8',
  );
  const results = (await pool.query(migration)) as unknown as { rowCount: number }[];
  assert.deepEqual(
    results.map((result) => result.rowCount),
    [0, 0],
  );
});

// #351: the rename migration keeps the Korean text only as a hidden search alias.
test(
  'seeded foods are English, the Korean text is a hidden alias, and a rerun changes nothing',
  { skip },
  async () => {
    const { rows } = await pool.query<{ korean: number; aliased: number }>(
      `SELECT count(*) FILTER (WHERE name ~ '[가-힣]' OR brand ~ '[가-힣]' OR category ~ '[가-힣]') AS korean,
            count(*) FILTER (WHERE search_alias IS NOT NULL) AS aliased
     FROM foods WHERE source_type IN ('official', 'public')`,
    );
    assert.equal(Number(rows[0]!.korean), 0);
    assert.ok(Number(rows[0]!.aliased) >= 286, `${rows[0]!.aliased} aliased`);

    await withApi(pool, async (call) => {
      for (const q of ['짜장면', '맥도날드 빅맥', '비비고 갈비탕']) {
        const { data } = await call(`/api/foods?q=${encodeURIComponent(q)}`);
        const foods = data.foods as Record<string, unknown>[];
        assert.ok(foods.length > 0, q);
        // The alias is searched but never sent, and a result shows no Korean name.
        assert.ok(
          foods.every((food) => !('searchAlias' in food) && !('search_alias' in food)),
          q,
        );
        assert.ok(
          foods.every((food) => !/[가-힣]/.test(JSON.stringify(food))),
          q,
        );
      }
      const { data } = await call(`/api/foods?q=${encodeURIComponent("McDonald's Big Mac")}`);
      assert.equal((data.foods as unknown[]).length, 1);
    });

    const migration = readFileSync(
      new URL('../../database/migrations/027_foods_english_names.sql', import.meta.url),
      'utf8',
    );
    const results = (await pool.query(migration)) as unknown as { rowCount: number }[];
    assert.equal(results.at(-2)!.rowCount, 0);
  },
);

test('a food a person added keeps its Korean text when the seed is renamed', { skip }, async () => {
  const name = `${prefix}한글`;
  await pool.query(
    `INSERT INTO foods (name, brand, category, serving_size, serving_unit) VALUES ($1, '맥도날드', '버거', 100, 'g')`,
    [name],
  );
  const migration = readFileSync(
    new URL('../../database/migrations/027_foods_english_names.sql', import.meta.url),
    'utf8',
  );
  await pool.query(migration);
  const { rows } = await pool.query<{
    brand: string;
    category: string;
    search_alias: string | null;
  }>('SELECT brand, category, search_alias FROM foods WHERE name = $1', [name]);
  assert.deepEqual(rows, [{ brand: '맥도날드', category: '버거', search_alias: null }]);
});

test('the documented example runs as written and repeats safely', { skip }, async (t) => {
  // Its Korean alias must decode: the escapes spell 브랜드 예시 ("brand example").
  const example = "name = 'Example' AND brand = 'Brand' AND search_alias = '브랜드 예시'";
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
    assert.equal(again.data.error, 'This item already exists');

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

// #198: the screens show "brand name", so typing it that way must find the food.
test('search finds a food by the brand and name as the screen shows them', { skip }, async () => {
  await withApi(pool, async (call) => {
    const add = (body: object) => call('/api/foods', { method: 'POST', body });
    assert.equal(
      (await add({ ...base, name: `${prefix}shown-bulgogi`, brand: `${prefix}shown-brand` }))
        .status,
      201,
    );
    assert.equal((await add({ ...base, name: `${prefix}shown-no-brand` })).status, 201);

    const names = async (q: string) => {
      const { data } = await call(`/api/foods?q=${encodeURIComponent(q)}`);
      return (data.foods as { name: string }[]).map((food) => food.name);
    };
    const shown = `${prefix}shown-brand ${prefix}shown-bulgogi`;
    assert.deepEqual(await names(shown), [`${prefix}shown-bulgogi`]);
    // The end of the brand and the start of the name, across the space, as typed mid-word.
    assert.deepEqual(await names(`shown-brand ${prefix}shown-bul`), [`${prefix}shown-bulgogi`]);
    // Upper case still matches, the name alone and the brand alone still match.
    assert.deepEqual(await names(shown.toUpperCase()), [`${prefix}shown-bulgogi`]);
    assert.deepEqual(await names(`${prefix}shown-bulgogi`), [`${prefix}shown-bulgogi`]);
    assert.deepEqual(await names(`${prefix}shown-brand`), [`${prefix}shown-bulgogi`]);
    // A food without a brand is found by its name, with no leading space needed.
    assert.deepEqual(await names(`${prefix}shown-no-brand`), [`${prefix}shown-no-brand`]);
    // The words in the other order are not what the screen shows.
    assert.deepEqual(await names(`${prefix}shown-bulgogi ${prefix}shown-brand`), []);
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
  });

  // Without a search word the pages cover the whole store too. Other test files add and remove
  // foods at the same time, so the store is read through one snapshot: the API and the check below
  // both see the same foods, whatever the other files write meanwhile (#134).
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const snapshot = { query: client.query.bind(client) } as unknown as Pool;
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM foods ORDER BY name, brand NULLS FIRST, id',
    );
    await withApi(snapshot, async (call) => {
      const ids: number[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await call(`/api/foods?offset=${offset}`);
        assert.equal(page.status, 200);
        ids.push(...(page.data.foods as { id: number }[]).map((food) => food.id));
        offset = page.data.nextOffset as number | null;
      }
      // Every food once, in the store's order: not only as many as there are.
      assert.deepEqual(
        ids,
        rows.map((row) => Number(row.id)),
      );
    });
  } finally {
    // A lost connection fails the rollback too; the client still goes back, or pool.end() waits.
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
});
