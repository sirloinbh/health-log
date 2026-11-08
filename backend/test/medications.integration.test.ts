import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record, and apart from the other 1985 tests (June to August). Made-up values only.
const first = '1985-09-01';
const last = '1985-10-31';
const tag = '#40가상';

let pool: Pool;

const clean = async () => {
  await pool.query('DELETE FROM medications WHERE start_on BETWEEN $1 AND $2', [first, last]);
  await pool.query('DELETE FROM clinic_visits WHERE visit_date BETWEEN $1 AND $2', [first, last]);
};

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

type Medication = {
  id: number;
  name: string;
  dose: string | null;
  directions: string | null;
  startOn: string;
  endOn: string | null;
  note: string | null;
  visit: { id: number; date: string; clinic: string } | null;
};

type Lists = { today: string; current: Medication[]; upcoming: Medication[]; past: Medication[] };

type Call = Parameters<Parameters<typeof withApi>[1]>[0];

const create = async (call: Call, body: object) => {
  const { status, data } = await call('/api/medications', { method: 'POST', body });
  assert.equal(status, 201, JSON.stringify(data));
  return data as unknown as Medication;
};

const names = (list: Medication[]) => list.filter((m) => m.name.startsWith(tag)).map((m) => m.name);

test('a medicine is saved with its period and read back', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const saved = await create(call, {
      name: `  ${tag}정  `,
      dose: '500mg',
      directions: '하루 2번 식후',
      startOn: '1985-09-02',
      endOn: '1985-09-08',
      note: '',
    });
    assert.deepEqual(saved, {
      id: saved.id,
      name: `${tag}정`,
      dose: '500mg',
      directions: '하루 2번 식후',
      startOn: '1985-09-02',
      endOn: '1985-09-08',
      note: null,
      visit: null,
    });
  });
});

test(
  'being taken is judged by the service today: an end day still counts, a later start does not',
  { skip },
  async (t) => {
    t.after(clean);
    // The service's today, as Asia/Seoul counts it, is stood in for here.
    await withApi(
      pool,
      async (call) => {
        await create(call, { name: `${tag}끝난약`, startOn: '1985-09-01', endOn: '1985-09-09' });
        await create(call, { name: `${tag}오늘끝`, startOn: '1985-09-01', endOn: '1985-09-10' });
        await create(call, { name: `${tag}오늘시작`, startOn: '1985-09-10' });
        await create(call, { name: `${tag}계속`, startOn: '1985-09-05' });
        await create(call, { name: `${tag}내일시작`, startOn: '1985-09-11', endOn: '1985-09-20' });
        const lists = (await call('/api/medications')).data as unknown as Lists;
        assert.equal(lists.today, '1985-09-10');
        assert.deepEqual(names(lists.current), [`${tag}오늘시작`, `${tag}계속`, `${tag}오늘끝`]);
        assert.deepEqual(names(lists.upcoming), [`${tag}내일시작`]);
        assert.deepEqual(names(lists.past), [`${tag}끝난약`]);
      },
      { today: () => '1985-09-10' },
    );
  },
);

test('the medicines of one day are those taken on it', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await create(call, { name: `${tag}가`, startOn: '1985-09-12', endOn: '1985-09-14' });
    await create(call, { name: `${tag}나`, startOn: '1985-09-15' });
    const day = async (date: string) =>
      names(
        ((await call(`/api/medications?date=${date}`)).data as { medications: Medication[] })
          .medications,
      );
    assert.deepEqual(await day('1985-09-11'), []);
    assert.deepEqual(await day('1985-09-14'), [`${tag}가`]);
    assert.deepEqual(await day('1985-09-15'), [`${tag}나`]);
  });
});

