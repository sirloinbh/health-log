import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checksum,
  migrate,
  type Migration,
  planMigrations,
  readMigrations,
} from '../src/migrations.js';

// Rules of the shared runner without a database (project-standards docs/conventions/database.md).
const repoMigrations = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
const file = (name: string, sql = `-- ${name}`): Migration => ({
  name,
  sql,
  checksum: checksum(sql),
});
const record = (m: Migration) => ({ name: m.name, checksum: m.checksum });

async function withDir(files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'migrations-'));
  try {
    for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('checksum ignores line endings and a UTF-8 BOM but not content', () => {
  const lf = "CREATE TABLE a();\nINSERT INTO a VALUES ('기타');\n";
  assert.equal(checksum(lf.replace(/\n/g, '\r\n')), checksum(lf));
  assert.equal(checksum(String.fromCharCode(0xfeff) + lf), checksum(lf));
  assert.notEqual(checksum(lf + '-- changed\n'), checksum(lf));
});

test('repository migrations follow NNN_name.sql and start at 001', async () => {
  const files = await readMigrations(repoMigrations);
  assert.ok(files.length >= 1);
  assert.match(files[0]?.name ?? '', /^001_/);
});

test('readMigrations rejects unexpected names and duplicate numbers', async () => {
  await withDir({ '001_a.sql': '', 'extra.sql': '' }, async (dir) => {
    await assert.rejects(readMigrations(dir), /NNN_name\.sql.*extra\.sql/);
  });
  await withDir({ '001_a.sql': '', '001_b.sql': '' }, async (dir) => {
    await assert.rejects(readMigrations(dir), /Duplicate migration number: 001_a\.sql, 001_b\.sql/);
  });
  await withDir({ '002_b.sql': 'b', '001_a.sql': 'a', 'notes.txt': '' }, async (dir) => {
    assert.deepEqual(
      (await readMigrations(dir)).map((f) => f.name),
      ['001_a.sql', '002_b.sql'],
    );
  });
});

test('planMigrations returns only files after the applied history', () => {
  const files = [file('001_a.sql'), file('002_b.sql'), file('003_c.sql')];
  assert.deepEqual(
    planMigrations(files, []).pending.map((f) => f.name),
    ['001_a.sql', '002_b.sql', '003_c.sql'],
  );
  const plan = planMigrations(files, files.slice(0, 2).map(record));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(
    plan.pending.map((f) => f.name),
    ['003_c.sql'],
  );
});

test('planMigrations reports changed, missing and out-of-order files', () => {
  const files = [file('001_a.sql'), file('002_b.sql', 'edited'), file('004_d.sql')];
  const plan = planMigrations(files, [
    record(file('001_a.sql')),
    record(file('002_b.sql')),
    record(file('005_e.sql')),
  ]);
  assert.deepEqual(plan.errors, [
    'The applied migration file has changed: 002_b.sql',
    'The applied migration file is missing: 005_e.sql',
    'New file numbered before the already applied 005_e.sql: 004_d.sql',
  ]);
});

// A fake connection that answers the runner's queries; `fail` decides which query throws.
function fakeDb(fail: (sql: string) => Error | undefined) {
  const queries: string[] = [];
  const db = {
    query: async (sql: string) => {
      queries.push(sql);
      const error = fail(sql);
      if (error) throw error;
      return { rows: sql.includes('to_regclass') ? [{ found: false }] : [] };
    },
  };
  return { db: db as unknown as Parameters<typeof migrate>[0], queries };
}

test('migrate keeps the failing file and cause when the connection is lost', async () => {
  let lost = false;
  const lostError = () => new Error('Connection terminated unexpectedly');
  const { db } = fakeDb((sql) => {
    if (lost) return lostError();
    if (sql === '-- 002_b.sql') {
      lost = true;
      return lostError();
    }
    return undefined;
  });
  await assert.rejects(
    migrate(db, [file('001_a.sql'), file('002_b.sql')]),
    (e: Error) => e.message === '002_b.sql failed to apply: Connection terminated unexpectedly',
  );
});

test('migrate unlocks after success and reports an unlock failure', async () => {
  const ok = fakeDb(() => undefined);
  assert.deepEqual(await migrate(ok.db, [file('001_a.sql')]), ['001_a.sql']);
  assert.match(ok.queries.at(-1) ?? '', /pg_advisory_unlock/);
  const unlockFails = fakeDb((sql) =>
    sql.includes('pg_advisory_unlock') ? new Error('unlock failed') : undefined,
  );
  await assert.rejects(migrate(unlockFails.db, [file('001_a.sql')]), /unlock failed/);
});
