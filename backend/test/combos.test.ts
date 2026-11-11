import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const combo = { name: '아침 세트', items: [{ foodId: 7, servings: 1 }] };

// Rejected input must never reach the database.
const rejects = async (
  target: string,
  init: { method: string; body?: unknown },
  status: number,
  message: string,
) => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [] };
    },
    connect: async () => {
      queries.push('connect');
      throw new Error('no database in this test');
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status: actual, data } = await call(target, init);
    assert.equal(actual, status);
    assert.equal(data.error, message);
  });
  assert.equal(queries.length, 0);
};

const post = (body: unknown) => ({ method: 'POST', body });

test('a combo needs a name of at most 50 characters', async () => {
  await rejects('/api/combos', post({ ...combo, name: '   ' }), 400, '조합 이름을 입력해 주세요');
  await rejects(
    '/api/combos',
    post({ ...combo, name: undefined }),
    400,
    '조합 이름을 입력해 주세요',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, name: '가'.repeat(51) }),
    400,
    '조합 이름은 50자 이하로 입력해 주세요',
  );
});

test('a combo holds one to twenty different foods', async () => {
  await rejects(
    '/api/combos',
    post({ ...combo, items: [] }),
    400,
    '조합에 음식을 하나 이상 넣어 주세요',
  );
  await rejects('/api/combos', post({ name: '세트' }), 400, '조합에 넣을 음식을 골라 주세요');
  const many = Array.from({ length: 21 }, (_, index) => ({ foodId: index + 1, servings: 1 }));
  await rejects(
    '/api/combos',
    post({ ...combo, items: many }),
    400,
    '조합에는 음식을 20개까지 넣을 수 있습니다',
  );
  await rejects(
    '/api/combos',
    post({
      ...combo,
      items: [
        { foodId: 7, servings: 1 },
        { foodId: 7, servings: 2 },
      ],
    }),
    400,
    '같은 음식은 한 번만 넣고 수량으로 조절해 주세요',
  );
});

test('each food in a combo follows the meal quantity rule', async () => {
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 0 }] }),
    400,
    '수량은 0보다 커야 합니다',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 1.555 }] }),
    400,
    '수량은 소수 둘째 자리까지 입력해 주세요',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 1000 }] }),
    400,
    '수량이 너무 큽니다',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 1.5, servings: 1 }] }),
    400,
    '음식이 올바르지 않습니다',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: ['7'] }),
    400,
    '조합의 음식이 올바르지 않습니다',
  );
});

test('a combo address must hold a valid id', async () => {
  await rejects('/api/combos/abc', { method: 'PUT', body: combo }, 400, 'Invalid 조합 ID');
  await rejects('/api/combos/0', { method: 'DELETE' }, 400, 'Invalid 조합 ID');
});

test('recording a combo needs a meal, a real date and a valid combo id', async () => {
  await rejects(
    '/api/meals/2026-03-15/combos/3',
    post({ meal: 'brunch' }),
    400,
    '끼니를 선택해 주세요',
  );
  await rejects(
    '/api/meals/2026-03-15/combos/3',
    post(undefined),
    400,
    '요청 본문이 올바르지 않습니다',
  );
  await rejects('/api/meals/2026-03-15/combos/x', post({ meal: 'lunch' }), 400, 'Invalid 조합 ID');
  await rejects(
    '/api/meals/2026-02-30/combos/3',
    post({ meal: 'lunch' }),
    400,
    '날짜가 올바르지 않습니다',
  );
});
