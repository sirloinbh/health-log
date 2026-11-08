import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { judgeAtLeast, judgeAtMost, judgeSleep, judgeSoberWeek } from '../src/goals.js';
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

// Rejected input must never reach the database.
const rejects = async (path: string, body: unknown, status: number, message: string) => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const { status: actual, data } = await call(path, { method: 'PUT', body });
    assert.equal(actual, status, JSON.stringify(body));
    assert.match(String(data.error), new RegExp(message));
  });
  assert.equal(queries.length, 0);
};

const from = '2026-11-01';

test('a day with no meals is no record, never a miss', () => {
  const none = { entries: 0, total: null, missing: 0 };
  assert.equal(judgeAtMost(2000, none), 'none');
  assert.equal(judgeAtLeast(100, none), 'none');
  assert.equal(judgeSleep(420, null), 'none');
  assert.equal(judgeSoberWeek(5, { recordedDays: 0, soberDays: 0 }), 'none');
});

test('a calorie cap is met at the cap and missed above it', () => {
  assert.equal(judgeAtMost(2000, { entries: 3, total: 2000, missing: 0 }), 'met');
  assert.equal(judgeAtMost(2000, { entries: 3, total: 2000.01, missing: 0 }), 'missed');
});

test('a protein floor is met at the floor and missed below it', () => {
  assert.equal(judgeAtLeast(100, { entries: 2, total: 100, missing: 0 }), 'met');
  assert.equal(judgeAtLeast(100, { entries: 2, total: 99.99, missing: 0 }), 'missed');
});

test('an entry with an unknown value decides only what the known part already settles', () => {
  // Already over the cap, or already past the floor, whatever the unknown entry held.
  assert.equal(judgeAtMost(2000, { entries: 3, total: 2100, missing: 1 }), 'missed');
  assert.equal(judgeAtLeast(100, { entries: 3, total: 120, missing: 1 }), 'met');
  // Otherwise the unknown entry could tip it either way.
  assert.equal(judgeAtMost(2000, { entries: 3, total: 1500, missing: 1 }), 'unknown');
  assert.equal(judgeAtLeast(100, { entries: 3, total: 50, missing: 1 }), 'unknown');
  // Every entry unknown: nothing known to add up.
  assert.equal(judgeAtMost(2000, { entries: 1, total: null, missing: 1 }), 'unknown');
});

test('a sleep goal is met at its length and missed below it', () => {
  assert.equal(judgeSleep(420, 420), 'met');
  assert.equal(judgeSleep(420, 419), 'missed');
});

test('a sober week stays open until the unrecorded days cannot change it', () => {
  // Goal 5 of 7: two drinking days still leave five.
  assert.equal(judgeSoberWeek(5, { recordedDays: 2, soberDays: 0 }), 'unknown');
  assert.equal(judgeSoberWeek(5, { recordedDays: 3, soberDays: 0 }), 'missed');
  assert.equal(judgeSoberWeek(5, { recordedDays: 5, soberDays: 5 }), 'met');
  assert.equal(judgeSoberWeek(7, { recordedDays: 1, soberDays: 0 }), 'missed');
});

test('each goal takes a whole number in its own range, or null to turn it off', async () => {
  await rejects('/api/goals/calories', { from, target: 99 }, 400, '100kcal 이상');
  await rejects('/api/goals/calories', { from, target: 10_001 }, 400, '10000kcal 이하');
  await rejects('/api/goals/calories', { from, target: 1800.5 }, 400, '정수');
  await rejects('/api/goals/protein', { from, target: 0 }, 400, '1g 이상');
  await rejects('/api/goals/sleep', { from, target: 59 }, 400, '60분 이상');
  await rejects('/api/goals/sleep', { from, target: 1441 }, 400, '1440분 이하');
  await rejects('/api/goals/sober_days', { from, target: 8 }, 400, '7일 이하');
  await rejects('/api/goals/sober_days', { from, target: '5' }, 400, '숫자로');
  await rejects('/api/goals/sober_days', { from }, 400, '숫자로');
});

test('a goal needs a real start date and a known item', async () => {
  await rejects('/api/goals/calories', { target: 2000 }, 400, '적용 시작일을');
  await rejects('/api/goals/calories', { from: '2026-02-30', target: 2000 }, 400, '시작일이');
  await rejects('/api/goals/calories', [], 400, '요청 본문');
  await rejects('/api/goals/water', { from, target: 2000 }, 404, '없는 목표 항목');
});

test('a bad date or item in the path is refused before the database', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    assert.equal((await call('/api/goals/days/2026-13-01')).status, 400);
    assert.equal((await call('/api/goals/sleep/2026-02-30', { method: 'DELETE' })).status, 400);
    assert.equal((await call('/api/goals/water/2026-11-01', { method: 'DELETE' })).status, 404);
  });
  assert.equal(queries.length, 0);
});
