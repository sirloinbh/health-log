import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// #32. Bibigo retort soups as written in their migration, checked without a database.
const dir = new URL('../../database/migrations/', import.meta.url);
// The backend-only deploy repository has no database folder.
const file = existsSync(dir)
  ? readdirSync(dir).find((name) => /_foods_bibigo\.sql$/.test(name))
  : undefined;
const sqlTest = file ? test : test.skip;

const decode = (literal: string) =>
  literal
    .replace(/^U&'|'$/g, '')
    .replace(/\\([0-9A-F]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

type Row = {
  name: string;
  brand: string;
  serving: number;
  calories: number;
  carbs: number | null;
  protein: number;
  fat: number;
  line: string;
};

const rows = (): Row[] => {
  const sql = readFileSync(new URL(file!, dir), 'utf8');
  const number = String.raw`(NULL|[\d.]+)`;
  const pattern = new RegExp(
    String.raw`^ {2}\((U&'[^']+'), (U&'[^']+'), U&'[^']+', ([\d.]+), 'g', ([\d.]+), ${number}, ([\d.]+), ([\d.]+), ${number}, ([\d.]+), `,
  );
  return sql
    .split('\n')
    .filter((line) => line.startsWith('  (U&'))
    .map((line) => {
      const m = pattern.exec(line);
      assert.ok(m, line);
      return {
        name: decode(m[1]!),
        brand: decode(m[2]!),
        serving: Number(m[3]),
        calories: Number(m[4]),
        carbs: m[5] === 'NULL' ? null : Number(m[5]),
        protein: Number(m[6]),
        fat: Number(m[7]),
        line,
      };
    });
};

sqlTest('every product is official, from its own page, dated and not junk food', () => {
  const list = rows();
  assert.equal(list.length, 27);
  for (const row of list) {
    assert.equal(row.brand, '비비고');
    assert.match(
      row.line,
      /, 'official', 'https:\/\/www\.cjthemarket\.com\/the\/product\/product-main\?prdCd=\d+', '2026-11-08', false\),?$/,
    );
  }
  const urls = list.map((row) => /prdCd=(\d+)/.exec(row.line)![1]);
  assert.equal(new Set(urls).size, urls.length, 'one product page per food');
});

// The name ends with the total content, and serving_size is what the facts are given for, so a
// label for part of the package stays apart from one for the whole (#32). Every product here is
// labelled for the whole package.
sqlTest('the facts are given for the whole package named in each product', () => {
  for (const { name, serving } of rows()) {
    const total = Number(/ (\d+)g$/.exec(name)?.[1]);
    assert.equal(serving, total, name);
  }
});

// Labels are rounded, so allow a few kcal; a value in the wrong column would be far off. A
// carbohydrate given only as "less than" is NULL and not checked.
sqlTest('calories agree with carbohydrate, protein and fat', () => {
  for (const { name, calories, carbs, protein, fat } of rows()) {
    if (carbs === null) continue;
    const computed = carbs * 4 + protein * 4 + fat * 9;
    assert.ok(Math.abs(computed - calories) <= 5, `${name}: ${calories} vs ${computed}`);
  }
});
