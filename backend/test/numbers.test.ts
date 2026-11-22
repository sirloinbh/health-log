import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withNumbers } from '../src/numbers.js';

test('the named NUMERIC columns become numbers and the rest stay as they came', () => {
  const row = { date: '2026-03-15', weightKg: '72.45', waistCm: null, memo: '12.5', pulse: 61 };
  assert.deepEqual(withNumbers(row, ['weightKg', 'waistCm']), {
    date: '2026-03-15',
    weightKg: 72.45,
    // NULL means not recorded, never 0.
    waistCm: null,
    // Text that looks like a number is not converted unless it is named.
    memo: '12.5',
    pulse: 61,
  });
});

test('the row pg returned is left untouched', () => {
  const row = { servings: '1.50' };
  const converted = withNumbers(row, ['servings']);
  assert.equal(converted.servings, 1.5);
  assert.equal(row.servings, '1.50');
});
