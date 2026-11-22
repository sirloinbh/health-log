import { expect, test } from 'vitest';

import { type Pending, waitingCombo, waitingFood } from './meal-entry';

test('a waiting food is shown only in the list it was added from', () => {
  const fromSearch: Pending = { kind: 'food', list: 'search', foodId: 7 };
  expect(waitingFood(fromSearch, 'search')).toBe(7);
  // The same food can be in both lists; only the pressed one waits.
  expect(waitingFood(fromSearch, 'recent')).toBeNull();
  expect(waitingFood({ kind: 'food', list: 'recent', foodId: 7 }, 'recent')).toBe(7);
});

test('nothing waits in the food lists while a combo, copy or typed food is recorded', () => {
  const others: (Pending | null)[] = [
    null,
    { kind: 'combo', comboId: 7 },
    { kind: 'copy' },
    { kind: 'typed' },
  ];
  for (const pending of others) {
    expect(waitingFood(pending, 'search')).toBeNull();
    expect(waitingFood(pending, 'recent')).toBeNull();
  }
});

test('only the pressed combo waits, and never for a food with the same id', () => {
  expect(waitingCombo({ kind: 'combo', comboId: 3 }, 3)).toBe(true);
  expect(waitingCombo({ kind: 'combo', comboId: 3 }, 4)).toBe(false);
  expect(waitingCombo({ kind: 'food', list: 'search', foodId: 3 }, 3)).toBe(false);
  expect(waitingCombo(null, 3)).toBe(false);
});
