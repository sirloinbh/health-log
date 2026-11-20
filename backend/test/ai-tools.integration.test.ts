import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { testDatabaseSkip } from './helpers.js';

// project-standards#711: shared-ai calls the AI tool with a signed token; each call is checked for
// its scope and leaves one audit_log row.
const skip = testDatabaseSkip(process.env.TEST_DATABASE_URL);
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
// One owner per run, so the audit rows of an earlier run on the same DB do not count.
const owner = `owner-${randomUUID()}`;
// project-standards#670, #822: a token names its tool ('@list' for the list) and has its own jti; the app requires both.
function token(scope: string, tool: string, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ iss: 'shared-ai', aud: 'health-log', sub: owner, client: 'stdio', scope, tool, jti: randomUUID(), iat: now, exp: now + 60 })}`;
  return `${body}.${sign(null, Buffer.from(body), key).toString('base64url')}`;
}

test('AI tools: list_meals with scopes, signatures and audit rows', { skip }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const toolsPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const server = createApp(pool, { toolsPublicKey }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/internal/tools`;
  const call = (name: string, auth: string | null, body: unknown = {}) =>
    fetch(`${base}/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify(body),
    });
  // Far from any real record; this test owns the day.
  const date = '1991-03-01';
  const name = `ai-tool-test-${randomUUID()}`;
  try {
    await pool.query('DELETE FROM meal_entries WHERE entry_date = $1', [date]);
    await pool.query(
      `INSERT INTO meal_entries (entry_date, meal, servings, name, calories, is_junk)
       VALUES ($1, 'lunch', 1.5, $2, 200, false)`,
      [date, name],
    );

    const listed = await fetch(base, {
      headers: { authorization: `Bearer ${token('health-log:read', '@list')}` },
    });
    assert.equal(listed.status, 200);
    const { tools } = (await listed.json()) as {
      tools: { name: string; annotations: { readOnlyHint: boolean } }[];
    };
    assert.deepEqual(
      tools.map((t) => [t.name, t.annotations.readOnlyHint]),
      [['list_meals', true]],
    );

    assert.equal((await call('list_meals', null, { date })).status, 401);
    assert.equal(
      (
        await call(
          'list_meals',
          token('health-log:read', 'list_meals', generateKeyPairSync('ed25519').privateKey),
          { date },
        )
      ).status,
      401,
    );
    assert.equal(
      (await call('list_meals', token('health-log:write', 'list_meals'), { date })).status,
      403,
    );

    const read = await call('list_meals', token('health-log:read', 'list_meals'), { date });
    assert.equal(read.status, 200);
    const { result } = (await read.json()) as {
      result: {
        entries: { name: string; servings: number; calories: number }[];
        totals: { calories: { value: number } };
      };
    };
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].name, name);
    assert.equal(result.entries[0].calories, 300);
    assert.equal(result.totals.calories.value, 300);
    assert.equal(
      (await call('list_meals', token('health-log:read', 'list_meals'), { date: '1991-13-45' }))
        .status,
      400,
    );

    const rows = (
      await pool.query(
        "SELECT action,result,tool,entity,client,actor_type FROM audit_log WHERE actor_type='ai-tool' AND actor_id=$1 ORDER BY id",
        [owner],
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => [r.tool, r.action, r.result]),
      [
        ['list_meals', 'read', 'denied'],
        ['list_meals', 'read', 'ok'],
        ['list_meals', 'read', 'error'],
      ],
    );
    assert.equal(rows[1].entity, 'meal_entry');
    assert.equal(rows[1].client, 'stdio');
  } finally {
    await pool.query('DELETE FROM meal_entries WHERE entry_date = $1', [date]);
    server.close();
    await pool.end();
  }
});

test('AI tools are off without the shared-ai public key', { skip }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/internal/tools`)).status, 404);
  } finally {
    server.close();
    await pool.end();
  }
});
