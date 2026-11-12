import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import { testDatabaseSkip, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const skip = testDatabaseSkip(url);

// Far from any real record, and apart from the other 1985 tests (June to October). Made-up values only.
const first = '1985-11-01';
const last = '1985-12-31';
const today = '1985-11-10';
const tag = '#48가상';
const options = { today: () => today };

let pool: Pool;

// Marks go with their visit or medicine (ON DELETE CASCADE).
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

type Reminder =
  | {
      kind: 'visit';
      id: number;
      dueOn: string;
      daysLeft: number;
      clinic: string;
      department: string | null;
      procedures: string[];
    }
  | { kind: 'medication'; id: number; dueOn: string; daysLeft: number; name: string };

type Reminders = { today: string; until: string; leadDays: number; reminders: Reminder[] };

type Call = Parameters<Parameters<typeof withApi>[1]>[0];

const visit = async (call: Call, nextVisitOn: string | null, extra: object = {}) => {
  const { status, data } = await call('/api/visits', {
    method: 'POST',
    body: { date: '1985-11-01', clinic: `${tag}의원`, nextVisitOn, ...extra },
  });
  assert.equal(status, 201, JSON.stringify(data));
  return Number(data.id);
};

const medicine = async (call: Call, endOn: string | null) => {
  const { status, data } = await call('/api/medications', {
    method: 'POST',
    body: { name: `${tag}정`, startOn: '1985-11-01', endOn },
  });
  assert.equal(status, 201, JSON.stringify(data));
  return Number(data.id);
};

const mine = async (call: Call) => {
  const { status, data } = await call('/api/reminders');
  assert.equal(status, 200);
  const body = data as unknown as Reminders;
  return {
    ...body,
    reminders: body.reminders.filter((item) =>
      (item.kind === 'visit' ? item.clinic : item.name).startsWith(tag),
    ),
  };
};

const done = (call: Call, body: object) => call('/api/reminders/done', { method: 'POST', body });

test(
  'today, tomorrow and the last lead day are reminded by the service date; outside is not',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(
      pool,
      async (call) => {
        const dueToday = await visit(call, today, {
          department: '피부과',
          procedures: [{ name: '가상시술A' }, { name: '가상시술B' }],
        });
        const dueTomorrow = await medicine(call, '1985-11-11');
        // Saved first, yet on the same day the appointment is listed before the medicine.
        const endsLast = await medicine(call, '1985-11-17');
        const dueLast = await visit(call, '1985-11-17');
        await visit(call, '1985-11-18'); // a day past the lead time
        await visit(call, '1985-11-09'); // already past
        await visit(call, null);
        await medicine(call, null); // no end yet
        await medicine(call, '1985-11-09');

        const list = await mine(call);
        assert.equal(list.today, today);
        assert.equal(list.until, '1985-11-17');
        assert.equal(list.leadDays, 7);
        assert.deepEqual(list.reminders, [
          {
            kind: 'visit',
            id: dueToday,
            dueOn: today,
            daysLeft: 0,
            clinic: `${tag}의원`,
            department: '피부과',
            procedures: ['가상시술A', '가상시술B'],
          },
          {
            kind: 'medication',
            id: dueTomorrow,
            dueOn: '1985-11-11',
            daysLeft: 1,
            name: `${tag}정`,
          },
          {
            kind: 'visit',
            id: dueLast,
            dueOn: '1985-11-17',
            daysLeft: 7,
            clinic: `${tag}의원`,
            department: null,
            procedures: [],
          },
          {
            kind: 'medication',
            id: endsLast,
            dueOn: '1985-11-17',
            daysLeft: 7,
            name: `${tag}정`,
          },
        ]);
      },
      options,
    );
  },
);

test('the window moves with the service today', { skip }, async (t) => {
  t.after(clean);
  await withApi(pool, async (call) => {
    await visit(call, '1985-11-18');
  });
  await withApi(
    pool,
    async (call) => {
      const list = await mine(call);
      assert.equal(list.until, '1985-11-18');
      assert.deepEqual(
        list.reminders.map((item) => item.daysLeft),
        [7],
      );
    },
    { today: () => '1985-11-11' },
  );
});

test(
  'a reminder marked done does not come back, and marking it again is the same',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(
      pool,
      async (call) => {
        const visitId = await visit(call, '1985-11-12');
        const medicineId = await medicine(call, '1985-11-12');

        assert.equal(
          (await done(call, { kind: 'visit', id: visitId, dueOn: '1985-11-12' })).status,
          204,
        );
        assert.deepEqual(
          (await mine(call)).reminders.map((item) => item.kind),
          ['medication'],
        );
        assert.equal(
          (await done(call, { kind: 'visit', id: visitId, dueOn: '1985-11-12' })).status,
          204,
        );
        assert.equal(
          (await done(call, { kind: 'medication', id: medicineId, dueOn: '1985-11-12' })).status,
          204,
        );
        assert.deepEqual((await mine(call)).reminders, []);
      },
      options,
    );
  },
);

test('moving the day reminds again, and an old day cannot be marked', { skip }, async (t) => {
  t.after(clean);
  await withApi(
    pool,
    async (call) => {
      const visitId = await visit(call, '1985-11-12');
      await done(call, { kind: 'visit', id: visitId, dueOn: '1985-11-12' });
      const moved = await call(`/api/visits/${visitId}`, {
        method: 'PUT',
        body: { date: '1985-11-01', clinic: `${tag}의원`, nextVisitOn: '1985-11-14' },
      });
      assert.equal(moved.status, 200);
      assert.deepEqual(
        (await mine(call)).reminders.map((item) => item.dueOn),
        ['1985-11-14'],
      );

      // A screen still showing the old day must not hide the new one.
      const stale = await done(call, { kind: 'visit', id: visitId, dueOn: '1985-11-13' });
      assert.equal(stale.status, 404);
      assert.equal(stale.data.error, 'Reminder not found');
      assert.equal((await mine(call)).reminders.length, 1);

      // Moving back to the day marked earlier keeps that mark.
      await call(`/api/visits/${visitId}`, {
        method: 'PUT',
        body: { date: '1985-11-01', clinic: `${tag}의원`, nextVisitOn: '1985-11-12' },
      });
      assert.deepEqual((await mine(call)).reminders, []);
    },
    options,
  );
});

test(
  'a record that is gone cannot be marked, and deleting one takes its marks',
  { skip },
  async (t) => {
    t.after(clean);
    await withApi(
      pool,
      async (call) => {
        const medicineId = await medicine(call, '1985-11-12');
        await done(call, { kind: 'medication', id: medicineId, dueOn: '1985-11-12' });
        assert.equal(
          (await call(`/api/medications/${medicineId}`, { method: 'DELETE' })).status,
          204,
        );
        const { rows } = await pool.query('SELECT 1 FROM reminders_done WHERE medication_id = $1', [
          medicineId,
        ]);
        assert.equal(rows.length, 0);

        const gone = await done(call, { kind: 'medication', id: medicineId, dueOn: '1985-11-12' });
        assert.equal(gone.status, 404);
        // The kind picks the table: a visit's id sent as a medicine finds no medicine due that day.
        const visitId = await visit(call, '1985-11-12');
        const wrongKind = await done(call, {
          kind: 'medication',
          id: visitId,
          dueOn: '1985-11-12',
        });
        assert.equal(wrongKind.status, 404);
      },
      options,
    );
  },
);
