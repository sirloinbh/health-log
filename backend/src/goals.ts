import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate, parseDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';

const goalItems = ['calories', 'protein', 'sleep', 'sober_days'] as const;
type GoalItem = (typeof goalItems)[number];

// The same ranges as the database's goals_target_range.
const ranges: Record<GoalItem, { label: string; min: number; max: number; unit: string }> = {
  calories: { label: '칼로리 목표', min: 100, max: 10_000, unit: 'kcal' },
  protein: { label: '단백질 목표', min: 1, max: 1000, unit: 'g' },
  sleep: { label: '수면 목표', min: 60, max: 1440, unit: '분' },
  sober_days: { label: '금주 목표', min: 1, max: 7, unit: '일' },
};

const parseItem = (value: unknown) => {
  const parsed = z.enum(goalItems).safeParse(value);
  if (!parsed.success) throw new HttpError(404, '없는 목표 항목입니다');
  return parsed.data;
};

const goalInput = (item: GoalItem) => {
  const { label, min, max, unit } = ranges[item];
  return z.object(
    {
      from: z
        .string({ error: '적용 시작일을 골라 주세요' })
        .refine(isRealDate, '적용 시작일이 올바르지 않습니다'),
      // null: the goal is off from this date.
      target: z
        .number({ error: `${label}는 숫자로 입력해 주세요` })
        .int(`${label}는 정수로 입력해 주세요`)
        .min(min, `${label}는 ${min}${unit} 이상으로 입력해 주세요`)
        .max(max, `${label}는 ${max}${unit} 이하로 입력해 주세요`)
        .nullable(),
    },
    { error: '요청 본문이 올바르지 않습니다' },
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

type GoalRow = { item: GoalItem; effective_from: string; target: number | null };
const toGoal = (row: GoalRow) => ({ item: row.item, from: row.effective_from, target: row.target });

/** The goal in force on `date` for each item, off ones included so callers can tell them apart. */
const goalsOn = async (db: Db, date: string, soberDate: string) => {
  const { rows } = await db.query<GoalRow>(
    `SELECT DISTINCT ON (item) item, effective_from, target FROM goals
     WHERE effective_from <= CASE WHEN item = 'sober_days' THEN $2::date ELSE $1::date END
     ORDER BY item, effective_from DESC`,
    [date, soberDate],
  );
  const found = new Map(rows.map((row) => [row.item, row]));
  return Object.fromEntries(
    goalItems.map((item) => {
      const row = found.get(item);
      // A goal turned off is no goal at all for judging.
      return [
        item,
        row && row.target !== null ? { from: row.effective_from, target: row.target } : null,
      ];
    }),
  ) as Record<GoalItem, { from: string; target: number } | null>;
};

const readGoals = async (db: Db, today: string) => {
  const { rows } = await db.query<GoalRow>(
    'SELECT item, effective_from, target FROM goals ORDER BY item, effective_from DESC',
  );
  // Sober days are judged by the goal on the week's Sunday, so "current" for them is that one too:
  // the settings page then shows the number this week is judged by (#107).
  const { week } = periodsOf(today);
  return {
    today,
    week,
    current: await goalsOn(db, today, week.to),
    history: rows.map(toGoal),
  };
};

type MealRow = {
  entries: string;
  calories: string | null;
  calories_missing: string;
  protein: string | null;
  protein_missing: string;
};
type WeekRow = { recorded_days: string; sober_days: string };

const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

const readDay = async (db: Db, date: string) => {
  const { week } = periodsOf(date);
  // The week's goal is the one in force on its last day, so a whole week answers to one number.
  const goals = await goalsOn(db, date, week.to);
  // Rounded per entry like the meal list, so the total here is the total shown there.
  const meals = (
    await db.query<MealRow>(
      `SELECT count(*) AS entries,
         sum(round(calories * servings, 2)) AS calories,
         count(*) FILTER (WHERE calories IS NULL) AS calories_missing,
         sum(round(protein * servings, 2)) AS protein,
         count(*) FILTER (WHERE protein IS NULL) AS protein_missing
       FROM meal_entries WHERE entry_date = $1`,
      [date],
    )
  ).rows[0];
  const sleep = await db.query<{ duration_minutes: number }>(
    'SELECT duration_minutes FROM sleep_records WHERE sleep_date = $1',
    [date],
  );
  // A sober day is one whose drinking was recorded with no drink in it.
  const habits = (
    await db.query<WeekRow>(
      `SELECT count(*) FILTER (WHERE drinks_recorded) AS recorded_days,
         count(*) FILTER (WHERE drinks_recorded AND NOT EXISTS (
           SELECT 1 FROM habit_drinks d WHERE d.record_date = habit_days.record_date
         )) AS sober_days
       FROM habit_days WHERE record_date BETWEEN $1 AND $2`,
      [week.from, week.to],
    )
  ).rows[0];
  const checks = await db.query<{ diet_kept: boolean | null; sleep_good: boolean | null }>(
    'SELECT diet_kept, sleep_good FROM day_checks WHERE record_date = $1',
    [date],
  );

  const entries = Number(meals.entries);
  const calories = {
    entries,
    total: optionalNumber(meals.calories),
    missing: Number(meals.calories_missing),
  };
  const protein = {
    entries,
    total: optionalNumber(meals.protein),
    missing: Number(meals.protein_missing),
  };
  const minutes = sleep.rows[0]?.duration_minutes ?? null;
  const sober = {
    from: week.from,
    to: week.to,
    recordedDays: Number(habits.recorded_days),
    soberDays: Number(habits.sober_days),
  };
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
    ],
    // The day's own checks (#37), shown beside the automatic verdicts. null: not checked.
    checks: checks.rows[0]
      ? { dietKept: checks.rows[0].diet_kept, sleepGood: checks.rows[0].sleep_good }
      : null,
  };
};

export function goalsRouter(pool: Pool, today: () => string, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/', async (_req, res) => {
    res.json(await inTransaction(pool, (client) => readGoals(client, today()), snapshotRead));
  });

  router.get('/days/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the goals and every record they judge.
    res.json(await inTransaction(pool, (client) => readDay(client, date), snapshotRead));
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
    if (!rowCount) throw new HttpError(404, '목표 변경 기록을 찾을 수 없습니다');
    res.status(204).end();
  });

  return router;
}
