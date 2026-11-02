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
  await rejects({ weightKg: 0 }, '체중은\\(는\\) 0보다');
  await rejects({ weightKg: -1 }, '체중은\\(는\\) 0보다');
  await rejects({ weightKg: 500.01 }, '체중은\\(는\\) 500 이하');
  await rejects({ bodyFatPercent: 0 }, '체지방률은\\(는\\) 0보다');
  await rejects({ bodyFatPercent: 101 }, '체지방률은\\(는\\) 100 이하');
  await rejects({ waistCm: 301 }, '허리둘레은\\(는\\) 300 이하');
  await rejects({ systolicMmhg: 49, diastolicMmhg: 30 }, '수축기 혈압은\\(는\\) 50 이상');
  await rejects({ systolicMmhg: 120, diastolicMmhg: 19 }, '이완기 혈압은\\(는\\) 20 이상');
});

test('numbers the columns would round or refuse are rejected', async () => {
  await rejects({ weightKg: 70.123 }, '소수 둘째 자리');
  await rejects({ weightKg: 1e-9 }, '소수 둘째 자리');
  await rejects({ systolicMmhg: 120.5, diastolicMmhg: 80 }, '정수');
  await rejects({ weightKg: '70' }, '숫자로 입력');
});

test('blood pressure needs both numbers in the right order', async () => {
  await rejects({ systolicMmhg: 120 }, '함께 입력');
  await rejects({ diastolicMmhg: 80 }, '함께 입력');
  await rejects({ systolicMmhg: 80, diastolicMmhg: 80 }, '이완기 혈압보다 높아야');
  await rejects({ systolicMmhg: 70, diastolicMmhg: 80 }, '이완기 혈압보다 높아야');
});

test('a record needs something in it', async () => {
  await rejects({}, '하나 이상');
  await rejects({ memo: '   ' }, '하나 이상');
  await rejects({ weightKg: null, memo: null }, '하나 이상');
});

test('a long memo and a body that is not an object answer in Korean', async () => {
  await rejects({ memo: 'x'.repeat(501) }, '500자 이하');
  await rejects([], '요청 본문이 올바르지 않습니다');
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
    assert.equal(data.error, '신체 기록을 찾을 수 없습니다');
  });
});

test('a range must be real, in order, and at most 366 days', async () => {
  const { pool, queries } = recording();
  await withApi(pool, async (call) => {
    const answer = async (query: string) => (await call(`/api/body?${query}`)).data.error;
    assert.equal(await answer('to=2026-03-15'), '날짜가 올바르지 않습니다');
    assert.equal(await answer('from=2026-02-30&to=2026-03-15'), '날짜가 올바르지 않습니다');
    assert.equal(await answer('from=a&from=b&to=2026-03-15'), '날짜가 올바르지 않습니다');
    assert.equal(
      await answer('from=2026-03-16&to=2026-03-15'),
      '시작 날짜는 끝 날짜보다 늦을 수 없습니다',
    );
    assert.equal(
      await answer('from=2025-03-14&to=2026-03-15'),
      '조회 기간은 366일 이하로 지정해 주세요',
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
