import { crc32 } from 'node:zlib';

import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';

// Download my records for a date range as CSV files (#332): one file per kind, or all of them in one
// zip. Medical details are sensitive, so nothing here logs a request's content, and the files are
// sent with no-store so no cache keeps them. Every query is bound to the two dates; the SQL below
// has no user text in it.

// Excel and other spreadsheet apps read a UTF-8 file as Korean only with a byte order mark.
const bom = '﻿';

const plainNumber = /^-?\d+(\.\d+)?$/;

/**
 * One cell. Text with a comma, quote or line break is quoted. Text that starts like a spreadsheet
 * formula (= + - @, or a tab or carriage return) gets a leading apostrophe, so a note typed as
 * "=1+1" is shown as text and not run when the file is opened. Plain numbers are left alone.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !plainNumber.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A whole CSV file: the byte order mark, the header and the rows, with CRLF line ends. */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `${bom}${lines.join('\r\n')}\r\n`;
}

const zone = "'Asia/Seoul'";
const clock = (column: string) => `to_char(${column} AT TIME ZONE ${zone}, 'YYYY-MM-DD HH24:MI')`;
const mealOrder = `CASE e.meal WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 ELSE 4 END`;

// Each kind is one query over the chosen days ($1 to $2, both included). The column names of the
// query are the header of the file. Dates are plain days, so no time zone shifts them; moments are
// written in Asia/Seoul.
export const kinds = {
  meals: {
    file: 'meals',
    sql: `SELECT e.entry_date AS date, e.meal, to_char(t.eaten_time, 'HH24:MI') AS eaten_time,
        e.name, e.brand, trim_scale(e.servings) AS servings,
        trim_scale(e.serving_size) AS serving_size, e.serving_unit,
        trim_scale(round(e.calories * e.servings, 2)) AS calories,
        trim_scale(round(e.carbs * e.servings, 2)) AS carbs,
        trim_scale(round(e.protein * e.servings, 2)) AS protein,
        trim_scale(round(e.fat * e.servings, 2)) AS fat,
        trim_scale(round(e.sugars * e.servings, 2)) AS sugars,
        trim_scale(round(e.sodium * e.servings, 2)) AS sodium,
        e.is_junk AS junk_food
      FROM meal_entries e
      LEFT JOIN meal_times t ON t.entry_date = e.entry_date AND t.meal = e.meal
      WHERE e.entry_date BETWEEN $1 AND $2
      ORDER BY e.entry_date, ${mealOrder}, e.id`,
  },
  sleep: {
    file: 'sleep',
    sql: `SELECT sleep_date AS date, ${clock('bed_at')} AS bed_at, ${clock('wake_at')} AS wake_at,
        duration_minutes, deep_minutes, light_minutes, rem_minutes, awake_minutes, sleep_score, source
      FROM sleep_records WHERE sleep_date BETWEEN $1 AND $2 ORDER BY sleep_date`,
  },
  body: {
    file: 'body',
    sql: `SELECT record_date AS date, trim_scale(weight_kg) AS weight_kg,
        trim_scale(body_fat_percent) AS body_fat_percent, trim_scale(waist_cm) AS waist_cm,
        systolic_mmhg, diastolic_mmhg, memo
      FROM body_records WHERE record_date BETWEEN $1 AND $2 ORDER BY record_date`,
  },
  habits: {
    file: 'habits',
    sql: `SELECT d.record_date AS date, d.cigarettes,
        (SELECT string_agg(k.kind || ' ' || k.amount::float8 || ' ' || k.unit, '; ' ORDER BY k.position)
         FROM habit_drinks k WHERE k.record_date = d.record_date) AS drinks
      FROM habit_days d WHERE d.record_date BETWEEN $1 AND $2 ORDER BY d.record_date`,
  },
  checks: {
    file: 'daily-checks',
    sql: `SELECT record_date AS date, diet_kept, sleep_good, mood, energy, stress, memo
      FROM day_checks WHERE record_date BETWEEN $1 AND $2 ORDER BY record_date`,
  },
  intake: {
    file: 'intake',
    sql: `SELECT record_date AS date, kind, amount, ${clock('consumed_at')} AS consumed_at
      FROM intake_entries WHERE record_date BETWEEN $1 AND $2 ORDER BY record_date, id`,
  },
  visits: {
    file: 'visits',
    sql: `SELECT id, visit_date AS date, clinic, department, note, cost, next_visit_on
      FROM clinic_visits WHERE visit_date BETWEEN $1 AND $2 ORDER BY visit_date, id`,
  },
  procedures: {
    file: 'visit-procedures',
    sql: `SELECT v.id AS visit_id, v.visit_date AS date, v.clinic, p.position, p.name, p.area,
        p.amount, p.cost, p.note
      FROM clinic_procedures p JOIN clinic_visits v ON v.id = p.visit_id
      WHERE v.visit_date BETWEEN $1 AND $2 ORDER BY v.visit_date, v.id, p.position`,
  },
  medications: {
    file: 'medications',
    // Every medicine taken on at least one of the days.
    sql: `SELECT m.id, m.name, m.dose, m.directions, m.start_on, m.end_on, m.note,
        m.visit_id, v.visit_date AS visit_date, v.clinic AS visit_clinic
      FROM medications m LEFT JOIN clinic_visits v ON v.id = m.visit_id
      WHERE m.start_on <= $2 AND (m.end_on IS NULL OR m.end_on >= $1)
      ORDER BY m.start_on, m.id`,
  },
  labs: {
    file: 'lab-results',
    sql: `SELECT l.id, l.test_date AS date, l.name, trim_scale(l.value) AS value, l.unit,
        trim_scale(l.ref_low) AS ref_low, trim_scale(l.ref_high) AS ref_high, l.note,
        l.visit_id, v.visit_date AS visit_date, v.clinic AS visit_clinic
      FROM lab_results l LEFT JOIN clinic_visits v ON v.id = l.visit_id
      WHERE l.test_date BETWEEN $1 AND $2 ORDER BY l.test_date, l.id`,
  },
} as const;

