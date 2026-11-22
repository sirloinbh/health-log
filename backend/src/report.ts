import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { periodsOf } from './contract.js';
import { isRealDate, shiftDay } from './dates.js';
import { type Db, inTransaction, snapshotRead } from './db.js';

export const reportQuery = z.object({
  period: z.enum(['week', 'month'], { error: 'The period must be week or month' }),
  date: z.string({ error: 'The date is not valid' }).refine(isRealDate, 'The date is not valid'),
});

type Span = { from: string; to: string };

const spanOf = (period: 'week' | 'month', date: string) => periodsOf(date)[period];

const datesIn = ({ from, to }: Span) => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) dates.push(date);
  return dates;
};

const rounded = (value: string | null, digits = 0) =>
  value === null ? null : Number(Number(value).toFixed(digits));

// count() and sum() of an integer column are int8, which setInt8Parser already returns as a
// number; avg() is NUMERIC, which stays a string until `rounded`.
type SummaryRow = {
  sleepDays: number;
  sleepAverage: string | null;
  mealDays: number;
  calorieDays: number;
  calorieAverage: string | null;
  drinkRecordedDays: number;
  drinkingDays: number;
  smokingDays: number;
  cigarettes: number | null;
  dietDays: number;
  dietKept: number;
  sleepCheckDays: number;
  sleepGood: number;
};

// Shared SQL pieces (#195). Only these constant placeholders and column names are put into the
// text, never a value from the request.

/**
 * One row per day with meals from `from` to `to` (the query's placeholders): the day's calories,
 * each entry rounded as the day screen adds them, and whether every entry's calories are known. The
 * summary and the chart both read their days from here, so the average and the bars cannot
 * disagree. The span limit sits inside: Postgres would not push a join's date into the grouped
 * query, and the whole history would be summed on every request.
 */
const mealDaysSql = (from: string, to: string) => `
  SELECT entry_date, sum(round(calories * servings, 2)) AS calories,
    bool_and(calories IS NOT NULL) AS complete
  FROM meal_entries WHERE entry_date BETWEEN ${from} AND ${to}
  GROUP BY entry_date`;

/** Whether any drink is recorded on the day in the column `day` of the outer query. */
const drankSql = (day: string) =>
  `EXISTS (SELECT 1 FROM habit_drinks x WHERE x.record_date = ${day})`;

// Every average and rate is over the days that have that record, so a day with nothing recorded
// never pulls an average down. A day of meals counts for calories only when every entry's
// calories are known; days with an unknown entry are counted apart.
const summarySql = `
  WITH sleep AS (
    SELECT count(*) AS "sleepDays", avg(duration_minutes) AS "sleepAverage"
    FROM sleep_records WHERE sleep_date BETWEEN $1 AND $2
  ), meal_days AS (${mealDaysSql('$1', '$2')}
  ), meals AS (
    SELECT count(*) AS "mealDays",
      count(*) FILTER (WHERE complete) AS "calorieDays",
      avg(calories) FILTER (WHERE complete) AS "calorieAverage"
    FROM meal_days
  ), habits AS (
    SELECT count(*) FILTER (WHERE drinks_recorded) AS "drinkRecordedDays",
      count(*) FILTER (WHERE ${drankSql('habit_days.record_date')}) AS "drinkingDays",
      count(cigarettes) AS "smokingDays",
      sum(cigarettes) AS cigarettes
    FROM habit_days WHERE record_date BETWEEN $1 AND $2
  ), checks AS (
    SELECT count(diet_kept) AS "dietDays", count(*) FILTER (WHERE diet_kept) AS "dietKept",
      count(sleep_good) AS "sleepCheckDays", count(*) FILTER (WHERE sleep_good) AS "sleepGood"
    FROM day_checks WHERE record_date BETWEEN $1 AND $2
  )
  SELECT * FROM sleep, meals, habits, checks`;

const readSummary = async (db: Db, span: Span) => {
  const { rows } = await db.query<SummaryRow>(summarySql, [span.from, span.to]);
  const row = rows[0];
  const { smokingDays, cigarettes } = row;
  return {
    ...span,
    sleep: { days: row.sleepDays, averageMinutes: rounded(row.sleepAverage) },
    calories: {
      days: row.calorieDays,
      incompleteDays: row.mealDays - row.calorieDays,
      average: rounded(row.calorieAverage),
    },
    drinking: { days: row.drinkRecordedDays, drinkingDays: row.drinkingDays },
    smoking: {
      days: smokingDays,
      cigarettes,
      averagePerDay: smokingDays ? Number((Number(cigarettes) / smokingDays).toFixed(1)) : null,
    },
    diet: { days: row.dietDays, yes: row.dietKept },
    sleepGood: { days: row.sleepCheckDays, yes: row.sleepGood },
  };
};

type DayRow = {
  date: string;
  sleepMinutes: number | null;
  calories: string | null;
  drank: boolean | null;
};

// One row per calendar day of the span, so a day without a record is a gap, never a zero.
const readDays = async (db: Db, span: Span) => {
  const { rows } = await db.query<DayRow>(
    `SELECT d.date::text AS date, s.duration_minutes AS "sleepMinutes",
       CASE WHEN m.complete THEN m.calories END AS calories,
       CASE WHEN h.drinks_recorded THEN ${drankSql('d.date')} END AS drank
     FROM unnest($1::date[]) AS d(date)
     LEFT JOIN sleep_records s ON s.sleep_date = d.date
     LEFT JOIN (${mealDaysSql('$2', '$3')}) m ON m.entry_date = d.date
     LEFT JOIN habit_days h ON h.record_date = d.date
     ORDER BY d.date`,
    [datesIn(span), span.from, span.to],
  );
  // A day's calories are a NUMERIC sum, shown as a whole number like the summary's average.
  return rows.map((row) => ({ ...row, calories: rounded(row.calories) }));
};

type AfterRow = { drank: boolean; nights: number; average: string | null };

// Sleep is filed under the day of waking, so the night after day D is the sleep dated D + 1.
// Only nights whose previous day's drinking was recorded take part.
const readSleepAfterDrinking = async (db: Db, span: Span) => {
  const { rows } = await db.query<AfterRow>(
    `SELECT ${drankSql('h.record_date')} AS drank,
       count(*) AS nights, avg(s.duration_minutes) AS average
     FROM sleep_records s
     JOIN habit_days h ON h.record_date = s.sleep_date - 1 AND h.drinks_recorded
     WHERE s.sleep_date BETWEEN $1 AND $2
     GROUP BY 1`,
    [shiftDay(span.from, 1), shiftDay(span.to, 1)],
  );
  const group = (drank: boolean) => {
    const row = rows.find((each) => each.drank === drank);
    return {
      nights: row?.nights ?? 0,
      averageMinutes: row ? rounded(row.average) : null,
    };
  };
  return { afterDrinking: group(true), afterNoDrinking: group(false) };
};

export function reportRouter(pool: Pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { period, date } = reportQuery.parse(req.query);
    const current = spanOf(period, date);
    // The period just before this one, compared side by side.
    const previous = spanOf(period, shiftDay(current.from, -1));
    const report = await inTransaction(
      pool,
      async (client) => ({
        period,
        current: await readSummary(client, current),
        previous: await readSummary(client, previous),
        days: await readDays(client, current),
        sleepAfterDrinking: await readSleepAfterDrinking(client, current),
      }),
      { setup: snapshotRead },
    );
    res.json(report);
  });

  return router;
}
