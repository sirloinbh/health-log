import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { daysBetween, isRealDate, shiftDay } from '../src/dates.js';
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
        assert.match(String(data.error), /The date is not valid/, path);
      }
    }
  });
});

test('the other places that take a date use the same ends', async () => {
  await withApi(untouched(), async (call) => {
    for (const [method, path, body, message] of [
      ['GET', '/api/body?from=1899-12-31&to=1900-01-02', undefined, 'The date is not valid'],
      ['GET', '/api/body?from=2999-12-30&to=3000-01-01', undefined, 'The date is not valid'],
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
        'The verified date is not valid',
      ],
      [
        'POST',
        '/api/meals/2026-03-15/copy',
        { from: '0001-01-01', meal: 'lunch' },
        'The date to copy from is not valid',
      ],
    ] as const) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, path);
      assert.match(String(data.error), new RegExp(message), path);
    }
  });
});

// #193: one copy of the day arithmetic for body, report, reminders and periodsOf.
test('shiftDay steps whole calendar days across month, year and leap-day ends', () => {
  assert.equal(shiftDay('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2027-03-01', -1), '2027-02-28');
  assert.equal(shiftDay('2026-11-22', 0), '2026-11-22');
  assert.equal(shiftDay('2026-11-22', 7), '2026-11-29');
});

test('daysBetween counts whole days, negative when the end is earlier', () => {
  assert.equal(daysBetween('2026-11-22', '2026-11-22'), 0);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
  assert.equal(daysBetween('2028-01-01', '2029-01-01'), 366);
  assert.equal(daysBetween('2026-11-22', '2026-11-15'), -7);
});

test('day arithmetic does not depend on the server time zone or daylight saving', () => {
  const zone = process.env.TZ;
  try {
    // Los Angeles springs forward on 2026-03-08: that day is 23 hours long there.
    for (const tz of ['America/Los_Angeles', 'Asia/Seoul', 'UTC']) {
      process.env.TZ = tz;
      assert.equal(shiftDay('2026-03-08', 1), '2026-03-09', tz);
      assert.equal(daysBetween('2026-03-01', '2026-03-15'), 14, tz);
    }
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});
