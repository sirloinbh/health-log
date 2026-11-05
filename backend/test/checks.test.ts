import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const path = '/api/checks/2026-03-15';

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
const rejects = async (body: unknown, message: string) => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const { status, data } = await call(path, { method: 'PUT', body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(data.error), new RegExp(message));
  });
  assert.equal(queries.length, 0);
};

test('a check is yes, no or left out; nothing else stands for one', async () => {
  for (const value of ['true', 1, 0, 'yes']) {
    await rejects({ dietKept: value }, '식단 지킴은\\(는\\) 예, 아니오');
    await rejects({ sleepGood: value }, '수면 만족은\\(는\\) 예, 아니오');
  }
});

test('the memo is text of at most 200 characters', async () => {
  await rejects({ memo: 'a'.repeat(201) }, '200자 이하');
  await rejects({ memo: 3 }, '메모가 올바르지');
});

test('a check needs something in it', async () => {
  await rejects({}, '하나 이상');
  await rejects({ dietKept: null, sleepGood: null, memo: '   ' }, '하나 이상');
  await rejects([], '요청 본문');
});

test('a date that does not exist is rejected everywhere', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    for (const [method, target] of [
      ['GET', '/api/checks/2026-02-30'],
      ['PUT', '/api/checks/2026-13-01'],
      ['DELETE', '/api/checks/today'],
    ]) {
      const body = method === 'PUT' ? { dietKept: true } : undefined;
      const { status, data } = await call(target, { method, body });
      assert.equal(status, 400, target);
      assert.equal(data.error, '날짜가 올바르지 않습니다');
    }
  });
  assert.equal(queries.length, 0);
});

test('deleting a day with no check answers 404', async () => {
  await withApi(recording().pool, async (call) => {
    const { status, data } = await call(path, { method: 'DELETE' });
    assert.equal(status, 404);
    assert.equal(data.error, '하루 체크를 찾을 수 없습니다');
  });
});
