// Shared migration runner (central rules: project-standards docs/conventions/database.md, #27).
// Applies database/migrations/NNN_<name>.sql in file name order and records each file in
// schema_migrations. Same table and rules as workout-memo backend/src/migrations.ts. Copied from
// the project-standards scaffold (scaffold/app/backend/src/migrations.ts), with only the BOM
// written as an escape (#53).
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ClientBase } from 'pg';

export type Migration = { name: string; checksum: string; sql: string };
export type AppliedMigration = { name: string; checksum: string };
type Db = Pick<ClientBase, 'query'>;

const filePattern = /^(\d{3})_[a-z0-9_]+\.sql$/;
// Fixed key (same as workout-memo) so concurrent runners (CI, host CLI) apply files one at a time.
const lockKey = 581_003;

// Line endings and a UTF-8 BOM depend on the checkout, not on the migration's meaning.
export function checksum(sql: string) {
  const normalized = sql.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

export async function readMigrations(dir: string): Promise<Migration[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const prefixes = new Map<string, string>();
  const migrations: Migration[] = [];
  for (const name of names) {
    const match = filePattern.exec(name);
    if (!match) throw new Error(`마이그레이션 파일 이름은 NNN_name.sql 형식이어야 합니다: ${name}`);
    const previous = prefixes.get(match[1]);
    if (previous) throw new Error(`마이그레이션 번호가 중복됩니다: ${previous}, ${name}`);
    prefixes.set(match[1], name);
    const sql = await readFile(join(dir, name), 'utf8');
    migrations.push({ name, checksum: checksum(sql), sql });
  }
  return migrations;
}

// History is append-only: an applied file must still exist unchanged, and a new
// file must sort after every applied one so all databases share one order.
export function planMigrations(files: Migration[], applied: AppliedMigration[]) {
  const errors: string[] = [];
  const byName = new Map(files.map((file) => [file.name, file]));
  for (const row of applied) {
    const file = byName.get(row.name);
    if (!file) errors.push(`적용된 마이그레이션 파일이 없습니다: ${row.name}`);
    else if (file.checksum !== row.checksum)
      errors.push(`적용된 마이그레이션 파일의 내용이 바뀌었습니다: ${row.name}`);
  }
  const done = new Set(applied.map((row) => row.name));
  const last = applied
    .map((row) => row.name)
    .sort()
    .at(-1);
  const pending = files.filter((file) => !done.has(file.name));
  for (const file of pending)
    if (last && file.name < last)
      errors.push(`이미 적용된 ${last}보다 앞선 번호의 새 파일입니다: ${file.name}`);
  return { pending, errors };
}

// Read-only: a database without history reports every file as pending.
export async function migrationStatus(db: Db, files: Migration[]) {
  const exists = (await db.query(`SELECT to_regclass('schema_migrations') IS NOT NULL AS found`))
    .rows[0].found as boolean;
  const applied = exists
    ? ((await db.query('SELECT name, checksum FROM schema_migrations ORDER BY name'))
        .rows as AppliedMigration[])
    : [];
  return { applied, ...planMigrations(files, applied) };
}

// Each file and its history row commit together; a failure rolls back that file
// only and stops, leaving earlier files recorded.
export async function migrate(db: Db, files: Migration[]) {
  await db.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    await ensureHistory(db);
    const { pending, errors } = await migrationStatus(db, files);
    if (errors.length) throw new Error(errors.join('\n'));
    for (const file of pending) {
      await db.query('BEGIN');
      try {
        await db.query(file.sql);
        await db.query('INSERT INTO schema_migrations(name, checksum) VALUES($1, $2)', [
          file.name,
          file.checksum,
        ]);
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK').catch(() => undefined);
        throw new Error(`${file.name} 적용 실패: ${(e as Error).message}`, { cause: e });
      }
    }
    return pending.map((file) => file.name);
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  }
}

function ensureHistory(db: Db) {
  return db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
}
