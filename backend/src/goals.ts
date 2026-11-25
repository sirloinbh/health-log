import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { periodsOf } from './contract.js';
import { isRealDate, parseDate } from './dates.js';
import { type Db, inTransaction, snapshotRead } from './db.js';
import { optionalNumber } from './numbers.js';
import { HttpError } from './standard/http.js';

const goalItems = ['calories', 'protein', 'sleep', 'sober_days', 'last_meal'] as const;
type GoalItem = (typeof goalItems)[number];

/** Minutes from midnight as "HH:MM": 1260 is "21:00". */
export const clockText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// The same ranges as the database's goals_target_range. `units` is the plural when it differs.
const ranges: Record<
  GoalItem,
  {
    label: string;
    min: number;
    max: number;
    unit: string;
    units?: string;
    show?: (n: number) => string;
  }
> = {
  calories: { label: 'Calorie goal', min: 100, max: 10_000, unit: 'kcal' },
  protein: { label: 'Protein goal', min: 1, max: 1000, unit: 'g' },
  sleep: { label: 'Sleep goal', min: 60, max: 1440, unit: 'min' },
  sober_days: { label: 'Alcohol-free goal', min: 1, max: 7, unit: 'day', units: 'days' },
  // Minutes from midnight, said as a clock time: 1260 is 21:00.
  last_meal: { label: 'Last meal time goal', min: 1, max: 1439, unit: 'min', show: clockText },
};

/** "1 day", "7 days", "100 kcal" (#207). */
const amountText = (value: number, unit: string, units = unit) =>
  `${value} ${value === 1 ? unit : units}`;

const parseItem = (value: unknown) => {
  const parsed = z.enum(goalItems).safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'Unknown goal item');
  return parsed.data;
};

