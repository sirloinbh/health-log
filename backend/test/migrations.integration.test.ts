import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from 'pg';

import { checksum, migrate, readMigrations } from '../src/migrations.js';
import { testDatabaseSkip } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);
const dir = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
const backend = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);

// #53. Each test works in its own schema, an empty database as far as the migrations can tell,
// so health_test and the tables other test files use in parallel are left alone.
async function withEmptySchema(
  name: string,
  body: (client: Client, schema: string) => Promise<void>,
) {
  const schema = `migrate_${name}_${process.pid}`;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await body(client, schema);
  } finally {
    // A cleanup failure on a broken connection must not hide the error that broke it.
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function tables(client: Client, schema: string) {
  const { rows } = await client.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [schema],
  );
  return rows.map((row) => row.name);
}

// Every row of every app table, so a second run that adds, drops or changes data shows up.
async function snapshot(client: Client, schema: string) {
  const result: Record<string, string[]> = {};
  for (const table of await tables(client, schema)) {
    if (table === 'schema_migrations') continue;
    const { rows } = await client.query<{ row: string }>(
      `SELECT t::text AS row FROM ${table} t ORDER BY 1`,
    );
    result[table] = rows.map((row) => row.row);
  }
  return result;
}

const recorded = async (client: Client) =>
  (
    await client.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')
  ).rows.map((row) => row.name);

test(
  'migrations apply to an empty database and running again changes nothing',
  { skip },
  async (t) => {
    const files = await readMigrations(dir);
    const names = files.map((file) => file.name);
    await withEmptySchema('apply', async (client, schema) => {
      await t.test('every file is applied in order and recorded', async () => {
        assert.ok(names.length >= 9);
        assert.deepEqual(await migrate(client, files), names);
        const found = await tables(client, schema);
        for (const table of [
          'app_settings',
          'foods',
          'meal_entries',
          'day_checks',
          'schema_migrations',
        ])
          assert.ok(found.includes(table), table);
        assert.deepEqual(await recorded(client), names);
      });

      await client.query(
        `INSERT INTO day_checks (record_date, diet_kept, sleep_good, memo)
       VALUES ('1990-06-01', true, NULL, U&'\\BA54\\BAA8')`,
      );
      const before = await snapshot(client, schema);
      assert.ok((before.foods?.length ?? 0) > 0, 'seeded foods are part of the snapshot');

      await t.test('running again applies nothing and keeps the data', async () => {
        assert.deepEqual(await migrate(client, files), []);
        assert.deepEqual(await snapshot(client, schema), before);
      });

      // An empty Docker volume runs every file from /docker-entrypoint-initdb.d without a history
      // table, and the first deploy then runs the runner on top of it.
      await t.test('a database set up before the history takes every file once more', async () => {
        await client.query('DROP TABLE schema_migrations');
        assert.deepEqual(await migrate(client, files), names);
        assert.deepEqual(await snapshot(client, schema), before);
        assert.deepEqual(await recorded(client), names);
      });

      await t.test('a changed file stops before anything runs', async () => {
        const changed = files.map((file, index) =>
          index === 0 ? { ...file, sql: 'SELECT 2', checksum: checksum('SELECT 2') } : file,
        );
        const extra = { name: '900_new.sql', sql: 'SELECT 1', checksum: checksum('SELECT 1') };
        await assert.rejects(migrate(client, [...changed, extra]), /has changed: 001_initial\.sql/);
        assert.deepEqual(await recorded(client), names, 'the new file did not run');
      });

      // Files added after this PR (010 and later) are picked up by name order alone.
      await t.test(
        'a later file runs alone; a failing one rolls back and names itself',
        async () => {
          const later = (name: string, sql: string) => ({ name, sql, checksum: checksum(sql) });
          const good = later('900_good.sql', 'CREATE TABLE migrate_good (id int)');
          const bad = later(
            '901_bad.sql',
            'CREATE TABLE migrate_partial (id int); SELECT no_such_column FROM migrate_partial',
          );
          await assert.rejects(
            migrate(client, [...files, good, bad]),
            /901_bad\.sql failed to apply/,
          );
          const found = await tables(client, schema);
          assert.ok(found.includes('migrate_good'), 'the earlier file stays');
          assert.ok(!found.includes('migrate_partial'), 'the failed file left nothing');
          const fixed = later('901_bad.sql', 'CREATE TABLE migrate_partial (id int)');
          assert.deepEqual(await migrate(client, [...files, good, fixed]), ['901_bad.sql']);
        },
      );
    });
  },
);

// The command a deploy runs (node dist/migrate.js is the build of this file).
test('the migrate command applies, then reports nothing to apply', { skip }, async () => {
  const names = (await readMigrations(dir)).map((file) => file.name);
  await withEmptySchema('command', async (client, schema) => {
    const target = new URL(url as string);
    target.searchParams.set('options', `-c search_path=${schema}`);
    const command = (...args: string[]) =>
      run(process.execPath, ['--import', 'tsx', 'src/migrate.ts', ...args], {
        cwd: backend,
        env: { ...process.env, DATABASE_URL: target.toString() },
      });

    const first = await command();
    assert.equal(first.stdout.trim(), `Applied: ${names.join(', ')}`);
    const second = await command();
    assert.equal(second.stdout.trim(), 'There are no migrations to apply.');
    const status = await command('--status');
    assert.deepEqual(
      status.stdout.trim().split('\n'),
      names.map((name) => `applied  ${name}`),
    );
    assert.deepEqual(await recorded(client), names);
  });
});
