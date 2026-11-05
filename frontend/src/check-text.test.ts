import { expect, test } from 'vitest';

import { answerText, rateText } from './check-text';

test('unchecked, yes and no read differently', () => {
  expect(answerText(null, '지킴', '못 지킴')).toBe('체크 안 함');
  expect(answerText(true, '지킴', '못 지킴')).toBe('지킴');
  expect(answerText(false, '지킴', '못 지킴')).toBe('못 지킴');
});

test('a rate is out of the days answered, and no answered day is not 0%', () => {
  expect(rateText({ days: 0, yes: 0 }, '지킴')).toBe('기록 없음');
  expect(rateText({ days: 5, yes: 4 }, '지킴')).toBe('4/5일 지킴 (80%)');
  expect(rateText({ days: 3, yes: 0 }, '잘 잠')).toBe('0/3일 잘 잠 (0%)');
  expect(rateText({ days: 3, yes: 2 }, '지킴')).toBe('2/3일 지킴 (67%)');
});
