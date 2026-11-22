import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { listenForFetch } from './helpers.js';

// #196: a malformed retry key is refused before the database.
const untouched = {
  query: async () => {
    throw new Error('a refused request must not reach the database');
  },
  connect: async () => {
    throw new Error('a refused request must not open a transaction');
  },
} as unknown as Pool;

test('a retry key that is not a UUID is a 400 on every adding route', async () => {
  const { server, port } = await listenForFetch(createApp(untouched));
  try {
    const routes: [string, object][] = [
      ['/api/meals/2026-03-01', { meal: 'lunch', servings: 1, name: 'rice', calories: 1 }],
      ['/api/meals/2026-03-01/combos/1', { meal: 'lunch' }],
      ['/api/meals/2026-03-01/copy', { from: '2026-02-28', meal: 'lunch' }],
    ];
    for (const [path, body] of routes) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'not-a-uuid' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, path);
      assert.deepEqual(await response.json(), {
        error: 'The Idempotency-Key header must be a UUID',
      });
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
