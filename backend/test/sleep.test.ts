import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { sleepMinutes } from '../src/sleep.js';
import { withApi } from './helpers.js';

const date = '2026-03-15';
const valid = { bedAt: '2026-03-14T23:30:00+09:00', wakeAt: '2026-03-15T07:00:00+09:00' };

// Rejected input must never reach the database.
const rejects = async (path: string, body: object | undefined, message: string) => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call(path, { method: body ? 'PUT' : 'GET', body });
    assert.equal(status, 400);
    assert.equal(data.error, message);
  });
  assert.equal(queries.length, 0);
};

test('a sleep across midnight counts its real length', () => {
  assert.equal(sleepMinutes(valid.bedAt, valid.wakeAt), 450);
});

test('a wake time before the bed time is rejected', async () => {
  await rejects(
    `/api/sleep/${date}`,
    { bedAt: '2026-03-15T07:00:00+09:00', wakeAt: '2026-03-15T06:59:00+09:00' },
    '기상 시각은 취침 시각보다 늦어야 합니다',
  );
});

test('the same bed and wake time is rejected', async () => {
  await rejects(
    `/api/sleep/${date}`,
    { bedAt: valid.wakeAt, wakeAt: valid.wakeAt },
    '기상 시각은 취침 시각보다 늦어야 합니다',
  );
});

test('a sleep longer than a day is rejected', async () => {
  await rejects(
    `/api/sleep/${date}`,
    { bedAt: '2026-03-14T06:59:00+09:00', wakeAt: valid.wakeAt },
    '수면 시간은 24시간을 넘을 수 없습니다',
  );
});

test('a sleep is filed under the day of waking in the service time zone', async () => {
  await rejects('/api/sleep/2026-03-14', valid, '기상 시각의 날짜가 기록 날짜와 다릅니다');
  // 22:30 UTC on the 14th is 07:30 on the 15th in Seoul.
  const queries: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      queries.push(values);
      return {
        rows: [
          {
            sleep_date: date,
            bed_at: new Date('2026-03-14T14:30:00Z'),
            wake_at: new Date('2026-03-14T22:30:00Z'),
            duration_minutes: 480,
            source: 'manual',
          },
        ],
      };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call(`/api/sleep/${date}`, {
      method: 'PUT',
      body: { bedAt: '2026-03-14T14:30:00Z', wakeAt: '2026-03-14T22:30:00Z' },
    });
    assert.equal(status, 200);
    assert.equal(data.durationMinutes, 480);
  });
  assert.equal(queries[0]?.[3], 480);
});

test('a wake exactly at midnight belongs to the day it starts', async () => {
  const wakeAt = '2026-03-15T00:00:00+09:00';
  await rejects(
    '/api/sleep/2026-03-14',
    { bedAt: '2026-03-14T22:00:00+09:00', wakeAt },
    '기상 시각의 날짜가 기록 날짜와 다릅니다',
  );
});

test('the database only ever receives UTC, whatever offset was sent', async () => {
  const values: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      values.push(params);
      return {
        rows: [
          {
            sleep_date: date,
            bed_at: new Date('2026-03-14T14:30:00Z'),
            wake_at: new Date('2026-03-14T22:00:00Z'),
            duration_minutes: 450,
            source: 'manual',
          },
        ],
      };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status } = await call(`/api/sleep/${date}`, {
      method: 'PUT',
      body: { bedAt: '2026-03-15T06:30:00+16:00', wakeAt: valid.wakeAt },
    });
    assert.equal(status, 200);
  });
  assert.equal(values[0]?.[1], '2026-03-14T14:30:00.000Z');
  assert.equal(values[0]?.[2], '2026-03-14T22:00:00.000Z');
});

test('the sleep API is rate limited', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call(`/api/sleep/${date}`)).status, 200);
      const limited = await call(`/api/sleep/${date}`);
      assert.equal(limited.status, 429);
      assert.match(String(limited.data.error), /요청이 너무 많습니다/);
    },
    { rateLimit: { max: 1, windowMs: 60_000 } },
  );
});

test('times without an offset, or on a day that does not exist, are rejected', async () => {
  await rejects(
    `/api/sleep/${date}`,
    { bedAt: '2026-03-14T23:30:00', wakeAt: valid.wakeAt },
    '취침 시각이(가) 올바르지 않습니다',
  );
  await rejects(
    `/api/sleep/${date}`,
    { bedAt: valid.bedAt, wakeAt: '2026-02-30T07:00:00+09:00' },
    '기상 시각이(가) 올바르지 않습니다',
  );
  await rejects(
    `/api/sleep/${date}`,
    { wakeAt: valid.wakeAt },
    '취침 시각이(가) 올바르지 않습니다',
  );
});

test('a date in the path has to exist', async () => {
  await rejects('/api/sleep/2026-02-30', undefined, '날짜가 올바르지 않습니다');
  await rejects('/api/sleep/2026-2-3', valid, '날짜가 올바르지 않습니다');
});
