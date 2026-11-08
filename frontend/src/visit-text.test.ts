import { expect, test } from 'vitest';

import { parseWon, withTopic, wonText } from './visit-text';

test('a label takes 은 after a final consonant and 는 after a vowel', () => {
  expect(withTopic('병원 이름')).toBe('병원 이름은');
  expect(withTopic('진료비')).toBe('진료비는');
  expect(withTopic('1번째 시술 메모')).toBe('1번째 시술 메모는');
  expect(withTopic('1번째 시술 비용')).toBe('1번째 시술 비용은');
  expect(withTopic('memo')).toBe('memo은(는)');
});

test('won is read with or without thousands commas, and nothing is guessed', () => {
  expect(parseWon('')).toBeNull();
  expect(parseWon(' 12000 ')).toBe(12000);
  expect(parseWon('12,000')).toBe(12000);
  expect(parseWon('1,234,567')).toBe(1234567);
  for (const text of ['1.5', '12,00', '1,2345', '-1', '1만'])
    expect(parseWon(text)).toBeUndefined();
  expect(wonText(1234567)).toBe('1,234,567원');
});
