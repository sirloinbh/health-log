import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const path = '/api/meals/2026-03-15';
const fromFood = { meal: 'lunch', servings: 1.5, foodId: 7 };
const typed = { meal: 'snack', servings: 1, name: '떡볶이', calories: 480 };

// Rejected input must never reach the database.
const rejects = async (target: string, body: object | undefined, message: string) => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call(target, { method: body ? 'POST' : 'GET', body });
    assert.equal(status, 400);
    assert.equal(data.error, message);
  });
  assert.equal(queries.length, 0);
};

test('a meal has to be one of the four', async () => {
  await rejects(path, { ...fromFood, meal: 'brunch' }, 'Choose a meal');
});

test('a quantity must be positive, sane, and at most two decimals', async () => {
  await rejects(path, { ...fromFood, servings: 0 }, 'The quantity must be greater than 0');
  await rejects(path, { ...fromFood, servings: 1000 }, 'The quantity is too large');
  await rejects(
    path,
    { ...fromFood, servings: 1.555 },
    'The quantity can have at most 2 decimal places',
  );
  await rejects(path, { meal: 'lunch', foodId: 7 }, 'The quantity must be a number');
});

test('an entry is either a chosen food or a typed name with calories', async () => {
  await rejects(
    path,
    { meal: 'lunch', servings: 1 },
    'Choose a food or enter a name, Calories are required for manual entry',
  );
  await rejects(
    path,
    { meal: 'lunch', servings: 1, name: '떡볶이' },
    'Calories are required for manual entry',
  );
  await rejects(
    path,
    { ...fromFood, name: '떡볶이' },
    'A chosen food and manual entry cannot be used together',
  );
  await rejects(path, { ...typed, name: '   ' }, 'Enter a food name');
  await rejects(path, { ...typed, calories: -1 }, 'Calories must be 0 or more');
});

test('typed entries have limits of their own', async () => {
  await rejects(
    path,
    { ...typed, name: 'a'.repeat(101) },
    'The food name must be 100 characters or fewer',
  );
  await rejects(path, { ...typed, calories: 100_000 }, 'Calories are too large');
  await rejects(path, { ...typed, calories: 1.555 }, 'Calories can have at most 2 decimal places');
});

// A change whose answer cannot be read must not stay, or a retry would repeat it.
const rollsBack = async (
  target: string,
  method: 'POST' | 'DELETE',
  change: string,
  body: object = typed,
) => {
  const statements: string[] = [];
  let released = false;
  const client = {
    query: async (sql: string) => {
      statements.push(sql.trim().split(/\s+/)[0]!);
      if (sql.includes('WITH eaten')) throw new Error('read failed');
      return { rows: [], rowCount: 1 };
    },
    release: () => {
      released = true;
    },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const original = console.error;
  console.error = () => {};
  try {
    await withApi(pool, async (call) => {
      const { status } = await call(target, {
        method,
        body: method === 'POST' ? body : undefined,
      });
      assert.equal(status, 500);
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(statements, ['BEGIN', change, 'WITH', 'ROLLBACK']);
  assert.equal(released, true);
};

test('an entry whose answer cannot be read is rolled back, so a retry cannot double it', async () => {
  await rollsBack(path, 'POST', 'INSERT');
});

test('a delete whose answer cannot be read is rolled back', async () => {
  await rollsBack(`${path}/entries/1`, 'DELETE', 'DELETE');
});

test('a food id too large to be exact is rejected', async () => {
  await rejects(path, { ...fromFood, foodId: 2 ** 53 }, 'The food is not valid');
});

test('a date in the path has to exist', async () => {
  await rejects('/api/meals/2026-02-30', undefined, 'The date is not valid');
  await rejects('/api/meals/2026-02-30', typed, 'The date is not valid');
});

test('the meals API is rate limited', async () => {
  // A day is read in one snapshot: no entries, and periods with no junk food.
  const noJunk = { times: '0', days: '0', calories: null, calories_missing: '0' };
  const client = {
    query: async (sql: string) => ({ rows: sql.includes('is_junk AND') ? [noJunk] : [] }),
    release: () => {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call(path)).status, 200);
      const limited = await call(path);
      assert.equal(limited.status, 429);
      assert.match(String(limited.data.error), /Too many requests/);
    },
    { rateLimit: { max: 1, windowMs: 60_000 } },
  );
});

const copy = { from: '2026-03-14', meal: 'breakfast' };

test('copying needs another real day and one of the four meals', async () => {
  await rejects(`${path}/copy`, { ...copy, meal: 'brunch' }, 'Choose a meal');
  await rejects(`${path}/copy`, { meal: 'lunch' }, 'Choose a date to copy from');
  await rejects(
    `${path}/copy`,
    { ...copy, from: '2026-02-30' },
    'The date to copy from is not valid',
  );
  await rejects(
    `${path}/copy`,
    { ...copy, from: '2026/03/14' },
    'The date to copy from is not valid',
  );
  await rejects(`${path}/copy`, { ...copy, from: '2026-03-15' }, 'Choose a different date');
  await rejects('/api/meals/2026-02-30/copy', copy, 'The date is not valid');
});

test('a copy whose answer cannot be read is rolled back, so a retry cannot double it', async () => {
  await rollsBack(`${path}/copy`, 'POST', 'INSERT', copy);
});

// #38. A stored food brings its own junk food mark; only typed-in food is marked in the request.
test('the junk food mark is a yes or no, and only for typed-in food', async () => {
  await rejects(path, { ...typed, isJunk: 'true' }, 'The junk food flag is not valid');
  await rejects(path, { ...typed, isJunk: 1 }, 'The junk food flag is not valid');
  await rejects(
    path,
    { ...fromFood, isJunk: true },
    'A chosen food and manual entry cannot be used together',
  );
});
