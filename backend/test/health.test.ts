import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { serviceDate } from '../src/standard/http.js';
import { listenForFetch, withApi } from './helpers.js';

const pool = (query: () => Promise<unknown>) => ({ query }) as unknown as Pool;

test('health reports the service and the injected service date when the DB answers', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/health');
      assert.equal(status, 200);
      assert.deepEqual(data, { ok: true, service: 'health-log', today: '2026-10-19' });
    },
    { today: () => '2026-10-19' },
  );
});

test('health counts today in Asia/Seoul when nothing is injected', async (t) => {
  // 00:30 in Seoul is still the previous day in UTC.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-30T15:30:00Z') });
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { data } = await call('/api/health');
      assert.equal(data.today, '2026-10-31');
    },
  );
});

test('a DB failure becomes a Korean 500 without leaking the error', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    await withApi(
      pool(async () => {
        throw new Error('password authentication failed for user secret');
      }),
      async (call) => {
        const { status, data } = await call('/api/health');
        assert.equal(status, 500);
        assert.deepEqual(data, { error: 'Server error' });
      },
    );
  } finally {
    console.error = original;
  }
});

test('unknown API paths return a Korean 404 JSON body', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/does-not-exist');
      assert.equal(status, 404);
      assert.equal(data.error, 'API not found');
    },
  );
});

test('service date follows Asia/Seoul across the UTC day boundary', () => {
  assert.equal(serviceDate(new Date('2026-10-18T14:59:59Z')), '2026-10-18');
  assert.equal(serviceDate(new Date('2026-10-18T15:00:00Z')), '2026-10-19');
});

test('every response has an X-Request-Id, and a valid incoming one is kept (#185)', async (t) => {
  const logged = t.mock.method(console, 'log', () => {});
  const { server, port } = await listenForFetch(
    createApp(
      pool(async () => ({ rows: [] })),
      { today: () => '2026-10-19' },
    ),
  );
  t.after(() => server.close());
  const url = `http://127.0.0.1:${port}/api/health`;

  const made = await fetch(url);
  assert.match(made.headers.get('x-request-id') ?? '', /^[\w.-]{1,128}$/);

  const kept = await fetch(url, { headers: { 'x-request-id': 'req-from-nginx-1' } });
  assert.equal(kept.headers.get('x-request-id'), 'req-from-nginx-1');

  // A 404 carries one too, and the request log line has the same ID.
  const missing = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.ok(missing.headers.get('x-request-id'));
  assert.ok(
    logged.mock.calls.some((call) =>
      String(call.arguments[0]).includes('"requestId":"req-from-nginx-1"'),
    ),
  );
});
