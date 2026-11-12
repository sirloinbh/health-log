import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const untouched = () =>
  ({
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
  }) as unknown as Pool;

const rejects = async (body: unknown, message: string) => {
  await withApi(untouched(), async (call) => {
    const { status, data } = await call('/api/reminders/done', { method: 'POST', body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(data.error, message);
  });
};

test('marking a reminder done needs a known kind, a record id and a real day', async () => {
  const valid = { kind: 'visit', id: 1, dueOn: '2026-03-10' };
  await rejects({ ...valid, kind: 'procedure' }, 'The reminder type is not valid');
  await rejects({ ...valid, id: 0 }, 'The reminder target is not valid');
  await rejects({ ...valid, id: 1.5 }, 'The reminder target is not valid');
  await rejects({ ...valid, id: '1' }, 'The reminder target is not valid');
  await rejects({ ...valid, dueOn: '2026-02-30' }, 'The reminder date is not valid');
  await rejects({ kind: 'visit', id: 1 }, 'The reminder date is not valid');
  await rejects([], 'The request body is not valid');
});

test('the days ahead are counted on the calendar, across a month and a year', async () => {
  const seen: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      seen.push(values);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/reminders');
      assert.equal(status, 200);
      assert.deepEqual(data, {
        today: '2026-12-28',
        until: '2027-01-04',
        leadDays: 7,
        reminders: [],
      });
    },
    { today: () => '2026-12-28' },
  );
  assert.deepEqual(seen, [
    ['2026-12-28', 7],
    ['2026-12-28', 7],
  ]);
});
