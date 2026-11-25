import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { kinds } from '../src/export.js';
import { listenForFetch, testDatabaseSkip } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record; made-up values only. May 1991 is used by no other test file.
const first = '1991-05-01';
const last = '1991-05-31';
const bom = '﻿';
const tag = 'zz-export';

let pool: Pool;

const clean = async () => {
  for (const [table, column] of [
    ['meal_times', 'entry_date'],
    ['meal_entries', 'entry_date'],
    ['sleep_records', 'sleep_date'],
    ['body_records', 'record_date'],
    ['habit_days', 'record_date'],
    ['day_checks', 'record_date'],
    ['intake_entries', 'record_date'],
    ['lab_results', 'test_date'],
    ['medications', 'start_on'],
    ['clinic_visits', 'visit_date'],
  ] as const) {
    await pool.query(`DELETE FROM ${table} WHERE ${column} BETWEEN '1991-04-01' AND '1991-06-30'`);
  }
};

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await clean();
  await pool.query(
    `INSERT INTO meal_entries (entry_date, meal, servings, name, brand, calories, carbs, is_junk)
     VALUES ('1991-05-02', 'breakfast', 2, $1, NULL, 100.5, 10, true),
            ('1991-05-02', 'snack', 1, $2, '브랜드', 50, NULL, false),
            ('1991-04-30', 'lunch', 1, $3, NULL, 1, NULL, false),
            ('1991-06-01', 'lunch', 1, $3, NULL, 1, NULL, false)`,
    [`${tag}-밥 "특선", 곁들임\n둘째 줄`, `${tag}-과자`, `${tag}-outside`],
  );
  await pool.query(`INSERT INTO meal_times (entry_date, meal, eaten_time)
                    VALUES ('1991-05-02', 'breakfast', '08:30')`);
  await pool.query(
    `INSERT INTO sleep_records (sleep_date, bed_at, wake_at, duration_minutes, sleep_score)
     VALUES ('1991-05-03', '1991-05-02 23:10:00+09', '1991-05-03 06:40:00+09', 450, 80),
            ('1991-06-03', '1991-06-02 23:10:00+09', '1991-06-03 06:40:00+09', 450, 70)`,
  );
  await pool.query(
    `INSERT INTO body_records (record_date, weight_kg, memo)
     VALUES ('1991-05-04', 70.5, '=1+1'), ('1991-04-04', 60, NULL)`,
  );
  await pool.query(`INSERT INTO habit_days (record_date, cigarettes, drinks_recorded)
                    VALUES ('1991-05-05', 3, true), ('1991-05-06', 0, false)`);
  await pool.query(
    `INSERT INTO habit_drinks (record_date, drinks_recorded, position, kind, unit, amount)
     VALUES ('1991-05-05', true, 0, 'soju', 'bottle', 1.5), ('1991-05-05', true, 1, 'beer', 'can', 2)`,
  );
  await pool.query(
    `INSERT INTO day_checks (record_date, diet_kept, sleep_good, mood, memo)
     VALUES ('1991-05-06', true, false, 4, '괜찮음')`,
  );
  await pool.query(
    `INSERT INTO intake_entries (record_date, kind, amount, consumed_at)
     VALUES ('1991-05-07', 'water', 250, '1991-05-07 13:05:00+09'), ('1991-05-07', 'coffee', 150, NULL)`,
  );
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO clinic_visits (visit_date, clinic, department, note, cost, next_visit_on)
     VALUES ('1991-05-08', $1, '내과', $2, 15000, '1991-06-08'),
            ('1991-04-08', $1, NULL, NULL, NULL, NULL) RETURNING id`,
    [`${tag}-가상내과`, '기침, "열" 없음\n약 처방'],
  );
  await pool.query(
    `INSERT INTO clinic_procedures (visit_id, position, name, area, amount, cost, note)
     VALUES ($1, 1, '주사', '팔', '1회', 5000, NULL), ($1, 2, '검사', NULL, NULL, NULL, '공복')`,
    [rows[0]!.id],
  );
  await pool.query(
    `INSERT INTO medications (name, dose, directions, start_on, end_on, note, visit_id)
     VALUES ($1, '500mg', '하루 두 번', '1991-04-20', '1991-05-02', NULL, $5),
            ($2, NULL, NULL, '1991-05-25', NULL, '계속 복용', NULL),
            ($3, NULL, NULL, '1991-04-01', '1991-04-30', NULL, NULL),
            ($4, NULL, NULL, '1991-06-10', '1991-06-12', NULL, NULL)`,
    [`${tag}-약`, `${tag}-계속`, `${tag}-before`, `${tag}-after`, rows[0]!.id],
  );
  await pool.query(
    `INSERT INTO lab_results (test_date, name, value, unit, ref_low, ref_high, note, visit_id)
     VALUES ('1991-05-09', $1, 190.5, 'mg/dL', 0, 200, NULL, $2),
            ('1991-04-09', $1, 180, 'mg/dL', NULL, NULL, NULL, NULL)`,
    [`${tag}-콜레스테롤`, rows[0]!.id],
  );
});

after(async () => {
  if (skip) return;
  await clean();
  await pool.end();
});

const download = async (kind: string, from = first, to = last) => {
  const { server, port } = await listenForFetch(createApp(pool));
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/export?kind=${kind}&from=${from}&to=${to}`,
    );
    // text() would drop the byte order mark; keep it so the tests see the file as it is sent.
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

