import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const valid = { date: '2026-03-15', name: '가상콜레스테롤', value: 190, unit: 'mg/dL' };

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
const rejects = async (body: unknown, message: string, method = 'POST', path = '/api/labs') => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const { status, data } = await call(path, { method, body });
    assert.equal(status, 400);
    assert.match(String(data.error), new RegExp(message));
  });
  assert.equal(queries.length, 0);
};

test('a test date that is missing or not a real day is rejected', async () => {
  await rejects({ ...valid, date: undefined }, 'Choose a test date');
  await rejects({ ...valid, date: '2026-02-30' }, 'test date is not valid');
});

test('the test name is required and limited to 100 characters', async () => {
  await rejects({ ...valid, name: '   ' }, 'Enter the test name');
  await rejects({ ...valid, name: 'a'.repeat(101) }, '100 characters');
});

test('the result must be a number between 0 and 1 billion with at most 4 decimals', async () => {
  await rejects({ ...valid, value: '190' }, 'Result must be a number');
  await rejects({ ...valid, value: -1 }, '0 or more');
  await rejects({ ...valid, value: 1_000_000_001 }, '1 billion or less');
  await rejects({ ...valid, value: 1.00001 }, '4 decimal places');
  await rejects({ ...valid, value: undefined }, 'Result must be a number');
});

test('the reference range must be numbers with the minimum not above the maximum', async () => {
  await rejects({ ...valid, refLow: 'low' }, 'Reference minimum must be a number');
  await rejects({ ...valid, refHigh: -5 }, 'Reference maximum must be 0 or more');
  await rejects({ ...valid, refLow: 200, refHigh: 100 }, 'minimum cannot be above');
});

test('unit and note limits and the visit link are checked', async () => {
  await rejects({ ...valid, unit: 'x'.repeat(21) }, 'Unit must be 20');
  await rejects({ ...valid, note: 'x'.repeat(501) }, 'Note must be 500');
  await rejects({ ...valid, visitId: 0 }, 'linked clinic visit is not valid');
  await rejects({ ...valid, visitId: 1.5 }, 'linked clinic visit is not valid');
});

test('an update checks the same rules and the id', async () => {
  await rejects({ ...valid, value: -1 }, '0 or more', 'PUT', '/api/labs/3');
  await rejects(valid, 'Invalid lab result ID', 'PUT', '/api/labs/abc');
});

test('a too long search term or an offset that is not a number is rejected', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    assert.equal((await call(`/api/labs?q=${'a'.repeat(101)}`)).status, 400);
    assert.equal((await call('/api/labs?offset=-1')).status, 400);
  });
  assert.equal(queries.length, 0);
});
