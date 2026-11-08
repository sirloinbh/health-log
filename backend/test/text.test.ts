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
      assert.equal(data.error, '쓸 수 없는 문자(NUL)가 들어 있습니다');
    }
  });
  assert.equal(queries.length, 0);
});

test('one emoji past a limit is refused, counted the same way', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    for (const [method, path, body, message] of [
      ['PUT', '/api/checks/2026-03-15', { memo: '🍙'.repeat(201) }, '메모는 200자 이하'],
      ['PUT', '/api/body/2026-03-15', { memo: '🍙'.repeat(501) }, '메모는 500자 이하'],
      [
        'POST',
        '/api/combos',
        { name: '🍙'.repeat(51), items: [{ foodId: 1, servings: 1 }] },
        '조합 이름은 50자 이하',
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
      assert.deepEqual(await response.json(), { error: '쓸 수 없는 문자(NUL)가 들어 있습니다' });
    }
    // Without a NUL the same depth passes on to the route, whose own rule answers.
    const clean = '['.repeat(10_000) + '"a"' + ']'.repeat(10_000);
    const response = await fetch(`http://127.0.0.1:${port}/api/checks/2026-03-15`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: `{"memo":3,"extra":${clean}}`,
    });
    assert.equal(response.status, 400);
    assert.match(String(((await response.json()) as { error: unknown }).error), /메모가 올바르지/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(queries.length, 0);
});
