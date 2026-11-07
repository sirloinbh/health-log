import { expect, test } from 'vitest';

import { forgetPendingWrites, trackWrite, writesSettled } from './pending-writes';

const deferred = <T>() => {
  let resolve = (_value: T) => {};
  let reject = (_cause: unknown) => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const settledYet = async (waiting: Promise<void>) => {
  let done = false;
  void waiting.then(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

test('with nothing on its way, a read goes ahead at once', async () => {
  expect(await settledYet(writesSettled('/api/body/2026-03-15'))).toBe(true);
});

test('a read waits for a save to the same day and passes its result through', async () => {
  const save = deferred<string>();
  const tracked = trackWrite('/api/body/2026-03-15', save.promise);
  const waiting = writesSettled('/api/body/2026-03-15');
  expect(await settledYet(waiting)).toBe(false);

  save.resolve('saved');
  expect(await tracked).toBe('saved');
  expect(await settledYet(waiting)).toBe(true);
});

test('a failed save also ends the wait, and its failure still reaches the caller', async () => {
  const save = deferred<string>();
  const tracked = trackWrite('/api/sleep/2026-03-15', save.promise);
  const waiting = writesSettled('/api/sleep/2026-03-15');

  save.reject(new Error('서버 오류'));
  await expect(tracked).rejects.toThrow('서버 오류');
  expect(await settledYet(waiting)).toBe(true);
});

test('a save to another day or kind is not waited for, but a prefix covers every day', async () => {
  const save = deferred<null>();
  void trackWrite('/api/body/2026-03-14', save.promise);
  expect(await settledYet(writesSettled('/api/body/2026-03-15'))).toBe(true);
  expect(await settledYet(writesSettled('/api/sleep/2026-03-14'))).toBe(true);
  const everyDay = writesSettled('/api/body/');
  expect(await settledYet(everyDay)).toBe(false);

  save.resolve(null);
  expect(await settledYet(everyDay)).toBe(true);
});

test('a save started while waiting is waited for too', async () => {
  const first = deferred<null>();
  const second = deferred<null>();
  void trackWrite('/api/checks/2026-03-15', first.promise);
  const waiting = writesSettled('/api/checks/2026-03-15');
  void trackWrite('/api/checks/2026-03-15', second.promise);

  first.resolve(null);
  expect(await settledYet(waiting)).toBe(false);
  second.resolve(null);
  expect(await settledYet(waiting)).toBe(true);
});

test('a write from before a reset settling late does not end the wait for a newer one', async () => {
  const old = deferred<null>();
  const newer = deferred<null>();
  void trackWrite('/api/sleep/2026-03-15', old.promise);
  forgetPendingWrites();
  void trackWrite('/api/sleep/2026-03-15', newer.promise);
  const waiting = writesSettled('/api/sleep/2026-03-15');

  old.resolve(null);
  expect(await settledYet(waiting)).toBe(false);
  newer.resolve(null);
  expect(await settledYet(waiting)).toBe(true);
});
