import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { isRealDate } from '../src/dates.js';
import { withApi } from './helpers.js';

const untouched = () =>
  ({
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  }) as unknown as Pool;

test('the API takes dates from 1900-01-01 to 2999-12-31', () => {
  for (const date of ['1900-01-01', '1985-06-10', '2026-11-08', '2999-12-31']) {
    assert.equal(isRealDate(date), true, date);
  }
  for (const date of ['0001-01-01', '1899-12-31', '3000-01-01', '9999-12-31', '2026-02-30']) {
    assert.equal(isRealDate(date), false, date);
  }
});

// These used to reach PostgreSQL and fail there with a 500 (#43, #50).
test('a date past either end is a 400 on every day route and the report, before the database', async () => {
  await withApi(untouched(), async (call) => {
    for (const date of ['0001-01-01', '1899-12-31', '3000-01-01', '9999-12-31']) {
      for (const path of [
        `/api/report?period=week&date=${date}`,
        `/api/report?period=month&date=${date}`,
        `/api/sleep/${date}`,
        `/api/body/${date}`,
        `/api/habits/${date}`,
        `/api/checks/${date}`,
        `/api/meals/${date}`,
      ]) {
        const { status, data } = await call(path);
        assert.equal(status, 400, path);
        assert.match(String(data.error), /날짜가 올바르지 않습니다/, path);
      }
    }
  });
});

test('the other places that take a date use the same ends', async () => {
  await withApi(untouched(), async (call) => {
    for (const [method, path, body, message] of [
      ['GET', '/api/body?from=1899-12-31&to=1900-01-02', undefined, '날짜가 올바르지 않습니다'],
      ['GET', '/api/body?from=2999-12-30&to=3000-01-01', undefined, '날짜가 올바르지 않습니다'],
      [
        'POST',
        '/api/foods',
        {
          name: '김밥',
          servingSize: 1,
          servingUnit: 'g',
          sourceType: 'label',
          checkedOn: '9999-12-31',
        },
        '확인 날짜가 올바르지 않습니다',
      ],
      [
        'POST',
        '/api/meals/2026-03-15/copy',
        { from: '0001-01-01', meal: 'lunch' },
        '복사할 날짜가 올바르지 않습니다',
      ],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, path);
      assert.match(String(data.error), new RegExp(message), path);
    }
  });
});
