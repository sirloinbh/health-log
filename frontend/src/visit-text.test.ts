import { expect, test } from 'vitest';

import { parseWon, wonText } from './visit-text';

test('won is read with or without thousands commas, and nothing is guessed', () => {
  expect(parseWon('')).toBeNull();
  expect(parseWon(' 12000 ')).toBe(12000);
  expect(parseWon('12,000')).toBe(12000);
  expect(parseWon('1,234,567')).toBe(1234567);
  for (const text of ['1.5', '12,00', '1,2345', '-1', '1만'])
    expect(parseWon(text)).toBeUndefined();
  expect(wonText(1234567)).toBe('₩1,234,567');
});
