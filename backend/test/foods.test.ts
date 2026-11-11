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
  await rejects({ ...valid, calories: -1 }, 'Calories must be 0 or more');
  await rejects({ ...valid, sodium: -0.5 }, 'Sodium must be 0 or more');
});

test('a food without a serving size or unit is rejected', async () => {
  await rejects({ name: '치즈버거', servingUnit: 'g' }, 'Enter a serving size');
  await rejects({ ...valid, servingSize: null }, 'Enter a serving size');
  await rejects({ ...valid, servingSize: 0 }, 'must be greater than 0');
  await rejects({ name: '치즈버거', servingSize: 120 }, 'Enter a serving size unit');
});

test('a blank name is rejected', async () => {
  await rejects({ ...valid, name: '   ' }, 'Enter a food name');
});

test('a claimed source has to say where and when it was checked', async () => {
  await rejects({ ...valid, sourceType: 'official', checkedOn: '2026-10-31' }, 'need a source URL');
  await rejects(
    { ...valid, sourceType: 'public', sourceUrl: 'https://example.com' },
    'need a verified date',
  );
  await rejects({ ...valid, sourceType: 'label' }, 'need a verified date');
});

test('only http and https source addresses are stored', async () => {
  await rejects({ ...valid, sourceUrl: 'javascript:alert(1)' }, 'http or https');
  await rejects({ ...valid, sourceUrl: 'not a url' }, 'http or https');
});

test('an address with no host part is rejected even though URL can parse it', async () => {
  await rejects({ ...valid, sourceUrl: 'http:foo' }, 'http or https');
  await rejects({ ...valid, sourceUrl: 'http:/foo' }, 'http or https');
});

test('a date that does not exist is rejected as the checked date', async () => {
  await rejects({ ...valid, checkedOn: '2026-02-30' }, 'verified date is not valid');
  await rejects({ ...valid, checkedOn: '0000-01-01' }, 'verified date is not valid');
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
      assert.equal(data.error, 'The verified date cannot be in the future');
      assert.equal(queries.length, 0);
    },
    { today: () => '2026-10-31' },
  );
});

test('numbers finer than two decimals are rejected instead of rounded', async () => {
  await rejects({ ...valid, servingSize: 0.001 }, 'serving size can have at most 2 decimal places');
  await rejects({ ...valid, sodium: 0.004 }, 'Sodium can have at most 2 decimal places');
  await rejects({ ...valid, protein: 12.345 }, 'Protein can have at most 2 decimal places');
  // Tiny values must not slip through as "almost two decimals" and become zero in the column.
  await rejects({ ...valid, servingSize: 5e-9 }, 'serving size can have at most 2 decimal places');
  await rejects({ ...valid, calories: 1e-9 }, 'Calories can have at most 2 decimal places');
  await rejects({ ...valid, fat: 12.340000009 }, 'Fat can have at most 2 decimal places');
});

test('two-decimal amounts that binary floating point handles badly are accepted', async () => {
  const pool = {
    query: async () => ({
      rows: [{ id: '1', name: 'x', serving_size: '1', serving_unit: 'g' }],
    }),
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const fat of [0, 0.01, 0.07, 0.29, 1.15, 1.1, 4.35, 8.2, 1005.01, 99998.99, 99999]) {
      const { status } = await call('/api/foods', { method: 'POST', body: { ...valid, fat } });
      assert.equal(status, 201, `fat ${fat}`);
    }
  });
});

test('the checked date may be the service date itself', async () => {
  const pool = {
    query: async () => ({
      rows: [
        { id: '1', name: 'x', serving_size: '1', serving_unit: 'g', checked_on: '2026-10-31' },
      ],
    }),
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const body = { ...valid, checkedOn: '2026-10-31' };
      assert.equal((await call('/api/foods', { method: 'POST', body })).status, 201);
      assert.equal((await call('/api/foods/1', { method: 'PUT', body })).status, 200);
    },
    { today: () => '2026-10-31' },
  );
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
  await rejects([], 'The request body is not valid');
});

test('an unknown source kind is rejected', async () => {
  await rejects({ ...valid, sourceType: 'guess' }, 'source type');
});

test('an invalid id and a missing food answer in Korean', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    const badId = await call('/api/foods/abc', { method: 'PUT', body: valid });
    assert.equal(badId.status, 400);
    assert.equal(badId.data.error, 'Invalid food ID');

    const missing = await call('/api/foods/9', { method: 'PUT', body: valid });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error, 'Food not found');
  });
});

