import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { charCount } from '../src/text.js';
import { listenForFetch, withApi } from './helpers.js';

const recording = () => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [], rowCount: 0 };
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  } as unknown as Pool;
  return { pool, queries };
};

test('a character is counted once, as the database counts it, even when it is an emoji', () => {
  assert.equal(charCount('밥'), 1);
  assert.equal(charCount('🍙'), 1);
  assert.equal('🍙'.length, 2);
  assert.equal(charCount('🍙'.repeat(200)), 200);
});

test('a NUL character anywhere in a body or query is refused before the database', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    for (const [method, path, body] of [
      ['PUT', '/api/body/2026-03-15', { weightKg: 70, memo: 'a\u0000b' }],
      ['PUT', '/api/checks/2026-03-15', { memo: 'a\u0000b' }],
      ['POST', '/api/foods', { name: '김\u0000밥', servingSize: 1, servingUnit: 'g' }],
      ['POST', '/api/combos', { name: '아침\u0000', items: [{ foodId: 1, servings: 1 }] }],
      [
        'POST',
        '/api/meals/2026-03-15',
        { meal: 'lunch', name: '\u0000', calories: 1, servings: 1 },
      ],
      ['PUT', '/api/habits/2026-03-15', { cigarettes: 1, drinks: [{ kind: '\u0000' }] }],
      ['PUT', '/api/checks/2026-03-15', { ['me\u0000mo']: 'a' }],
      ['GET', '/api/foods?q=%00', undefined],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.equal(data.error, 'The text contains a character that is not allowed (NUL)');
    }
  });
  assert.equal(queries.length, 0);
});

test('one emoji past a limit is refused, counted the same way', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    for (const [method, path, body, message] of [
      [
        'PUT',
        '/api/checks/2026-03-15',
        { memo: '🍙'.repeat(201) },
        'note must be 200 characters or fewer',
      ],
      [
        'PUT',
        '/api/body/2026-03-15',
        { memo: '🍙'.repeat(501) },
        'note must be 500 characters or fewer',
      ],
      [
        'POST',
        '/api/combos',
        { name: '🍙'.repeat(51), items: [{ foodId: 1, servings: 1 }] },
        'combo name must be 50 characters or fewer',
      ],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.match(String(data.error), new RegExp(message));
    }
  });
  assert.equal(queries.length, 0);
});

test('a deeply nested or very long body is checked without failing, and a NUL in it is still found', async () => {
  const { pool, queries } = recording();
  // Written out by hand: JSON.stringify itself recurses and would overflow first. 10 000 levels
  // (20 KB) would overflow a recursive check; 60 000 strings (180 KB) make a long list. Both fit
  // within the 256kb body limit.
  const deep = '['.repeat(10_000) + '"a\\u0000b"' + ']'.repeat(10_000);
  const long = '[' + '"",'.repeat(60_000) + '"\\u0000"]';
  const { server, port } = await listenForFetch(createApp(pool));
  try {
    for (const extra of [deep, long]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/checks/2026-03-15`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: `{"memo":"a","extra":${extra}}`,
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'The text contains a character that is not allowed (NUL)',
      });
    }
    // Without a NUL the same depth passes on to the route, whose own rule answers.
    const clean = '['.repeat(10_000) + '"a"' + ']'.repeat(10_000);
    const response = await fetch(`http://127.0.0.1:${port}/api/checks/2026-03-15`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: `{"memo":3,"extra":${clean}}`,
    });
    assert.equal(response.status, 400);
    assert.match(
      String(((await response.json()) as { error: unknown }).error),
      /The note is not valid/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(queries.length, 0);
});

test('food and meal text past its limit by one emoji is refused, counted in characters', async () => {
  const { pool, queries } = recording();
  const food = { name: '김밥', servingSize: 1, servingUnit: 'g' };
  await withApi(pool, async (call) => {
    for (const [method, path, body, message] of [
      [
        'POST',
        '/api/foods',
        { ...food, name: '🍙'.repeat(101) },
        'food name must be 100 characters or fewer',
      ],
      ['POST', '/api/foods', { ...food, brand: '🍙'.repeat(51) }, '50 characters or fewer'],
      ['POST', '/api/foods', { ...food, category: '🍙'.repeat(31) }, '30 characters or fewer'],
      [
        'POST',
        '/api/foods',
        { ...food, servingUnit: '🍙'.repeat(11) },
        'unit must be 10 characters or fewer',
      ],
      [
        'POST',
        '/api/meals/2026-03-15',
        { meal: 'lunch', name: '🍙'.repeat(101), calories: 1, servings: 1 },
        'food name must be 100 characters or fewer',
      ],
      [
        'GET',
        `/api/foods?q=${encodeURIComponent('🍙'.repeat(101))}`,
        undefined,
        'search term must be 100 characters or fewer',
      ],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.match(String(data.error), new RegExp(message), `${method} ${path}`);
    }
  });
  assert.equal(queries.length, 0);
});

test('food and meal text filled to its limit with emoji passes the checks and is written', async () => {
  // Records every statement, from the pool and from a transaction's client alike. Its empty
  // answers make the routes fail after writing, so the statements are what this test reads.
  const statements: { sql: string; values: unknown[] }[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    return { rows: [], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release: () => {} }) } as unknown as Pool;
  const name = '🍙'.repeat(99) + '#';
  const wrote = (table: string) =>
    statements.some(
      ({ sql, values }) => sql.includes(`INSERT INTO ${table}`) && values.includes(name),
    );

  await withApi(pool, async (call) => {
    await call('/api/foods', {
      method: 'POST',
      body: {
        name,
        brand: '🍙'.repeat(50),
        category: '🍙'.repeat(30),
        servingSize: 1,
        servingUnit: '🍙'.repeat(10),
      },
    });
    await call('/api/meals/2026-03-15', {
      method: 'POST',
      body: { meal: 'lunch', name, calories: 1, servings: 1 },
    });
    const search = await call(`/api/foods?q=${encodeURIComponent('🍙'.repeat(100))}`);
    assert.ok(search.status !== 400, JSON.stringify(search.data));
  });
  assert.ok(wrote('foods'), 'the food was written');
  assert.ok(wrote('meal_entries'), 'the meal entry was written');
});
