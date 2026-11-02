import { expect, test } from 'vitest';

import { parseAmount } from './number-input';

test('plain numbers are read, with spaces around them ignored', () => {
  expect(parseAmount('70')).toBe(70);
  expect(parseAmount('70.55')).toBe(70.55);
  expect(parseAmount(' 0.5 ')).toBe(0.5);
  expect(parseAmount('0')).toBe(0);
});

test('a blank field means no value', () => {
  expect(parseAmount('')).toBeNull();
  expect(parseAmount('   ')).toBeNull();
});

test.each(['49,5', '1,200', '70.5.1', '1e5', '-1', '+1', '.5', '5.', '70kg', '٧٠', 'Infinity'])(
  'rejects %j instead of guessing',
  (text) => {
    expect(parseAmount(text)).toBeUndefined();
  },
);

test('digits too long to be exact are rejected, not rounded or turned into Infinity', () => {
  expect(parseAmount('9'.repeat(400))).toBeUndefined();
  expect(parseAmount('500.000000000000001')).toBeUndefined();
  expect(parseAmount('70.100000000000000001')).toBeUndefined();
  expect(parseAmount('123456789.5')).toBe(123456789.5);
});
