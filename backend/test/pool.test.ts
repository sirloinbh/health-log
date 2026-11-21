import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createPool } from '../src/standard/db.js';

// #192: pg reports a lost connection as an `error` event, and an event nobody listens to throws, which ends the API.
// server.ts wraps its Pool in createPool; these tests check that a real pg Pool wrapped that way survives the event.
// The Pool never connects: nothing here runs a query.
const unusedPool = () => new Pool({ connectionString: 'postgres://nobody@127.0.0.1:1/none' });

test('a bare pg Pool throws on an idle-client error, so the listener is needed', () => {
  const pool = unusedPool();
  assert.throws(() => pool.emit('error', new Error('terminating connection')), /terminating/);
});

test('an idle-client error on the pool does not throw once createPool has run', () => {
  const logged: string[] = [];
  const pool = createPool(unusedPool(), (message) => logged.push(message));

  assert.doesNotThrow(() => pool.emit('error', new Error('terminating connection')));
  // An idle client also reports on its own listener (next test), so the pool-level one stays quiet.
  assert.deepEqual(logged, []);
});

test('a lost connection is logged once and does not throw', () => {
  const logged: { message: string; err: Error }[] = [];
  const pool = createPool(unusedPool(), (message, err) => logged.push({ message, err }));
  const client = new EventEmitter();
  pool.emit('connect', client);

  const lost = Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });
  assert.doesNotThrow(() => client.emit('error', lost));
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.message, 'Database connection failed');
  assert.equal(logged[0]?.err, lost);
});

test('the default log writes one console.error line', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const pool = createPool(unusedPool());
  const client = new EventEmitter();
  pool.emit('connect', client);

  client.emit('error', new Error('Connection terminated unexpectedly'));
  assert.equal(errors.mock.callCount(), 1);
});