const goalInput = (item: GoalItem) => {
  const { label, min, max, unit, units, show } = ranges[item];
  const amount = (value: number) => show?.(value) ?? amountText(value, unit, units);
  return z.object(
    {
      from: z
        .string({ error: 'Choose a start date' })
        .refine(isRealDate, 'The start date is not valid'),
      // null: the goal is off from this date.
      target: z
        .number({ error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(min, `${label} must be at least ${amount(min)}`)
        .max(max, `${label} must be at most ${amount(max)}`)
        .nullable(),
    },
    { error: 'The request body is not valid' },
  );
};

/**
 * met / missed: decided. unknown: there is a record, but not enough of it to decide.
 * none: nothing recorded, which is never read as missed.
 */
export type Status = 'met' | 'missed' | 'unknown' | 'none';

type Sum = { entries: number; total: number | null; missing: number };

/** A daily cap: going over it with the known part alone is already a miss. */
export const judgeAtMost = (target: number, { entries, total, missing }: Sum): Status => {
  if (entries === 0) return 'none';
  if ((total ?? 0) > target) return 'missed';
  return missing > 0 ? 'unknown' : 'met';
};

/** A daily floor: reaching it with the known part alone is already met. */
export const judgeAtLeast = (target: number, { entries, total, missing }: Sum): Status => {
  if (entries === 0) return 'none';
  if ((total ?? 0) >= target) return 'met';
  return missing > 0 ? 'unknown' : 'missed';
};

export const judgeSleep = (target: number, minutes: number | null): Status =>
  minutes === null ? 'none' : minutes >= target ? 'met' : 'missed';

type Week = { recordedDays: number; soberDays: number };

/** Days left unrecorded could still go either way, so a week stays open until they cannot. */
export const judgeSoberWeek = (target: number, { recordedDays, soberDays }: Week): Status => {
  if (recordedDays === 0) return 'none';
  if (soberDays >= target) return 'met';
  const drinkingDays = recordedDays - soberDays;
  return drinkingDays > 7 - target ? 'missed' : 'unknown';
};

type Slot = { meal: string; time: number | null };

/**
 * "No eating after" the limit, from the time of each meal slot that has an entry. A slot timed
 * after the limit is a miss whatever else is missing. Otherwise a slot with no time could still
 * have been late, so the day is undetermined. Eating exactly at the limit is allowed.
 */
export const judgeLastMeal = (limit: number, slots: Slot[]): Status => {
  if (slots.length === 0) return 'none';
  if (slots.some(({ time }) => time !== null && time > limit)) return 'missed';
  return slots.some(({ time }) => time === null) ? 'unknown' : 'met';
};

type Goal = { item: GoalItem; from: string; target: number | null };

/** The goal in force on `date` for each item, off ones included so callers can tell them apart. */
const goalsOn = async (db: Db, date: string, soberDate: string) => {
  const { rows } = await db.query<Goal>(
    `SELECT DISTINCT ON (item) item, effective_from AS "from", target FROM goals
     WHERE effective_from <= CASE WHEN item = 'sober_days' THEN $2::date ELSE $1::date END
     ORDER BY item, effective_from DESC`,
    [date, soberDate],
  );
  const found = new Map(rows.map((row) => [row.item, row]));
  return Object.fromEntries(
    goalItems.map((item) => {
      const row = found.get(item);
      // A goal turned off is no goal at all for judging.
      return [item, row && row.target !== null ? { from: row.from, target: row.target } : null];
    }),
  ) as Record<GoalItem, { from: string; target: number } | null>;
};

const readGoals = async (db: Db, today: string) => {
  const { rows } = await db.query<Goal>(
    'SELECT item, effective_from AS "from", target FROM goals ORDER BY item, effective_from DESC',
  );
  // Sober days are judged by the goal on the week's Sunday, so "current" for them is that one too:
  // the settings page then shows the number this week is judged by (#107).
  const { week } = periodsOf(today);
  return {
    today,
    week,
    current: await goalsOn(db, today, week.to),
    history: rows,
  };
};

// count() is int8, which setInt8Parser already returns as a number; a NUMERIC sum is a string.
type MealSums = {
  entries: number;
  calories: string | null;
  caloriesMissing: number;
  protein: string | null;
  proteinMissing: number;
};

const readDay = async (db: Db, date: string) => {
  const { week } = periodsOf(date);
  // The week's goal is the one in force on its last day, so a whole week answers to one number.
  const goals = await goalsOn(db, date, week.to);
  // Rounded per entry like the meal list, so the total here is the total shown there.
  const meals = (
    await db.query<MealSums>(
      `SELECT count(*) AS entries,
         sum(round(calories * servings, 2)) AS calories,
         count(*) FILTER (WHERE calories IS NULL) AS "caloriesMissing",
         sum(round(protein * servings, 2)) AS protein,
         count(*) FILTER (WHERE protein IS NULL) AS "proteinMissing"
       FROM meal_entries WHERE entry_date = $1`,
      [date],
    )
  ).rows[0];
  // Only slots that have an entry count; each with its recorded time in minutes, or null.
  const slots = (
    await db.query<{ meal: string; time: number | null }>(
      `SELECT e.meal, extract(hour FROM t.eaten_time)::int * 60 + extract(minute FROM t.eaten_time)::int AS "time"
       FROM (SELECT DISTINCT meal FROM meal_entries WHERE entry_date = $1) e
       LEFT JOIN meal_times t ON t.entry_date = $1 AND t.meal = e.meal
       ORDER BY e.meal`,
      [date],
    )
  ).rows;
  const sleep = await db.query<{ minutes: number }>(
    'SELECT duration_minutes AS minutes FROM sleep_records WHERE sleep_date = $1',
    [date],
  );
  // A sober day is one whose drinking was recorded with no drink in it.
  const habits = (
    await db.query<Week>(
      `SELECT count(*) FILTER (WHERE drinks_recorded) AS "recordedDays",
         count(*) FILTER (WHERE drinks_recorded AND NOT EXISTS (
           SELECT 1 FROM habit_drinks d WHERE d.record_date = habit_days.record_date
         )) AS "soberDays"
       FROM habit_days WHERE record_date BETWEEN $1 AND $2`,
      [week.from, week.to],
    )
  ).rows[0];
  const checks = await db.query<{ dietKept: boolean | null; sleepGood: boolean | null }>(
    `SELECT diet_kept AS "dietKept", sleep_good AS "sleepGood"
     FROM day_checks WHERE record_date = $1`,
    [date],
  );

  const { entries } = meals;
  const calories = {
    entries,
    total: optionalNumber(meals.calories),
    missing: meals.caloriesMissing,
  };
  const protein = { entries, total: optionalNumber(meals.protein), missing: meals.proteinMissing };
  const minutes = sleep.rows[0]?.minutes ?? null;
  const sober = { from: week.from, to: week.to, ...habits };
  const judged = <T>(goal: { target: number } | null, judge: (target: number) => T) =>
    goal ? judge(goal.target) : null;

  return {
    date,
    items: [
      {
        item: 'calories',
        goal: goals.calories,
        status: judged(goals.calories, (target) => judgeAtMost(target, calories)),
        actual: calories,
      },
      {
        item: 'protein',
        goal: goals.protein,
        status: judged(goals.protein, (target) => judgeAtLeast(target, protein)),
        actual: protein,
      },
      {
        item: 'sleep',
        goal: goals.sleep,
        status: judged(goals.sleep, (target) => judgeSleep(target, minutes)),
        actual: { minutes },
      },
      {
        item: 'sober_days',
        goal: goals.sober_days,
        status: judged(goals.sober_days, (target) => judgeSoberWeek(target, sober)),
        actual: sober,
      },
      {
        item: 'last_meal',
        goal: goals.last_meal,
        status: judged(goals.last_meal, (target) => judgeLastMeal(target, slots)),
        actual: { slots },
      },
    ],
    // The day's own checks (#37), shown beside the automatic verdicts. null: not checked.
    checks: checks.rows[0] ?? null,
  };
};

export function goalsRouter(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(
      await inTransaction(pool, (client) => readGoals(client, today()), { setup: snapshotRead }),
    );
  });

  router.get('/days/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the goals and every record they judge.
    res.json(await inTransaction(pool, (client) => readDay(client, date), { setup: snapshotRead }));
  });

  // Setting a goal from a date that already has one replaces that one; other dates keep theirs.
  router.put('/:item', async (req, res) => {
    const item = parseItem(req.params.item);
    const input = goalInput(item).parse(req.body);
    const goals = await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO goals (item, effective_from, target) VALUES ($1, $2, $3)
         ON CONFLICT (item, effective_from) DO UPDATE SET
           target = EXCLUDED.target,
           updated_at = now()`,
        [item, input.from, input.target],
      );
      return readGoals(client, today());
    });
    res.json(goals);
  });

  // Removes one change, so the goal before it holds again from that date.
  router.delete('/:item/:from', async (req, res) => {
    const item = parseItem(req.params.item);
    const from = parseDate(req.params.from);
    const { rowCount } = await pool.query(
      'DELETE FROM goals WHERE item = $1 AND effective_from = $2',
      [item, from],
    );
    if (!rowCount) throw new HttpError(404, 'Goal change record not found');
    res.status(204).end();
  });

  return router;
}