export type Kind = keyof typeof kinds;
const kindNames = Object.keys(kinds) as [Kind, ...Kind[]];

/** One file of the zip: a path and its bytes. */
type ZipFile = { name: string; data: Buffer };

const u16 = (value: number) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

/** MS-DOS date and time of a moment, as the zip format keeps them (2-second steps, from 1980). */
function dosTime(at: Date) {
  const year = Math.max(at.getUTCFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
  };
}

/**
 * A zip with every file stored as it is (no compression), so it needs no library. File names are
 * UTF-8 (flag bit 11). The CSV files are small, and a zip app opens this as any other zip.
 */
export function zipStore(files: readonly ZipFile[], at = new Date()): Buffer {
  const { date, time } = dosTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const shared = [u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc)];
    const sizes = [u32(file.data.length), u32(file.data.length)];
    const local = Buffer.concat([
      u32(0x04034b50),
      ...shared,
      ...sizes,
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        ...shared,
        ...sizes,
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, directory, end]);
}

const day = (label: string) =>
  z
    .string({ error: `Choose the ${label} date` })
    .refine(isRealDate, `The ${label} date is not valid`);

export const exportQuery = z
  .object({
    kind: z.enum(['all', ...kindNames], { error: 'Choose what to download' }),
    from: day('start'),
    to: day('end'),
  })
  .refine((query) => query.from <= query.to, {
    message: 'The start date cannot be after the end date',
  });

/** The file name part for the range, such as 2026-01-01_2026-03-31. */
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const rangeName = (from: string, to: string) => {
  // Already checked by the query schema; checked again here so only digits and dashes can reach a
  // file name (a name goes into a header and into the zip).
  if (!dayPattern.test(from) || !dayPattern.test(to)) throw new Error('The range is not valid');
  return `${from}_${to}`;
};

export function exportRouter(pool: Pool) {
  const router = Router();

  const csvOf = async (kind: Kind, from: string, to: string) => {
    const result = await pool.query({
      text: kinds[kind].sql,
      values: [from, to],
      rowMode: 'array',
    });
    return toCsv(
      result.fields.map((field) => field.name),
      result.rows as unknown[][],
    );
  };

  router.get('/', async (req, res) => {
    const { kind, from, to } = exportQuery.parse(req.query);
    // A file with medical details must not be kept by a browser or a proxy.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const name = `health-log-${kind === 'all' ? 'all' : kinds[kind].file}-${rangeName(from, to)}`;
    if (kind === 'all') {
      const files: ZipFile[] = [];
      for (const key of kindNames) {
        files.push({
          name: `${kinds[key].file}-${rangeName(from, to)}.csv`,
          data: Buffer.from(await csvOf(key, from, to), 'utf8'),
        });
      }
      res.type('application/zip');
      res.attachment(`${name}.zip`);
      res.send(zipStore(files));
      return;
    }
    res.type('text/csv; charset=utf-8');
    res.attachment(`${name}.csv`);
    res.send(await csvOf(kind, from, to));
  });

  return router;
}
