import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { listenForFetch } from './helpers.js';

// This route never touches the database.
const pool = {} as unknown as Pool;

type Seen = { url: string; cookie: string | undefined };

const call = async (
  workoutMemoFetch: (url: string, init: RequestInit) => Promise<Response>,
  options: { url?: string; cookie?: string; date?: string } = {},
) => {
  const { server, port } = await listenForFetch(
    createApp(pool, {
      workoutMemoUrl: 'url' in options ? options.url : 'http://workout-memo-api:3101',
      workoutMemoFetch,
    }),
  );
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/workout-memo/${options.date ?? '2026-11-04'}`,
      { headers: options.cookie ? { cookie: options.cookie } : {} },
    );
    return { status: response.status, data: (await response.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const journals = [
  {
    id: 7,
    title: 'Push day',
    notes: 'not needed',
    sets: [
      { exercise: 'Bench press', weight: '60.00', reps: 8 },
      { exercise: 'Bench press', weight: '62.5', reps: 6 },
      { exercise: 'Bench press', weight: 80, reps: 1, completed: false },
      { exercise: 'Dips', weight: 0, reps: 10, completed: true },
    ],
  },
];

test('the day is read from workout-memo with the same session cookie and summarized', async () => {
  const seen: Seen[] = [];
  const { status, data } = await call(
    (url, init) => {
      seen.push({ url, cookie: (init.headers as Record<string, string>).cookie });
      return Promise.resolve(new Response(JSON.stringify(journals)));
    },
    { cookie: 'sirloinbh.session=abc' },
  );
  assert.equal(status, 200);
  assert.deepEqual(seen, [
    {
      url: 'http://workout-memo-api:3101/api/workouts?from=2026-11-04&to=2026-11-04',
      cookie: 'sirloinbh.session=abc',
    },
  ]);
  assert.deepEqual(data, {
    state: 'ok',
    workouts: [
      {
        id: 7,
        title: 'Push day',
        // Planned sets do not count, and weights that arrive as strings are read as numbers.
        exercises: [
          { exercise: 'Bench press', sets: 2, topWeightKg: 62.5 },
          { exercise: 'Dips', sets: 1, topWeightKg: 0 },
        ],
      },
    ],
  });
});

test('a day without workouts is an empty list, not an error', async () => {
  const { data } = await call(() => Promise.resolve(new Response('[]')));
  assert.deepEqual(data, { state: 'ok', workouts: [] });
});

test('every way workout-memo can fail is the quiet unavailable state', async () => {
  const failures: (() => Promise<Response>)[] = [
    () => Promise.reject(new Error('connect ECONNREFUSED')),
    () => Promise.resolve(new Response('{}', { status: 401 })),
    () => Promise.resolve(new Response('{}', { status: 500 })),
    () => Promise.resolve(new Response('not json')),
    () => Promise.resolve(new Response(JSON.stringify({ not: 'a list' }))),
  ];
  for (const fail of failures) {
    const { status, data } = await call(fail);
    assert.equal(status, 200);
    assert.deepEqual(data, { state: 'unavailable' });
  }
});

test('without WORKOUT_MEMO_URL workout-memo is not called at all', async () => {
  let called = false;
  const { data } = await call(
    () => {
      called = true;
      return Promise.resolve(new Response('[]'));
    },
    { url: undefined },
  );
  assert.deepEqual(data, { state: 'unavailable' });
  assert.equal(called, false);
});

test('a bad date is a 400 and workout-memo is not asked', async () => {
  let called = false;
  const { status } = await call(
    () => {
      called = true;
      return Promise.resolve(new Response('[]'));
    },
    { date: '2026-02-30' },
  );
  assert.equal(status, 400);
  assert.equal(called, false);
});
