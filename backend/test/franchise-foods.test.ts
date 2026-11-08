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

// U&'...' literals as text: each backslash and four hex digits is one character.
const decode = (literal: string) =>
  literal
    .replace(/^U&'|^'|'$/g, '')
    .replace(/\\([0-9A-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

type Row = { name: string; brand: string; host: string; numbers: number[] };
const parsed = (): Row[] =>
  rows().map((line) => {
    const [, name, brand] = /^ {2}\((U&'[^']+'), ((?:U&)?'[^']+')/.exec(line)!;
    // serving size, calories, protein, sugars, sodium (carbs and fat are NULL).
    const [, size, calories, protein, sugars, sodium] =
      /, ([\d.]+), '(?:g|ml)', ([\d.]+), NULL, ([\d.]+), NULL, ([\d.]+), ([\d.]+), 'official'/.exec(
        line,
      )!;
    return {
      name: decode(name!),
      brand: decode(brand!),
      host: /'https:\/\/www\.([^/]+)\//.exec(line)![1]!,
      numbers: [size, calories, protein, sugars, sodium].map(Number),
    };
  });

sqlTest('each brand comes from its own official site', () => {
  const expected: Record<string, string> = {
    맥도날드: 'mcdonalds.co.kr',
    버거킹: 'burgerking.co.kr',
    롯데리아: 'lotteeatz.com',
    KFC: 'kfckorea.com',
    맘스터치: 'momstouch.co.kr',
  };
  const seen = new Set<string>();
  for (const row of parsed()) {
    assert.equal(row.host, expected[row.brand], `${row.brand} ${row.name}`);
    seen.add(row.brand);
  }
  assert.deepEqual([...seen].sort(), Object.keys(expected).sort());
});

// A value in the wrong column shows up here: protein and sugars give 4 kcal a gram, so together
// they can never exceed the calories (sodium in milligrams would), and a soft drink has no protein.
sqlTest('the numbers fit their columns', () => {
  for (const { brand, name, numbers } of parsed()) {
    const [, calories, protein, sugars] = numbers as [number, number, number, number, number];
    // Labels round each value, so allow some slack: McDonald's Fanta is 62 kcal with 16 g sugars.
    assert.ok(
      (protein + sugars) * 4 <= calories * 1.1 + 5,
      `${brand} ${name}: ${numbers.join('/')}`,
    );
    if (/콜라|사이다|스프라이트|환타|페퍼/.test(name)) assert.equal(protein, 0, `${brand} ${name}`);
  }
});

sqlTest('a re-run keeps the junk food mark the user changed', () => {
  const sql = readFileSync(new URL(file!, dir), 'utf8');
  const update = sql.slice(sql.indexOf('DO UPDATE SET'));
  assert.ok(update.length > 0 && !update.includes('is_junk'));
});
