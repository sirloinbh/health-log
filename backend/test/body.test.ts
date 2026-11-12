import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const path = '/api/body/2026-03-15';

const recording = () => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, queries };
};

// Rejected input must never reach the database.
const rejects = async (body: unknown, message: string) => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const { status, data } = await call(path, { method: 'PUT', body });
    assert.equal(status, 400);
    assert.match(String(data.error), new RegExp(message));
  });
  assert.equal(queries.length, 0);
};

test('values outside their range are rejected', async () => {
  await rejects({ weightKg: 0 }, 'Weight must be greater than 0');
  await rejects({ weightKg: -1 }, 'Weight must be greater than 0');
  await rejects({ weightKg: 500.01 }, 'Weight must be 500 or less');
  await rejects({ bodyFatPercent: 0 }, 'Body fat must be greater than 0');
  await rejects({ bodyFatPercent: 101 }, 'Body fat must be 100 or less');
  await rejects({ waistCm: 301 }, 'Waist must be 300 or less');
  await rejects(
    { systolicMmhg: 49, diastolicMmhg: 30 },
    'Systolic blood pressure must be 50 or more',
  );
  await rejects(
    { systolicMmhg: 120, diastolicMmhg: 19 },
    'Diastolic blood pressure must be 20 or more',
  );
});

test('numbers the columns would round or refuse are rejected', async () => {
  await rejects({ weightKg: 70.123 }, 'at most 2 decimal places');
  await rejects({ weightKg: 1e-9 }, 'at most 2 decimal places');
  await rejects({ systolicMmhg: 120.5, diastolicMmhg: 80 }, 'whole number');
  await rejects({ weightKg: '70' }, 'must be a number');
});

test('blood pressure needs both numbers in the right order', async () => {
  await rejects({ systolicMmhg: 120 }, 'Enter both');
  await rejects({ diastolicMmhg: 80 }, 'Enter both');
  await rejects({ systolicMmhg: 80, diastolicMmhg: 80 }, 'must be higher than diastolic');
  await rejects({ systolicMmhg: 70, diastolicMmhg: 80 }, 'must be higher than diastolic');
});

test('a record needs something in it', async () => {
  await rejects({}, 'at least one value');
  await rejects({ memo: '   ' }, 'at least one value');
  await rejects({ weightKg: null, memo: null }, 'at least one value');
});

test('a long memo and a body that is not an object answer in Korean', async () => {
  await rejects({ memo: 'x'.repeat(501) }, '500 characters or fewer');
  await rejects([], 'The request body is not valid');
});

test('a date that does not exist is rejected for every method', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    assert.equal((await call('/api/body/2026-02-30')).status, 400);
    assert.equal(
      (await call('/api/body/2026-02-30', { method: 'PUT', body: { weightKg: 70 } })).status,
      400,
    );
    assert.equal((await call('/api/body/2026-02-30', { method: 'DELETE' })).status, 400);
  });
  assert.equal(queries.length, 0);
});

test('deleting a day without a record answers 404 in Korean', async () => {
  const { pool } = recording();
  await withApi(pool, async (call) => {
    const { status, data } = await call(path, { method: 'DELETE' });
    assert.equal(status, 404);
    assert.equal(data.error, 'Body record not found');
  });
});

test('a range must be real, in order, and at most 366 days', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const answer = async (query: string) => (await call(`/api/body?${query}`)).data.error;
    assert.equal(await answer('to=2026-03-15'), 'The date is not valid');
    assert.equal(await answer('from=2026-02-30&to=2026-03-15'), 'The date is not valid');
    assert.equal(await answer('from=a&from=b&to=2026-03-15'), 'The date is not valid');
    assert.equal(
      await answer('from=2026-03-16&to=2026-03-15'),
      'The start date cannot be after the end date',
    );
    assert.equal(
      await answer('from=2025-03-14&to=2026-03-15'),
      'The date range must be 366 days or fewer',
    );
    assert.equal(queries.length, 0);

    const longest = await call('/api/body?from=2025-03-15&to=2026-03-15');
    assert.equal(longest.status, 200);
    assert.deepEqual(longest.data.records, []);
  });
});

test('the body API is rate limited like the others', async () => {
  const { pool } = recording();
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call(path)).status, 200);
      assert.equal((await call(path)).status, 429);
    },
    { rateLimit: { max: 1, windowMs: 60_000 } },
  );
});
