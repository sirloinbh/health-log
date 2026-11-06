import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { charCount } from '../src/text.js';
import { withApi } from './helpers.js';

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
