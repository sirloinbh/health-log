import { expect, test } from 'vitest';

import { usedValues } from './used-values';

test('values come most used first, without blanks or case duplicates', () => {
  expect(usedValues(['mg/dL', ' ', null, 'g/dL', 'MG/DL', undefined, 'mg/dL'])).toEqual([
    'mg/dL',
    'g/dL',
  ]);
});

test('ties keep the order they were first seen in', () => {
  expect(usedValues(['b', 'a', 'a', 'b'])).toEqual(['b', 'a']);
});

test('common values follow the used ones and are not repeated', () => {
  expect(usedValues(['ml'], ['g', 'ML', 'piece'])).toEqual(['ml', 'g', 'piece']);
});
