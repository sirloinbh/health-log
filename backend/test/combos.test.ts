import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const combo = { name: 'Breakfast set', items: [{ foodId: 7, servings: 1 }] };

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
  await rejects('/api/combos', post({ ...combo, name: '   ' }), 400, 'Enter a combo name');
  await rejects('/api/combos', post({ ...combo, name: undefined }), 400, 'Enter a combo name');
  await rejects(
    '/api/combos',
    post({ ...combo, name: 'a'.repeat(51) }),
    400,
    'The combo name must be 50 characters or fewer',
  );
});

test('a combo holds one to twenty different foods', async () => {
  await rejects(
    '/api/combos',
    post({ ...combo, items: [] }),
    400,
    'Add at least one food to the combo',
  );
  await rejects('/api/combos', post({ name: 'Set' }), 400, 'Choose the foods for the combo');
  const many = Array.from({ length: 21 }, (_, index) => ({ foodId: index + 1, servings: 1 }));
  await rejects(
    '/api/combos',
    post({ ...combo, items: many }),
    400,
    'A combo can have up to 20 foods',
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
    'Add each food only once and adjust the quantity instead',
  );
});

test('each food in a combo follows the meal quantity rule', async () => {
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 0 }] }),
    400,
    'The quantity must be greater than 0',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 1.555 }] }),
    400,
    'The quantity can have at most 2 decimal places',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 7, servings: 1000 }] }),
    400,
    'The quantity is too large',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: [{ foodId: 1.5, servings: 1 }] }),
    400,
    'The food is not valid',
  );
  await rejects(
    '/api/combos',
    post({ ...combo, items: ['7'] }),
    400,
    'A food in the combo is not valid',
  );
});

test('a combo address must hold a valid id', async () => {
  await rejects('/api/combos/abc', { method: 'PUT', body: combo }, 400, 'Invalid combo ID');
  await rejects('/api/combos/0', { method: 'DELETE' }, 400, 'Invalid combo ID');
});

test('recording a combo needs a meal, a real date and a valid combo id', async () => {
  await rejects('/api/meals/2026-03-15/combos/3', post({ meal: 'brunch' }), 400, 'Choose a meal');
  await rejects(
    '/api/meals/2026-03-15/combos/3',
    post(undefined),
    400,
    'The request body is not valid',
  );
  await rejects('/api/meals/2026-03-15/combos/x', post({ meal: 'lunch' }), 400, 'Invalid combo ID');
  await rejects(
    '/api/meals/2026-02-30/combos/3',
    post({ meal: 'lunch' }),
    400,
    'The date is not valid',
  );
});
