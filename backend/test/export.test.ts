import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { csvCell, kinds, toCsv, zipStore } from '../src/export.js';
import { listenForFetch } from './helpers.js';

const bom = '﻿';

test('a cell is quoted for a comma, a quote or a line break, and quotes are doubled', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('line1\r\nline2'), '"line1\r\nline2"');
  assert.equal(csvCell('가상 메모, 둘째'), '"가상 메모, 둘째"');
});

test('empty values are empty cells and numbers and booleans are written as they are', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(12.5), '12.5');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell('-5.25'), '-5.25');
});

test('text that a spreadsheet would run as a formula is kept as text', () => {
  for (const text of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\tx', '\rx'])
    assert.equal(csvCell(text).replaceAll('"', '').at(0), "'", text);
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell('a=b'), 'a=b');
});

test('a file starts with the byte order mark, then the header and rows with CRLF line ends', () => {
  assert.equal(
    toCsv(
      ['date', 'name'],
      [
        ['2026-03-15', '가상, 메모'],
        ['2026-03-16', null],
      ],
    ),
    `${bom}date,name\r\n2026-03-15,"가상, 메모"\r\n2026-03-16,\r\n`,
  );
  assert.equal(toCsv(['date'], []), `${bom}date\r\n`);
  assert.equal(
    Buffer.from(toCsv(['a'], []))
      .subarray(0, 3)
      .toString('hex'),
    'efbbbf',
  );
});

/** Reads a zip back through its central directory, as a zip app would. */
function readZip(zip: Buffer) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'has an end of central directory');
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  let offset = zip.readUInt32LE(end + 16);
  assert.equal(offset + size, end);
  const entries: { name: string; data: Buffer; crc: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const length = zip.readUInt32LE(offset + 20);
    assert.equal(flags & 0x0800, 0x0800, 'names are UTF-8');
    assert.equal(method, 0, 'stored');
    assert.equal(zip.readUInt32LE(offset + 24), length);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const localName = zip.readUInt16LE(local + 26);
    const localExtra = zip.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    entries.push({ name, data: zip.subarray(start, start + length), crc });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test('a zip holds every file with the right name, size and checksum', () => {
  const files = [
    { name: 'meals.csv', data: Buffer.from(toCsv(['date'], [['2026-03-15']])) },
    { name: '진료-visits.csv', data: Buffer.from('가상,내용') },
    { name: 'empty.csv', data: Buffer.alloc(0) },
  ];
  const entries = readZip(zipStore(files, new Date('2026-03-15T03:04:06Z')));
  assert.deepEqual(
    entries.map((entry) => entry.name),
    files.map((file) => file.name),
  );
  for (const [index, entry] of entries.entries()) {
    assert.deepEqual(entry.data, files[index]!.data);
    assert.equal(entry.crc, crc32(files[index]!.data));
  }
  assert.deepEqual(readZip(zipStore([])), []);
});

// A stand-in pool: each query answers with one fixed row under the given columns.
const standIn = (columns: string[], rows: unknown[][]) => {
  const queries: { text: string; values: unknown[] }[] = [];
  const pool = {
    query: async (config: { text: string; values: unknown[] }) => {
      queries.push(config);
      return { fields: columns.map((name) => ({ name })), rows };
    },
  } as unknown as Pool;
  return { pool, queries };
};

const get = async (
  pool: Pool,
  path: string,
  options: Parameters<typeof createApp>[1] = {},
  headers?: Record<string, string>,
) => {
  const { server, port } = await listenForFetch(createApp(pool, options));
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { response, bytes: Buffer.from(await response.arrayBuffer()) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

test('one kind is sent as a downloaded CSV file that no cache keeps', async () => {
  const { pool, queries } = standIn(['date', 'name'], [['2026-03-15', '가상, 메모']]);
  const { response, bytes } = await get(
    pool,
    '/api/export?kind=body&from=2026-03-01&to=2026-03-31',
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename=health-log-body-2026-03-01_2026-03-31.csv',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(bytes.toString('utf8'), `${bom}date,name\r\n2026-03-15,"가상, 메모"\r\n`);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]!.values, ['2026-03-01', '2026-03-31']);
  assert.equal(queries[0]!.text, kinds.body.sql);
});

test('every kind is asked for with only the two dates as values', async () => {
  for (const key of Object.keys(kinds)) {
    const { pool, queries } = standIn(['date'], []);
    const { response } = await get(pool, `/api/export?kind=${key}&from=2026-03-01&to=2026-03-01`);
    assert.equal(response.status, 200, key);
    assert.deepEqual(queries[0]!.values, ['2026-03-01', '2026-03-01'], key);
  }
});

test('all kinds come as one zip with a CSV file per kind', async () => {
  const { pool, queries } = standIn(['date'], [['2026-03-15']]);
  const { response, bytes } = await get(pool, '/api/export?kind=all&from=2026-03-01&to=2026-03-31');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename=health-log-all-2026-03-01_2026-03-31.zip',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(queries.length, Object.keys(kinds).length);
  const entries = readZip(bytes);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    Object.values(kinds).map((kind) => `${kind.file}-2026-03-01_2026-03-31.csv`),
  );
  for (const entry of entries) {
    assert.equal(entry.data.toString('utf8'), `${bom}date\r\n2026-03-15\r\n`);
    assert.equal(entry.crc, crc32(entry.data));
  }
});

test('a request without a session is 401 and reads nothing', async () => {
  const { pool, queries } = standIn(['date'], []);
  const auth = (
    req: { headers: { cookie?: string } },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void,
  ) => (req.headers.cookie ? next() : res.status(401).json({ error: 'Sign in first' }));
  const path = '/api/export?kind=all&from=2026-03-01&to=2026-03-31';
  const options = { auth } as unknown as Parameters<typeof createApp>[1];
  assert.equal((await get(pool, path, options)).response.status, 401);
  assert.equal(queries.length, 0);
  assert.equal((await get(pool, path, options, { cookie: 'session=1' })).response.status, 200);
});

test('a missing or unreadable kind or date, or a start after the end, is 400 and reads nothing', async () => {
  const bad = [
    '/api/export',
    '/api/export?kind=meals',
    '/api/export?kind=meals&from=2026-03-01',
    '/api/export?kind=nothing&from=2026-03-01&to=2026-03-31',
    '/api/export?kind=meals&from=2026-02-30&to=2026-03-31',
    '/api/export?kind=meals&from=2026-03-01&to=31-03-2026',
    '/api/export?kind=meals&from=2026-03-31&to=2026-03-01',
    '/api/export?kind=meals&kind=sleep&from=2026-03-01&to=2026-03-31',
  ];
  const { pool, queries } = standIn(['date'], []);
  for (const path of bad) {
    const { response } = await get(pool, path);
    assert.equal(response.status, 400, path);
  }
  assert.equal(queries.length, 0);
});
