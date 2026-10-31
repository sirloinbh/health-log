import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { defaultRateLimit } from '../src/rate-limit.js';
import { withApi } from './helpers.js';

const queries: unknown[] = [];
const pool = {
  query: async (...args: unknown[]) => {
    queries.push(args);
    return { rows: [] };
  },
} as unknown as Pool;

test('requests over the limit get a Korean 429 and never reach the database', async () => {
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/foods')).status, 200);
      assert.equal((await call('/api/foods')).status, 200);
      const before = queries.length;

      const { status, data } = await call('/api/foods');
      assert.equal(status, 429);
      assert.equal(data.error, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요');
      assert.equal(queries.length, before);
    },
    { rateLimit: { max: 2, windowMs: 60_000 } },
  );
});

test('the count starts over when the window ends', async () => {
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/foods')).status, 200);
      assert.equal((await call('/api/foods')).status, 429);
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert.equal((await call('/api/foods')).status, 200);
    },
    { rateLimit: { max: 1, windowMs: 400 } },
  );
});

test('writes count toward the limit too', async () => {
  await withApi(
    pool,
    async (call) => {
      const body = { name: 'x', servingSize: 1, servingUnit: 'g' };
      await call('/api/foods/abc', { method: 'PUT', body });
      assert.equal((await call('/api/foods', { method: 'POST', body })).status, 429);
    },
    { rateLimit: { max: 1, windowMs: 60_000 } },
  );
});

test('the health check stays available while the API is limited', async () => {
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/foods')).status, 200);
      assert.equal((await call('/api/foods')).status, 429);
      assert.equal((await call('/api/health')).status, 200);
    },
    { rateLimit: { max: 1, windowMs: 60_000 } },
  );
});

test('a request forwarded by nginx is limited without a validation error', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const server = createApp(pool, { rateLimit: { max: 1, windowMs: 60_000 } }).listen(
    0,
    '127.0.0.1',
  );
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const get = () =>
    fetch(`http://127.0.0.1:${port}/api/foods`, { headers: { 'x-forwarded-for': '203.0.113.9' } });

  assert.equal((await get()).status, 200);
  assert.equal((await get()).status, 429);
  assert.equal(logged.mock.callCount(), 0);
});

test('the default limit is above what nginx lets through in its window', () => {
  // nginx allows 10 r/s with a burst of 40: 640 requests in a minute (frontend/nginx.conf).
  assert.equal(defaultRateLimit.windowMs, 60_000);
  assert.ok(defaultRateLimit.max > 640);
});