test('a medicine linked to a visit stays when that visit is deleted', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const visit = await call('/api/visits', {
      method: 'POST',
      body: { date: '1985-09-20', clinic: `${tag}내과` },
    });
    assert.equal(visit.status, 201);
    const visitId = Number(visit.data.id);
    const saved = await create(call, { name: `${tag}처방약`, startOn: '1985-09-20', visitId });
    assert.deepEqual(saved.visit, { id: visitId, date: '1985-09-20', clinic: `${tag}내과` });

    assert.equal((await call(`/api/visits/${visitId}`, { method: 'DELETE' })).status, 204);
    const after = (await call('/api/medications?date=1985-09-20')).data as {
      medications: Medication[];
    };
    const kept = after.medications.find((m) => m.id === saved.id);
    assert.ok(kept, 'the medicine is still there');
    assert.equal(kept.visit, null);
  });
});

test('a visit that does not exist cannot be linked', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/medications', {
      method: 'POST',
      body: { name: `${tag}정`, startOn: '1985-09-21', visitId: 999999999 },
    });
    assert.equal(status, 400);
    assert.equal(data.error, '연결할 병원 방문을 찾을 수 없습니다');
  });
});

test('saving again replaces every field, and a missing record is a 404', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    const saved = await create(call, { name: `${tag}정`, dose: '1정', startOn: '1985-09-22' });
    const { status, data } = await call(`/api/medications/${saved.id}`, {
      method: 'PUT',
      body: { name: `${tag}정`, startOn: '1985-09-22', endOn: '1985-09-30' },
    });
    assert.equal(status, 200, JSON.stringify(data));
    assert.equal((data as unknown as Medication).dose, null);
    assert.equal((data as unknown as Medication).endOn, '1985-09-30');
    const missing = await call('/api/medications/999999999', {
      method: 'PUT',
      body: { name: `${tag}정`, startOn: '1985-09-22' },
    });
    assert.equal(missing.status, 404);
    assert.equal((await call(`/api/medications/${saved.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await call(`/api/medications/${saved.id}`, { method: 'DELETE' })).status, 404);
  });
});

test('the database refuses an end before the start', { skip }, async () => {
  await assert.rejects(
    pool.query('INSERT INTO medications (name, start_on, end_on) VALUES ($1, $2, $3)', [
      `${tag}정`,
      '1985-10-02',
      '1985-10-01',
    ]),
    /violates check constraint/,
  );
});

test(
  'saving again can keep, change or drop the visit link, but not point it at no visit',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(pool, async (call) => {
      const addVisit = async (date: string) =>
        Number(
          (await call('/api/visits', { method: 'POST', body: { date, clinic: `${tag}의원` } })).data
            .id,
        );
      const firstVisit = await addVisit('1985-10-01');
      const secondVisit = await addVisit('1985-10-02');
      const saved = await create(call, {
        name: `${tag}정`,
        startOn: '1985-10-03',
        visitId: firstVisit,
      });
      const put = async (visitId: number | null) =>
        call(`/api/medications/${saved.id}`, {
          method: 'PUT',
          body: { name: `${tag}정`, startOn: '1985-10-03', visitId },
        });
      const linkOf = async (visitId: number | null) =>
        ((await put(visitId)).data as unknown as Medication).visit?.id ?? null;

      assert.equal(await linkOf(firstVisit), firstVisit);
      assert.equal(await linkOf(secondVisit), secondVisit);
      assert.equal(await linkOf(null), null);
      const unknown = await put(999999999);
      assert.equal(unknown.status, 400);
      assert.equal(unknown.data.error, '연결할 병원 방문을 찾을 수 없습니다');
      // The refused change left the record as it was.
      const day = (await call('/api/medications?date=1985-10-03')).data as {
        medications: Medication[];
      };
      assert.equal(day.medications.find((m) => m.id === saved.id)?.visit, null);
    });
  },
);

test('a medicine counts on its first day as well as its last', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await create(call, { name: `${tag}하루약`, startOn: '1985-10-10', endOn: '1985-10-10' });
    const day = async (date: string) =>
      names(
        ((await call(`/api/medications?date=${date}`)).data as { medications: Medication[] })
          .medications,
      );
    assert.deepEqual(await day('1985-10-09'), []);
    assert.deepEqual(await day('1985-10-10'), [`${tag}하루약`]);
    assert.deepEqual(await day('1985-10-11'), []);
  });
});
