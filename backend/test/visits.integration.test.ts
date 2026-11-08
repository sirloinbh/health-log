import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record, and apart from the other 1985 tests (June). Made-up values only.
const first = '1985-07-01';
const last = '1985-08-31';
// Searches match these, so the names carry a tag no real clinic or procedure has.
const tag = '#39가상';

let pool: Pool;

const clean = () =>
  pool.query('DELETE FROM clinic_visits WHERE visit_date BETWEEN $1 AND $2', [first, last]);

before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await clean();
});

after(async () => {
  if (skip) return;
  await clean();
  await pool.end();
});

type Visit = {
  id: number;
  date: string;
  clinic: string;
  department: string | null;
  note: string | null;
  cost: number | null;
  nextVisitOn: string | null;
  procedures: {
    name: string;
    area: string | null;
    amount: string | null;
    cost: number | null;
    note: string | null;
  }[];
};

type Call = Parameters<Parameters<typeof withApi>[1]>[0];

const create = async (call: Call, body: object) => {
  const { status, data } = await call('/api/visits', { method: 'POST', body });
  assert.equal(status, 201, JSON.stringify(data));
  return data as unknown as Visit;
};

const proceduresOf = async (id: number) =>
  (await pool.query('SELECT count(*)::int AS n FROM clinic_procedures WHERE visit_id = $1', [id]))
    .rows[0].n as number;

test(
  'a visit is saved with its procedures in order and read back by its day',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      const saved = await create(call, {
        date: '1985-07-02',
        clinic: `  ${tag}피부과  `,
        department: '피부과',
        note: '가상 증상 메모',
        cost: 12000,
        nextVisitOn: '1985-07-30',
        procedures: [
          { name: `${tag} 레이저`, area: '이마', amount: '1회차', cost: 50000, note: '가상' },
          { name: `${tag} 보습 관리`, area: '', amount: null },
        ],
      });
      assert.deepEqual(saved, {
        id: saved.id,
        date: '1985-07-02',
        clinic: `${tag}피부과`,
        department: '피부과',
        note: '가상 증상 메모',
        cost: 12000,
        nextVisitOn: '1985-07-30',
        procedures: [
          { name: `${tag} 레이저`, area: '이마', amount: '1회차', cost: 50000, note: '가상' },
          { name: `${tag} 보습 관리`, area: null, amount: null, cost: null, note: null },
        ],
      });
      const day = await call('/api/visits?date=1985-07-02');
      assert.equal(day.status, 200);
      assert.deepEqual(day.data, { visits: [saved], more: false });
      const other = await call('/api/visits?date=1985-07-03');
      assert.deepEqual(other.data, { visits: [], more: false });
    });
  },
);

test('clinics and procedures can be found by name', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const derm = await create(call, {
      date: '1985-07-05',
      clinic: `${tag}맑은피부과`,
      procedures: [{ name: `${tag}물광주사` }],
    });
    const dentist = await create(call, { date: '1985-07-06', clinic: `${tag}튼튼치과` });
    const found = async (q: string) =>
      ((await call(`/api/visits?q=${encodeURIComponent(q)}`)).data.visits as Visit[]).map(
        (visit) => visit.id,
      );
    assert.deepEqual(await found(`${tag}맑은`), [derm.id]);
    assert.deepEqual(await found(`${tag}물광`), [derm.id]);
    assert.deepEqual(await found(`${tag}튼튼`), [dentist.id]);
    // Newest first, and a search word with % or _ is matched as written.
    assert.deepEqual(await found(tag), [dentist.id, derm.id]);
    assert.deepEqual(await found(`${tag}%`), []);
  });
});

test(
  'visits come twenty at a time, newest first, and say when more are left',
  { skip },
  async (t) => {
    t.after(clean);
    // 21 visits over 21 days, each with a clinic only this test uses.
    const days = Array.from(
      { length: 21 },
      (_, index) => `1985-08-${String(index + 5).padStart(2, '0')}`,
    );
    await withApi(pool, async (call) => {
      for (const date of days) await create(call, { date, clinic: `${tag}쪽${date}` });
      const first = await call(`/api/visits?q=${encodeURIComponent(`${tag}쪽`)}`);
      const firstPage = first.data as unknown as { visits: Visit[]; more: boolean };
      assert.equal(firstPage.visits.length, 20);
      assert.equal(firstPage.more, true);
      assert.equal(firstPage.visits[0].date, '1985-08-25');
      const second = await call(`/api/visits?q=${encodeURIComponent(`${tag}쪽`)}&offset=20`);
      const secondPage = second.data as unknown as { visits: Visit[]; more: boolean };
      assert.deepEqual(
        secondPage.visits.map((visit) => visit.date),
        ['1985-08-05'],
      );
      assert.equal(secondPage.more, false);
    });
  },
);

test(
  'an underscore in the search words is matched as written, not as any character',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      const underscore = await create(call, { date: '1985-07-20', clinic: `${tag}A_B의원` });
      await create(call, { date: '1985-07-21', clinic: `${tag}AXB의원` });
      const found = (await call(`/api/visits?q=${encodeURIComponent(`${tag}A_B`)}`)).data
        .visits as Visit[];
      assert.deepEqual(
        found.map((visit) => visit.id),
        [underscore.id],
      );
    });
  },
);

