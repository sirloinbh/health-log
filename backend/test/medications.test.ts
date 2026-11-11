import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { serviceDate } from '../src/app.js';
import { withApi } from './helpers.js';

// Made-up values only: no real prescription belongs in tests.
const medicine = { name: '가상정', startOn: '2026-03-10' };

const untouched = () =>
  ({
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  }) as unknown as Pool;

const rejects = async (body: unknown, message: string) => {
  await withApi(untouched(), async (call) => {
    const { status, data } = await call('/api/medications', { method: 'POST', body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(data.error), new RegExp(message));
  });
};

test('the end cannot come before the start, and both are real dates', async () => {
  await rejects(
    { ...medicine, endOn: '2026-03-09' },
    'The end date cannot be before the start date',
  );
  await rejects({ name: '가상정' }, 'Choose a start date');
  await rejects({ ...medicine, startOn: '2026-02-30' }, 'The start date is not valid');
  await rejects({ ...medicine, endOn: '3000-01-01' }, 'The end date is not valid');
});

test('a medicine needs a name, and lengths are counted in characters', async () => {
  await rejects({ startOn: medicine.startOn }, 'Enter a medication name');
  await rejects({ ...medicine, name: '  ' }, 'Enter a medication name');
  await rejects(
    { ...medicine, name: '💊'.repeat(101) },
    'medication name must be 100 characters or fewer',
  );
  await rejects({ ...medicine, dose: '가'.repeat(51) }, 'Dose must be 50 characters or fewer');
  await rejects(
    { ...medicine, directions: '가'.repeat(101) },
    'Directions must be 100 characters or fewer',
  );
  await rejects({ ...medicine, note: '가'.repeat(501) }, 'Note must be 500 characters or fewer');
});

test('a linked visit is an id or nothing', async () => {
  for (const visitId of ['7', 1.5, 0, -1]) {
    await rejects({ ...medicine, visitId }, 'The linked clinic visit is not valid');
  }
});

test('refusals never repeat what was entered', async () => {
  const secret = '가상비밀약';
  await withApi(untouched(), async (call) => {
    for (const body of [
      { ...medicine, name: secret.repeat(30) },
      { ...medicine, note: secret.repeat(120) },
      { ...medicine, directions: secret, endOn: '2026-03-01' },
    ]) {
      const { status, data } = await call('/api/medications', { method: 'POST', body });
      assert.equal(status, 400);
      assert.doesNotMatch(String(data.error), new RegExp(secret));
    }
  });
});

test('ids and dates are checked before the database', async () => {
  await withApi(untouched(), async (call) => {
    for (const [method, path, message] of [
      ['PUT', '/api/medications/abc', 'medication record ID'],
      ['DELETE', '/api/medications/0', 'medication record ID'],
      ['GET', '/api/medications?date=2026-02-30', 'The date is not valid'],
    ] as const) {
      const { status, data } = await call(path, {
        method,
        body: method === 'PUT' ? medicine : undefined,
      });
      assert.equal(status, 400, path);
      assert.match(String(data.error), new RegExp(message), path);
    }
  });
});

test('today is the calendar day in Asia/Seoul, not the server clock’s zone', () => {
  // 15:30 UTC on the 14th is already 00:30 on the 15th in Seoul (UTC+9).
  assert.equal(serviceDate(new Date('2026-03-14T15:30:00Z')), '2026-03-15');
  assert.equal(serviceDate(new Date('2026-03-14T14:59:59Z')), '2026-03-14');
});
