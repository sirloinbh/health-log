import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// #31. The franchise data is checked as written, without a database: every row claims an official
// source, so each needs its own address, the checked date and the junk food mark, and nothing it
// does not know (carbs, total fat) may be filled in.
const dir = new URL('../../database/migrations/', import.meta.url);
// The backend-only deploy repository has no database folder.
const file = existsSync(dir)
  ? readdirSync(dir).find((name) => /_foods_franchise\.sql$/.test(name))
  : undefined;
const sqlTest = file ? test : test.skip;

const rows = () => {
  const sql = readFileSync(new URL(file!, dir), 'utf8');
  return sql.split('\n').filter((line) => line.startsWith('  (U&'));
};

sqlTest('every franchise row is official, sourced, dated and marked as junk food', () => {
  const lines = rows();
  assert.equal(lines.length, 164);
  const pattern =
    /^ {2}\(U&'[^']+', (U&'[^']+'|'KFC'), U&'[^']+', \d+(\.\d+)?, '(g|ml)', \d+(\.\d+)?, NULL, \d+(\.\d+)?, NULL, \d+(\.\d+)?, \d+(\.\d+)?, 'official', 'https:\/\/www\.(mcdonalds\.co\.kr|burgerking\.co\.kr|lotteeatz\.com|kfckorea\.com|momstouch\.co\.kr)\/[^']+', '2026-11-08', true\),?$/;
  for (const line of lines) assert.match(line, pattern);
});

sqlTest('each brand comes from its own site', () => {
  const hosts = new Map<string, Set<string>>();
  for (const line of rows()) {
    const brand = /^ {2}\(U&'[^']+', ((?:U&)?'[^']+')/.exec(line)![1]!;
    const host = /'https:\/\/www\.([^/]+)\//.exec(line)![1]!;
    hosts.set(brand, (hosts.get(brand) ?? new Set()).add(host));
  }
  assert.equal(hosts.size, 5);
  for (const set of hosts.values()) assert.equal(set.size, 1);
});
