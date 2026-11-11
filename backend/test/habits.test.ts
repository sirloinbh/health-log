import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const path = '/api/habits/2026-03-15';

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

const soju = { kind: 'soju', unit: 'bottle', amount: 1 };

test('cigarettes are a whole number from 0 to 200', async () => {
  await rejects({ cigarettes: -1 }, '0개비 이상');
  await rejects({ cigarettes: 201 }, '200개비 이하');
  await rejects({ cigarettes: 1.5 }, '정수');
  await rejects({ cigarettes: '3' }, '숫자로 입력');
});

test('each drink needs a known kind and unit and an amount above zero', async () => {
  await rejects({ drinks: [{ ...soju, kind: 'sake' }] }, '술 종류');
  await rejects({ drinks: [{ ...soju, unit: 'shot' }] }, '술 단위');
  await rejects({ drinks: [{ ...soju, amount: 0 }] }, '0보다 커야');
  await rejects({ drinks: [{ ...soju, amount: 99.5 }] }, '99 이하');
  await rejects({ drinks: [{ ...soju, amount: 0.125 }] }, '소수 둘째 자리');
  await rejects({ drinks: [{ ...soju, amount: '1' }] }, '숫자로 입력');
  await rejects({ drinks: ['soju'] }, '술 기록이 올바르지 않습니다');
  await rejects({ drinks: 'soju' }, '술 기록이 올바르지 않습니다');
});

test('the same kind and unit may appear once, and a day holds at most 20 drinks', async () => {
  await rejects({ drinks: [soju, { ...soju, amount: 2 }] }, '한 번만');
  const many = Array.from({ length: 21 }, (_, index) => ({
    kind: 'other',
    unit: 'glass',
    amount: index + 1,
  }));
  await rejects({ drinks: many }, '20가지까지');
});

test('a record has to say something about drinking or smoking', async () => {
  await rejects({}, '하나 이상');
  await rejects({ cigarettes: null, drinks: null }, '하나 이상');
  await rejects(null, 'Request body is not valid JSON');
});

test('a date that does not exist is rejected everywhere', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    for (const [method, target] of [
      ['GET', '/api/habits/2026-02-30'],
      ['PUT', '/api/habits/2026-13-01'],
      ['DELETE', '/api/habits/today'],
    ]) {
      const body = method === 'PUT' ? { cigarettes: 1 } : undefined;
      const { status, data } = await call(target, { method, body });
      assert.equal(status, 400, target);
      assert.equal(data.error, '날짜가 올바르지 않습니다');
    }
  });
  assert.equal(queries.length, 0);
});

test('deleting a day with no record answers 404', async () => {
  await withApi(recording().pool, async (call) => {
    const { status, data } = await call(path, { method: 'DELETE' });
    assert.equal(status, 404);
    assert.equal(data.error, '술·담배 기록을 찾을 수 없습니다');
  });
});
