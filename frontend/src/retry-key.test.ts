import { expect, test } from 'vitest';

import { createRetryKeys } from './retry-key';

const counter = () => {
  let next = 0;
  return () => `key-${(next += 1)}`;
};

test('the same request sent again before an answer keeps its key', () => {
  const keys = createRetryKeys(counter());
  expect(keys.keyFor('add rice')).toBe('key-1');
  expect(keys.keyFor('add rice')).toBe('key-1');
});

test('a different request gets a new key', () => {
  const keys = createRetryKeys(counter());
  expect(keys.keyFor('add rice')).toBe('key-1');
  expect(keys.keyFor('add soup')).toBe('key-2');
  // Going back to the first request is a new action too.
  expect(keys.keyFor('add rice')).toBe('key-3');
});

test('after an answer the same request is a new action', () => {
  const keys = createRetryKeys(counter());
  expect(keys.keyFor('add rice')).toBe('key-1');
  keys.answered();
  expect(keys.keyFor('add rice')).toBe('key-2');
});

test('the default keys are random UUIDs', () => {
  const keys = createRetryKeys();
  const key = keys.keyFor('add rice');
  expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  keys.answered();
  expect(keys.keyFor('add rice')).not.toBe(key);
});
