import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import {
  clockText,
  judgeAtLeast,
  judgeAtMost,
  judgeLastMeal,
  judgeSleep,
  judgeSoberWeek,
} from '../src/goals.js';
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
  await rejects('/api/goals/calories', { from, target: 99 }, 400, 'at least 100 kcal');
  await rejects('/api/goals/calories', { from, target: 10_001 }, 400, 'at most 10000 kcal');
  await rejects('/api/goals/calories', { from, target: 1800.5 }, 400, 'whole number');
  await rejects('/api/goals/protein', { from, target: 0 }, 400, 'at least 1 g');
  await rejects('/api/goals/sleep', { from, target: 59 }, 400, 'at least 60 min');
  await rejects('/api/goals/sleep', { from, target: 1441 }, 400, 'at most 1440 min');
  await rejects('/api/goals/sober_days', { from, target: 8 }, 400, 'at most 7 days');
  // #207: one day reads as one.
  await rejects('/api/goals/sober_days', { from, target: 0 }, 400, 'at least 1 day$');
  await rejects('/api/goals/sober_days', { from, target: '5' }, 400, 'must be a number');
  await rejects('/api/goals/sober_days', { from }, 400, 'must be a number');
});

test('a goal needs a real start date and a known item', async () => {
  await rejects('/api/goals/calories', { target: 2000 }, 400, 'Choose a start date');
  await rejects(
    '/api/goals/calories',
    { from: '2026-02-30', target: 2000 },
    400,
    'start date is not valid',
  );
  await rejects('/api/goals/calories', [], 400, 'request body');
  await rejects('/api/goals/water', { from, target: 2000 }, 404, 'Unknown goal item');
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

// #328: no eating after a set time, judged from the time of each meal slot.
test('a day with no meals is no record for the last meal goal', () => {
  assert.equal(judgeLastMeal(1260, []), 'none');
});

test('a last meal goal is met at the limit and missed after it', () => {
  const dinner = (time: number | null) => [{ meal: 'dinner', time }];
  assert.equal(judgeLastMeal(1260, dinner(1259)), 'met');
  assert.equal(judgeLastMeal(1260, dinner(1260)), 'met');
  assert.equal(judgeLastMeal(1260, dinner(1261)), 'missed');
});

test('a slot with no time leaves the day undetermined unless another slot already missed', () => {
  const untimed = { meal: 'snack', time: null };
  assert.equal(judgeLastMeal(1260, [{ meal: 'dinner', time: 1100 }, untimed]), 'unknown');
  assert.equal(judgeLastMeal(1260, [untimed]), 'unknown');
  assert.equal(judgeLastMeal(1260, [{ meal: 'dinner', time: 1300 }, untimed]), 'missed');
});

test('a clock time has two digits for the hour and the minute', () => {
  assert.equal(clockText(1260), '21:00');
  assert.equal(clockText(65), '01:05');
  assert.equal(clockText(1439), '23:59');
});

test('the last meal goal takes minutes from midnight in range, and says them as a time', async () => {
  await rejects('/api/goals/last_meal', { from, target: 0 }, 400, 'at least 00:01');
  await rejects('/api/goals/last_meal', { from, target: 1440 }, 400, 'at most 23:59');
  await rejects('/api/goals/last_meal', { from, target: 21.5 }, 400, 'whole number');
});
