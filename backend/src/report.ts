import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';

const reportQuery = z.object({
  period: z.enum(['week', 'month'], { error: '기간은 week 또는 month로 보내 주세요' }),
  date: z
    .string({ error: '날짜가 올바르지 않습니다' })
    .refine(isRealDate, '날짜가 올바르지 않습니다'),
});

type Span = { from: string; to: string };

const shiftDay = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const spanOf = (period: 'week' | 'month', date: string) => periodsOf(date)[period];

const datesIn = ({ from, to }: Span) => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) dates.push(date);
  return dates;
};

// pg returns NUMERIC and bigint counts as strings.
const toNumber = (value: string | null) => (value === null ? null : Number(value));
const rounded = (value: string | null, digits = 0) =>
  value === null ? null : Number(Number(value).toFixed(digits));

type SummaryRow = {
  sleep_days: string;
  sleep_average: string | null;
  meal_days: string;
  calorie_days: string;
  calorie_average: string | null;
  drink_recorded_days: string;
  drinking_days: string;
  smoking_days: string;
  cigarettes: string | null;
  diet_days: string;
  diet_kept: string;
  sleep_check_days: string;
  sleep_good: string;
};

// Every average and rate is over the days that have that record, so a day with nothing recorded
// never pulls an average down. A day of meals counts for calories only when every entry's
// calories are known; days with an unknown entry are counted apart.
const summarySql = `
  WITH sleep AS (
    SELECT count(*) AS sleep_days, avg(duration_minutes) AS sleep_average
    FROM sleep_records WHERE sleep_date BETWEEN $1 AND $2
  ), meal_days AS (
    SELECT entry_date, sum(round(calories * servings, 2)) AS calories,
      bool_and(calories IS NOT NULL) AS complete
    FROM meal_entries WHERE entry_date BETWEEN $1 AND $2
    GROUP BY entry_date
  ), meals AS (
    SELECT count(*) AS meal_days,
      count(*) FILTER (WHERE complete) AS calorie_days,
      avg(calories) FILTER (WHERE complete) AS calorie_average
    FROM meal_days
  ), habits AS (
    SELECT count(*) FILTER (WHERE drinks_recorded) AS drink_recorded_days,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM habit_drinks d WHERE d.record_date = habit_days.record_date
      )) AS drinking_days,
      count(cigarettes) AS smoking_days,
      sum(cigarettes) AS cigarettes
    FROM habit_days WHERE record_date BETWEEN $1 AND $2
  ), checks AS (
    SELECT count(diet_kept) AS diet_days, count(*) FILTER (WHERE diet_kept) AS diet_kept,
      count(sleep_good) AS sleep_check_days, count(*) FILTER (WHERE sleep_good) AS sleep_good
    FROM day_checks WHERE record_date BETWEEN $1 AND $2
  )
  SELECT * FROM sleep, meals, habits, checks`;

const readSummary = async (db: Db, span: Span) => {
  const { rows } = await db.query<SummaryRow>(summarySql, [span.from, span.to]);
  const row = rows[0];
  const smokingDays = Number(row.smoking_days);
  return {
    ...span,
    sleep: { days: Number(row.sleep_days), averageMinutes: rounded(row.sleep_average) },
    calories: {
      days: Number(row.calorie_days),
      incompleteDays: Number(row.meal_days) - Number(row.calorie_days),
      average: rounded(row.calorie_average),
    },
    drinking: { days: Number(row.drink_recorded_days), drinkingDays: Number(row.drinking_days) },
    smoking: {
      days: smokingDays,
      cigarettes: toNumber(row.cigarettes),
      averagePerDay: smokingDays ? Number((Number(row.cigarettes) / smokingDays).toFixed(1)) : null,
    },
    diet: { days: Number(row.diet_days), yes: Number(row.diet_kept) },
    sleepGood: { days: Number(row.sleep_check_days), yes: Number(row.sleep_good) },
  };
};

type DayRow = {
  date: string;
  sleep_minutes: number | null;
  calories: string | null;
  drank: boolean | null;
};

// One row per calendar day of the span, so a day without a record is a gap, never a zero.
const readDays = async (db: Db, span: Span) => {
  const { rows } = await db.query<DayRow>(
    `SELECT d.date::text AS date, s.duration_minutes AS sleep_minutes,
       CASE WHEN m.complete THEN m.calories END AS calories,
       CASE WHEN h.drinks_recorded THEN EXISTS (
         SELECT 1 FROM habit_drinks x WHERE x.record_date = d.date
       ) END AS drank
     FROM unnest($1::date[]) AS d(date)
     LEFT JOIN sleep_records s ON s.sleep_date = d.date
     LEFT JOIN (
       SELECT entry_date, sum(round(calories * servings, 2)) AS calories,
         bool_and(calories IS NOT NULL) AS complete
       FROM meal_entries WHERE entry_date BETWEEN $2 AND $3 GROUP BY entry_date
     ) m ON m.entry_date = d.date
     LEFT JOIN habit_days h ON h.record_date = d.date
     ORDER BY d.date`,
    // The meal totals are limited to the span: Postgres would not push the join's date into the
    // grouped subquery, and the whole history would be summed on every request.
    [datesIn(span), span.from, span.to],
  );
  return rows.map((row) => ({
    date: row.date,
    sleepMinutes: row.sleep_minutes,
    calories: rounded(row.calories),
    drank: row.drank,
  }));
};

type AfterRow = { drank: boolean; nights: string; average: string | null };

// Sleep is filed under the day of waking, so the night after day D is the sleep dated D + 1.
// Only nights whose previous day's drinking was recorded take part.
const readSleepAfterDrinking = async (db: Db, span: Span) => {
  const { rows } = await db.query<AfterRow>(
    `SELECT EXISTS (
         SELECT 1 FROM habit_drinks x WHERE x.record_date = h.record_date
       ) AS drank,
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
      nights: row ? Number(row.nights) : 0,
      averageMinutes: row ? rounded(row.average) : null,
    };
  };
  return { afterDrinking: group(true), afterNoDrinking: group(false) };
};

export function reportRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

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
      snapshotRead,
    );
    res.json(report);
  });

  return router;
}