/** The file's lines after the header, with the byte order mark and the header checked. */
const rowsOf = (text: string, header: string) => {
  assert.ok(text.startsWith(`${bom}${header}\r\n`), `header ${header}, got ${text.slice(0, 120)}`);
  return text.slice(bom.length + header.length + 2);
};

test(
  'meals come with the eaten amounts, the meal time and a quoted multi-line name',
  { skip },
  async () => {
    const { response, text } = await download('meals');
    assert.equal(response.status, 200);
    const header =
      'date,meal,eaten_time,name,brand,servings,serving_size,serving_unit,calories,carbs,protein,fat,sugars,sodium,junk_food';
    assert.equal(
      rowsOf(text, header),
      `1991-05-02,breakfast,08:30,"${tag}-밥 ""특선"", 곁들임\n둘째 줄",,2,,,201,20,,,,,true\r\n` +
        `1991-05-02,snack,,${tag}-과자,브랜드,1,,,50,,,,,,false\r\n`,
    );
  },
);

test('sleep is written in Asia/Seoul and only for the range', { skip }, async () => {
  const { text } = await download('sleep');
  assert.equal(
    rowsOf(
      text,
      'date,bed_at,wake_at,duration_minutes,deep_minutes,light_minutes,rem_minutes,awake_minutes,sleep_score,source',
    ),
    '1991-05-03,1991-05-02 23:10,1991-05-03 06:40,450,,,,,80,manual\r\n',
  );
});

test('body keeps a note that starts like a formula as text', { skip }, async () => {
  const { text } = await download('body');
  assert.equal(
    rowsOf(text, 'date,weight_kg,body_fat_percent,waist_cm,systolic_mmhg,diastolic_mmhg,memo'),
    "1991-05-04,70.5,,,,,'=1+1\r\n",
  );
});

test('habits list the drinks of a day in one cell', { skip }, async () => {
  const { text } = await download('habits');
  assert.equal(
    rowsOf(text, 'date,cigarettes,drinks'),
    '1991-05-05,3,soju 1.5 bottle; beer 2 can\r\n1991-05-06,0,\r\n',
  );
});

test('daily checks and intake', { skip }, async () => {
  assert.equal(
    rowsOf((await download('checks')).text, 'date,diet_kept,sleep_good,mood,energy,stress,memo'),
    '1991-05-06,true,false,4,,,괜찮음\r\n',
  );
  assert.equal(
    rowsOf((await download('intake')).text, 'date,kind,amount,consumed_at'),
    '1991-05-07,water,250,1991-05-07 13:05\r\n1991-05-07,coffee,150,\r\n',
  );
});

test('visits and their procedures are two files that agree on the visit id', { skip }, async () => {
  const visits = (await download('visits')).text;
  const procedures = (await download('procedures')).text;
  const rows = rowsOf(visits, 'id,date,clinic,department,note,cost,next_visit_on');
  const id = rows.split(',')[0]!;
  assert.match(id, /^\d+$/);
  assert.equal(
    rows,
    `${id},1991-05-08,${tag}-가상내과,내과,"기침, ""열"" 없음\n약 처방",15000,1991-06-08\r\n`,
  );
  assert.equal(
    rowsOf(procedures, 'visit_id,date,clinic,position,name,area,amount,cost,note'),
    `${id},1991-05-08,${tag}-가상내과,1,주사,팔,1회,5000,\r\n${id},1991-05-08,${tag}-가상내과,2,검사,,,,공복\r\n`,
  );
});

test(
  'medications taken on at least one of the days are included, with their visit',
  { skip },
  async () => {
    const text = (await download('medications')).text;
    const body = rowsOf(
      text,
      'id,name,dose,directions,start_on,end_on,note,visit_id,visit_date,visit_clinic',
    );
    const lines = body.split('\r\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.match(
      lines[0]!,
      new RegExp(
        `^\\d+,${tag}-약,500mg,하루 두 번,1991-04-20,1991-05-02,,\\d+,1991-05-08,${tag}-가상내과$`,
      ),
    );
    assert.match(lines[1]!, new RegExp(`^\\d+,${tag}-계속,,,1991-05-25,,계속 복용,,,$`));
    assert.ok(!text.includes(`${tag}-before`) && !text.includes(`${tag}-after`));
  },
);

test('lab results come with their range and visit', { skip }, async () => {
  const body = rowsOf(
    (await download('labs')).text,
    'id,date,name,value,unit,ref_low,ref_high,note,visit_id,visit_date,visit_clinic',
  );
  assert.match(
    body,
    new RegExp(
      `^\\d+,1991-05-09,${tag}-콜레스테롤,190.5,mg/dL,0,200,,\\d+,1991-05-08,${tag}-가상내과\\r\\n$`,
    ),
  );
});

test(
  'a range with no records gives only the header, and a one-day range is inclusive',
  { skip },
  async () => {
    for (const key of Object.keys(kinds)) {
      const { response, text } = await download(key, '1991-05-20', '1991-05-21');
      assert.equal(response.status, 200, key);
      assert.equal(text.split('\r\n').filter(Boolean).length, 1, `${key} has only its header`);
    }
    const { text } = await download('meals', '1991-05-02', '1991-05-02');
    assert.equal(text.split('\r\n').filter(Boolean).length, 3);
  },
);
