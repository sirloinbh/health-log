import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { parseDate } from './dates.js';
import { type Db, inTransaction, periodsOf, snapshotRead } from './day-records.js';
import { rateLimitOptions, type RateLimitSettings } from './rate-limit.js';
import { HttpError } from './standard/http.js';

// null: not checked. Never read as false.
const check = (label: string) =>
  z
    .boolean({ error: `${label}은(는) 예, 아니오 중 하나로 보내 주세요` })
    .nullable()
    .default(null);

const checkInput = z
  .object(
    {
      dietKept: check('식단 지킴'),
      sleepGood: check('수면 만족'),
      memo: z
        .string({ error: '메모가 올바르지 않습니다' })
        .trim()
        .max(200, '메모는 200자 이하로 입력해 주세요')
        // PostgreSQL text cannot hold U+0000; refused here it is a 400, not a 500.
        .refine((value) => !value.includes('\u0000'), '메모에 쓸 수 없는 문자가 있습니다')
        .nullable()
        .default(null)
        .transform((value) => value || null),
    },
    { error: '요청 본문이 올바르지 않습니다' },
  )
  .superRefine((input, ctx) => {
    if (Object.values(input).every((value) => value === null)) {
      ctx.addIssue({ code: 'custom', message: '체크나 메모 중 하나 이상 입력해 주세요' });
    }
  });

type CheckRow = {
  record_date: string;
  diet_kept: boolean | null;
  sleep_good: boolean | null;
  memo: string | null;
};

const toRecord = (row: CheckRow) => ({
  date: row.record_date,
  dietKept: row.diet_kept,
  sleepGood: row.sleep_good,
  memo: row.memo,
});

type SummaryRow = { diet_days: string; diet_kept: string; sleep_days: string; sleep_good: string };

const readSummary = async (db: Db, { from, to }: { from: string; to: string }) => {
  // Each check counts only the days it was answered, so an unchecked day lowers no rate.
  const { rows } = await db.query<SummaryRow>(
    `SELECT
       count(diet_kept) AS diet_days,
       count(*) FILTER (WHERE diet_kept) AS diet_kept,
       count(sleep_good) AS sleep_days,
       count(*) FILTER (WHERE sleep_good) AS sleep_good
     FROM day_checks WHERE record_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const row = rows[0];
  return {
    from,
    to,
    diet: { days: Number(row.diet_days), yes: Number(row.diet_kept) },
    sleep: { days: Number(row.sleep_days), yes: Number(row.sleep_good) },
  };
};

const readDay = async (db: Db, date: string) => {
  const { week, month } = periodsOf(date);
  const { rows } = await db.query<CheckRow>(
    'SELECT record_date, diet_kept, sleep_good, memo FROM day_checks WHERE record_date = $1',
    [date],
  );
  return {
    record: rows[0] ? toRecord(rows[0]) : null,
    week: await readSummary(db, week),
    month: await readSummary(db, month),
  };
};

export function checksRouter(pool: Pool, limits: RateLimitSettings) {
  const router = Router();
  router.use(rateLimit(rateLimitOptions(limits)));

  router.get('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    // One snapshot for the record and both rates.
    res.json(await inTransaction(pool, (client) => readDay(client, date), snapshotRead));
  });

  router.put('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const input = checkInput.parse(req.body);
    // The save and the rates it answers with succeed together.
    const day = await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO day_checks (record_date, diet_kept, sleep_good, memo) VALUES ($1, $2, $3, $4)
         ON CONFLICT (record_date) DO UPDATE SET
           diet_kept = EXCLUDED.diet_kept,
           sleep_good = EXCLUDED.sleep_good,
           memo = EXCLUDED.memo,
           updated_at = now()`,
        [date, input.dietKept, input.sleepGood, input.memo],
      );
      return readDay(client, date);
    });
    res.json(day);
  });

  router.delete('/:date', async (req, res) => {
    const date = parseDate(req.params.date);
    const { rowCount } = await pool.query('DELETE FROM day_checks WHERE record_date = $1', [date]);
    if (!rowCount) throw new HttpError(404, '하루 체크를 찾을 수 없습니다');
    res.status(204).end();
  });

  return router;
}
