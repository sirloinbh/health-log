import { expect, test } from 'vitest';

import { exerciseText } from './workout-text';

test('sets are counted, and the weight is named only when there is one', () => {
  expect(exerciseText({ exercise: 'Squat', sets: 5, topWeightKg: 100 })).toBe('5 sets, top 100 kg');
  expect(exerciseText({ exercise: 'Pull-up', sets: 1, topWeightKg: 0 })).toBe('1 set');
});
