import { Router } from 'express';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';

// What the daily screen needs from one workout-memo journal (#333). Anything else it sends is dropped.
// workout-memo returns weight as NUMERIC, which can arrive as a string, so both are read.
const amount = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const journalList = z.array(
  z.object({
    id: z.number().int(),
    title: z.string(),
    sets: z.array(
      z.object({
        exercise: z.string(),
        weight: amount,
        reps: z.number().int(),
        // A missing state means the set was performed (older workout-memo clients).
        completed: z.boolean().optional().default(true),
      }),
    ),
  }),
);

const timeoutMs = 3000;
// A day's journals are few; this stops a wrong answer from filling the screen.
const maxJournals = 20;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** One journal as the screen shows it: per exercise, the performed sets and the heaviest weight. */
const summarize = (journal: z.infer<typeof journalList>[number]) => {
  const exercises = new Map<string, { exercise: string; sets: number; topWeightKg: number }>();
  for (const set of journal.sets) {
    if (!set.completed) continue;
    const found = exercises.get(set.exercise) ?? {
      exercise: set.exercise,
      sets: 0,
      topWeightKg: 0,
    };
    found.sets += 1;
    found.topWeightKg = Math.max(found.topWeightKg, set.weight);
    exercises.set(set.exercise, found);
  }
  return { id: journal.id, title: journal.title, exercises: [...exercises.values()] };
};

/**
 * Read-only: the workouts workout-memo holds for a day. The user's own session cookie is forwarded, so
 * workout-memo checks the same sign-in; the address comes from the server setting, never from the request.
 * When the setting is empty or workout-memo cannot answer, the state is "unavailable" and the screen says so
 * quietly instead of failing.
 */
export function workoutMemoRouter(baseUrl: string | undefined, fetchImpl: Fetch = fetch) {
  const router = Router();

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    if (!baseUrl) {
      res.json({ state: 'unavailable' });
      return;
    }
    try {
      const url = new URL('/api/workouts', baseUrl);
      url.searchParams.set('from', date);
      url.searchParams.set('to', date);
      const answer = await fetchImpl(url.toString(), {
        headers: req.headers.cookie ? { cookie: req.headers.cookie } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!answer.ok) throw new Error(`workout-memo answered ${answer.status}`);
      const journals = journalList.parse(await answer.json());
      res.json({ state: 'ok', workouts: journals.slice(0, maxJournals).map(summarize) });
    } catch (error) {
      // The reason stays in the log; the screen only needs to know it could not be read.
      console.warn(
        JSON.stringify({ event: 'workout_memo_unavailable', message: (error as Error).message }),
      );
      res.json({ state: 'unavailable' });
    }
  });

  return router;
}
