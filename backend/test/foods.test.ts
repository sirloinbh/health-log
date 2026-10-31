import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const valid = { name: '치즈버거', servingSize: 120, servingUnit: 'g' };

// Rejected input must never reach the database.
const rejects = async (body: object, message: string) => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/foods', { method: 'POST', body });
    assert.equal(status, 400);
    assert.match(String(data.error), new RegExp(message));
  });
  assert.equal(queries.length, 0);
};

test('a negative nutrient is rejected', async () => {
  await rejects({ ...valid, calories: -1 }, '칼로리은\\(는\\) 0 이상');
  await rejects({ ...valid, sodium: -0.5 }, '나트륨은\\(는\\) 0 이상');
});

test('a food without a serving size or unit is rejected', async () => {
  await rejects({ name: '치즈버거', servingUnit: 'g' }, '1회 제공량을 입력');
  await rejects({ ...valid, servingSize: null }, '1회 제공량을 입력');
  await rejects({ ...valid, servingSize: 0 }, '0보다 커야');
  await rejects({ name: '치즈버거', servingSize: 120 }, '단위를 입력');
});

test('a blank name is rejected', async () => {
  await rejects({ ...valid, name: '   ' }, '음식 이름을 입력');
});

test('a claimed source has to say where and when it was checked', async () => {
  await rejects({ ...valid, sourceType: 'official', checkedOn: '2026-10-31' }, '출처 주소가 필요');
  await rejects(
    { ...valid, sourceType: 'public', sourceUrl: 'https://example.com' },
    '확인 날짜가 필요',
  );
  await rejects({ ...valid, sourceType: 'label' }, '확인 날짜가 필요');
});

test('only http and https source addresses are stored', async () => {
  await rejects({ ...valid, sourceUrl: 'javascript:alert(1)' }, 'http 또는 https');
  await rejects({ ...valid, sourceUrl: 'not a url' }, 'http 또는 https');
});

test('an address with no host part is rejected even though URL can parse it', async () => {
  await rejects({ ...valid, sourceUrl: 'http:foo' }, 'http 또는 https');
  await rejects({ ...valid, sourceUrl: 'http:/foo' }, 'http 또는 https');
});

test('a date that does not exist is rejected as the checked date', async () => {
  await rejects({ ...valid, checkedOn: '2026-02-30' }, '확인 날짜가 올바르지');
  await rejects({ ...valid, checkedOn: '0000-01-01' }, '확인 날짜가 올바르지');
});

test('the checked date cannot be after the service date', async () => {
  const queries: unknown[] = [];
  const pool = {
    query: async (...args: unknown[]) => {
      queries.push(args);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/foods', {
        method: 'POST',
        body: { ...valid, checkedOn: '2026-11-01' },
      });
      assert.equal(status, 400);
      assert.equal(data.error, '확인 날짜는 오늘 이후일 수 없습니다');
      assert.equal(queries.length, 0);
    },
    { today: () => '2026-10-31' },
  );
});

test('numbers finer than two decimals are rejected instead of rounded', async () => {
  await rejects({ ...valid, servingSize: 0.001 }, '1회 제공량은 소수 둘째 자리');
  await rejects({ ...valid, sodium: 0.004 }, '나트륨은\\(는\\) 소수 둘째 자리');
  await rejects({ ...valid, protein: 12.345 }, '단백질은\\(는\\) 소수 둘째 자리');
});

test('two decimals pass despite floating point, like 12.35 and 1.1', async () => {
  const pool = {
    query: async () => ({
      rows: [{ id: '1', name: 'x', serving_size: '1.10', serving_unit: 'g', protein: '12.35' }],
    }),
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const body of [
      { ...valid, protein: 12.35 },
      { ...valid, servingSize: 1.1 },
      { ...valid, fat: 0.07 },
      { ...valid, sugars: 4.35 },
    ]) {
      assert.equal((await call('/api/foods', { method: 'POST', body })).status, 201);
    }
  });
});

test('a body that is not an object answers in Korean', async () => {
  await rejects([], '요청 본문이 올바르지 않습니다');
});

test('an unknown source kind is rejected', async () => {
  await rejects({ ...valid, sourceType: 'guess' }, '출처 종류');
});

test('an invalid id and a missing food answer in Korean', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    const badId = await call('/api/foods/abc', { method: 'PUT', body: valid });
    assert.equal(badId.status, 400);
    assert.equal(badId.data.error, '음식 ID가 올바르지 않습니다');

    const missing = await call('/api/foods/9', { method: 'PUT', body: valid });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, '음식을 찾을 수 없습니다');
  });
});

test('a repeated search parameter is rejected instead of failing on the server', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/foods?q=a&q=b');
    assert.equal(status, 400);
    assert.equal(data.error, '검색어가 올바르지 않습니다');
  });
});
