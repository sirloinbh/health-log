import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Made-up values only: no real visit belongs in tests.
const visit = { date: '2026-03-15', clinic: '가상의원' };

const untouched = () =>
  ({
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  }) as unknown as Pool;

const rejects = async (body: unknown, message: string, method = 'POST', path = '/api/visits') => {
  await withApi(untouched(), async (call) => {
    const { status, data } = await call(path, { method, body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(data.error), new RegExp(message));
  });
};

test('a visit needs a real date and a clinic', async () => {
  await rejects({ clinic: '가상의원' }, 'Choose a visit date');
  await rejects({ ...visit, date: '2026-02-30' }, 'The visit date is not valid');
  await rejects({ ...visit, date: '3000-01-01' }, 'The visit date is not valid');
  await rejects({ date: visit.date }, 'Enter clinic name');
  await rejects({ ...visit, clinic: '   ' }, 'Enter clinic name');
  await rejects([], 'request body');
});

test('lengths are counted in characters, so the limit holds for emoji as well', async () => {
  await rejects(
    { ...visit, clinic: '🏥'.repeat(101) },
    'Clinic name must be 100 characters or fewer',
  );
  await rejects(
    { ...visit, department: '가'.repeat(51) },
    'Department must be 50 characters or fewer',
  );
  await rejects({ ...visit, note: '가'.repeat(1001) }, '1000 characters or fewer');
});

test('costs are whole won from 0 to 100 million', async () => {
  for (const [value, message] of [
    ['1000', 'a number'],
    [12.5, 'a whole number of won'],
    [-1, '0 won or more'],
    [100_000_001, '100 million won or less'],
  ] as const) {
    await rejects({ ...visit, cost: value }, `Visit cost must be ${message}`);
    await rejects({ ...visit, procedures: [{ name: '가상 시술', cost: value }] }, message);
  }
});

test('the next appointment cannot come before the visit', async () => {
  await rejects({ ...visit, nextVisitOn: '2026-03-14' }, 'cannot be before the visit date');
  await rejects({ ...visit, nextVisitOn: '2026-13-01' }, 'The next appointment date is not valid');
});

test('procedures need a name and stop at ten', async () => {
  await rejects({ ...visit, procedures: [{ area: '이마' }] }, 'Enter procedure name');
  await rejects({ ...visit, procedures: ['가상 시술'] }, 'The procedure is not valid');
  await rejects(
    { ...visit, procedures: Array.from({ length: 11 }, () => ({ name: '가상 시술' })) },
    'up to 10 procedures',
  );
});

test('refusals never repeat what was entered', async () => {
  const secret = '가상비밀메모';
  await withApi(untouched(), async (call) => {
    for (const body of [
      { ...visit, note: secret.repeat(200) },
      { ...visit, clinic: secret.repeat(20) },
      { ...visit, procedures: [{ name: secret, note: secret.repeat(100) }] },
    ]) {
      const { status, data } = await call('/api/visits', { method: 'POST', body });
      assert.equal(status, 400);
      assert.doesNotMatch(String(data.error), new RegExp(secret));
    }
  });
});

test('ids, dates and search words are checked before the database', async () => {
  await withApi(untouched(), async (call) => {
    for (const [method, path, message] of [
      ['PUT', '/api/visits/abc', 'clinic visit ID'],
      ['DELETE', '/api/visits/0', 'clinic visit ID'],
      ['GET', '/api/visits?date=2026-02-30', 'The date is not valid'],
      ['GET', `/api/visits?q=${'가'.repeat(101)}`, 'search term must be 100 characters or fewer'],
      ['GET', '/api/visits?offset=-1', 'list offset'],
    ] as const) {
      const { status, data } = await call(path, {
        method,
        body: method === 'PUT' ? visit : undefined,
      });
      assert.equal(status, 400, path);
      assert.match(String(data.error), new RegExp(message), path);
    }
  });
});
