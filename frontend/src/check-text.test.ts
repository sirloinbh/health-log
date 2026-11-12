import { expect, test } from 'vitest';

import { answerText, charCount, rateText } from './check-text';

test('unchecked, yes and no read differently', () => {
  expect(answerText(null, 'Kept', 'Not kept')).toBe('Not checked');
  expect(answerText(true, 'Kept', 'Not kept')).toBe('Kept');
  expect(answerText(false, 'Kept', 'Not kept')).toBe('Not kept');
});

test('a rate is out of the days answered, and no answered day is not 0%', () => {
  expect(rateText({ days: 0, yes: 0 }, 'Kept')).toBe('No records');
  expect(rateText({ days: 5, yes: 4 }, 'Kept')).toBe('Kept on 4/5 days (80%)');
  expect(rateText({ days: 3, yes: 0 }, 'Slept well')).toBe('Slept well on 0/3 days (0%)');
  expect(rateText({ days: 3, yes: 2 }, 'Kept')).toBe('Kept on 2/3 days (67%)');
});

test('an emoji counts as one character, as the server counts it', () => {
  expect(charCount('밥')).toBe(1);
  expect(charCount('🍙'.repeat(200))).toBe(200);
  expect('🍙'.repeat(200).length).toBe(400);
});