test('a repeated search parameter is rejected instead of failing on the server', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/foods?q=a&q=b');
    assert.equal(status, 400);
    assert.equal(data.error, 'The search term is not valid');
  });
});

test('a too-long brand answers only with its own message, not the source rules', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/foods', {
      method: 'POST',
      body: { ...valid, brand: 'a'.repeat(51), sourceType: 'official' },
    });
    assert.equal(status, 400);
    assert.equal(data.error, 'Brand must be 50 characters or fewer');
  });
});

test('fields left out are stored with their defaults, and a blank brand as no brand', async () => {
  const params: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      params.push(values);
      return { rows: [{}] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status } = await call('/api/foods', {
      method: 'POST',
      body: { ...valid, brand: '   ' },
    });
    assert.equal(status, 201);
  });
  assert.deepEqual(params, [
    // A new food left unmarked is not junk food (#38).
    [
      '치즈버거',
      null,
      null,
      120,
      'g',
      null,
      null,
      null,
      null,
      null,
      null,
      'manual',
      null,
      null,
      false,
    ],
  ]);
});

test('a value that is not text answers with one message, even if it has a length', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const longList = Array.from({ length: 101 }, () => 'a');
  const cases: [Record<string, unknown>, string][] = [
    [{ name: [] }, 'Enter a food name'],
    [{ name: longList }, 'Enter a food name'],
    [{ servingUnit: [] }, 'Enter a serving size unit'],
    [{ brand: longList }, 'Brand is not valid'],
    [{ sourceUrl: { length: 2001 } }, 'The source URL is not valid'],
  ];
  await withApi(pool, async (call) => {
    for (const [change, message] of cases) {
      const { status, data } = await call('/api/foods', {
        method: 'POST',
        body: { ...valid, ...change },
      });
      assert.equal(status, 400);
      assert.equal(data.error, message);
    }
  });
});

test('a list position that is not a plain whole number is rejected', async () => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const offset of ['-1', '1.5', 'abc', '', '1e3', '12345678']) {
      const { status, data } = await call(`/api/foods?offset=${offset}`);
      assert.equal(status, 400, offset);
      assert.equal(data.error, 'The list offset is not valid');
    }
    assert.equal((await call('/api/foods?offset=1&offset=2')).status, 400);
  });
});

test('a list asks for one food past the page to know whether another page exists', async () => {
  const calls: unknown[][] = [];
  const row = (id: number) => ({ id: String(id), name: `음식${id}`, serving_size: '1' });
  const pool = {
    query: async (...args: unknown[]) => {
      calls.push(args);
      const [, params] = args as [string, unknown[]];
      const count = params[3] === 0 ? 101 : 3;
      return { rows: Array.from({ length: count }, (_, index) => row(index + 1)) };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const first = await call('/api/foods');
    assert.equal((first.data.foods as unknown[]).length, 100);
    assert.equal(first.data.nextOffset, 100);
    assert.deepEqual((calls[0][1] as unknown[]).slice(2), [101, 0]);

    const last = await call('/api/foods?offset=100');
    assert.equal((last.data.foods as unknown[]).length, 3);
    assert.equal(last.data.nextOffset, null);
    assert.deepEqual((calls[1][1] as unknown[]).slice(2), [101, 100]);
  });
});

// #38. An edit that leaves the mark out keeps it, so a screen that predates the mark cannot clear it.
test('the junk food mark is a yes or no, kept on an edit that leaves it out', async () => {
  await rejects({ ...valid, isJunk: 'yes' }, 'The junk food flag is not valid');
  await rejects({ ...valid, isJunk: null }, 'The junk food flag is not valid');
  const params: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      params.push(values);
      return { rows: [{}] };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    assert.equal(
      (await call('/api/foods', { method: 'POST', body: { ...valid, isJunk: true } })).status,
      201,
    );
    assert.equal((await call('/api/foods/5', { method: 'PUT', body: valid })).status, 200);
    assert.equal(
      (await call('/api/foods/5', { method: 'PUT', body: { ...valid, isJunk: false } })).status,
      200,
    );
  });
  assert.deepEqual(
    params.map((values) => values.slice(14)),
    [[true], [null, 5], [false, 5]],
  );
});
