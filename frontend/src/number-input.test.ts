import { expect, test } from 'vitest';

import { hasTwoDecimalsAtMost, parseAmount } from './number-input';

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
  // #209: within the 9 + 9 digits the pattern allows, more than 15 significant ones would round.
  expect(parseAmount('999999999.999999999')).toBeUndefined();
  expect(parseAmount('123456789.1234567')).toBeUndefined();
});

test('up to 15 significant digits are read exactly, whatever zeros surround them', () => {
  expect(parseAmount('123456789.123456')).toBe(123456789.123456);
  expect(parseAmount('0.000000001')).toBe(0.000000001);
  expect(parseAmount('000000070.500000000')).toBe(70.5);
  expect(parseAmount('100000000.000000000')).toBe(100000000);
});

test('two decimals are the finest amount kept', () => {
  expect(hasTwoDecimalsAtMost(1.25)).toBe(true);
  expect(hasTwoDecimalsAtMost(3)).toBe(true);
  expect(hasTwoDecimalsAtMost(1.255)).toBe(false);
});