test('saving again replaces the visit and its whole list of procedures', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const saved = await create(call, {
      date: '1985-07-10',
      clinic: `${tag}의원`,
      cost: 5000,
      procedures: [{ name: `${tag}가` }, { name: `${tag}나` }],
    });
    const { status, data } = await call(`/api/visits/${saved.id}`, {
      method: 'PUT',
      body: { date: '1985-07-11', clinic: `${tag}의원`, procedures: [{ name: `${tag}다` }] },
    });
    assert.equal(status, 200, JSON.stringify(data));
    const updated = data as unknown as Visit;
    assert.equal(updated.date, '1985-07-11');
    assert.equal(updated.cost, null);
    assert.deepEqual(
      updated.procedures.map((item) => item.name),
      [`${tag}다`],
    );
    assert.equal(await proceduresOf(saved.id), 1);
    const missing = await call('/api/visits/999999999', {
      method: 'PUT',
      body: { date: '1985-07-11', clinic: `${tag}의원` },
    });
    assert.equal(missing.status, 404);
  });
});

test('deleting a visit takes its procedures with it', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const saved = await create(call, {
      date: '1985-07-15',
      clinic: `${tag}의원`,
      procedures: [{ name: `${tag}가` }, { name: `${tag}나` }],
    });
    assert.equal(await proceduresOf(saved.id), 2);
    assert.equal((await call(`/api/visits/${saved.id}`, { method: 'DELETE' })).status, 204);
    assert.equal(await proceduresOf(saved.id), 0);
    assert.equal((await call(`/api/visits/${saved.id}`, { method: 'DELETE' })).status, 404);
  });
});

// The second procedure fails after the visit and the first procedure were written.
const failingOnSecondProcedure = () => {
  const failing = Object.create(pool) as Pool;
  failing.connect = (async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    // A stand-in, so the client goes back to the pool unchanged.
    return Object.assign(Object.create(client) as typeof client, {
      release: (error?: Error | boolean) => client.release(error),
      query: (text: unknown, values?: unknown[]) => {
        if (
          typeof text === 'string' &&
          text.includes('INSERT INTO clinic_procedures') &&
          values?.[1] === 2
        ) {
          return Promise.reject(new Error('second procedure failed'));
        }
        return query(text as string, values);
      },
    });
  }) as unknown as Pool['connect'];
  return failing;
};

test('a visit whose procedures fail partway is not saved at all', { skip }, async (t) => {
  t.after(clean);
  await withApi(failingOnSecondProcedure(), async (call) => {
    const { status } = await call('/api/visits', {
      method: 'POST',
      body: {
        date: '1985-08-01',
        clinic: `${tag}의원`,
        procedures: [{ name: `${tag}가` }, { name: `${tag}나` }],
      },
    });
    assert.equal(status, 500);
  });
  const { rows } = await pool.query('SELECT id FROM clinic_visits WHERE visit_date = $1', [
    '1985-08-01',
  ]);
  assert.deepEqual(rows, []);
});

test('a change that fails partway leaves the earlier visit whole', { skip }, async (t) => {
  t.after(clean);
  let id = 0;
  await withApi(pool, async (call) => {
    id = (
      await create(call, {
        date: '1985-08-02',
        clinic: `${tag}의원`,
        procedures: [{ name: `${tag}가` }],
      })
    ).id;
  });
  await withApi(failingOnSecondProcedure(), async (call) => {
    const { status } = await call(`/api/visits/${id}`, {
      method: 'PUT',
      body: {
        date: '1985-08-03',
        clinic: `${tag}바뀐의원`,
        procedures: [{ name: `${tag}다` }, { name: `${tag}라` }],
      },
    });
    assert.equal(status, 500);
  });
  await withApi(pool, async (call) => {
    const visits = (await call('/api/visits?date=1985-08-02')).data.visits as Visit[];
    assert.equal(visits.length, 1);
    assert.equal(visits[0].clinic, `${tag}의원`);
    assert.deepEqual(
      visits[0].procedures.map((item) => item.name),
      [`${tag}가`],
    );
  });
});

test('the database refuses what the API would never write', { skip }, async (t) => {
  t.after(clean);
  for (const [sql, values] of [
    ['INSERT INTO clinic_visits (visit_date, clinic) VALUES ($1, $2)', ['1985-08-10', '']],
    [
      'INSERT INTO clinic_visits (visit_date, clinic, next_visit_on) VALUES ($1, $2, $3)',
      ['1985-08-10', `${tag}의원`, '1985-08-09'],
    ],
    [
      'INSERT INTO clinic_visits (visit_date, clinic, cost) VALUES ($1, $2, $3)',
      ['1985-08-10', `${tag}의원`, -1],
    ],
  ] as const) {
    await assert.rejects(pool.query(sql, [...values]), /violates check constraint/);
  }
});
