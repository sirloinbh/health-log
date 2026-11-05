import assert from 'node:assert/strict';
import { test } from 'node:test';

import { periodsOf } from '../src/day-records.js';

test('weeks run Monday to Sunday, and months end on their own last day', () => {
  // 2026-11-01 is a Sunday, so it closes the week that began on Monday 10-26.
  assert.deepEqual(periodsOf('2026-11-01'), {
    week: { from: '2026-10-26', to: '2026-11-01' },
    month: { from: '2026-11-01', to: '2026-11-30' },
  });
  assert.deepEqual(periodsOf('2026-11-02').week, { from: '2026-11-02', to: '2026-11-08' });
  // A week can span a year.
  assert.deepEqual(periodsOf('2026-12-31').week, { from: '2026-12-28', to: '2027-01-03' });
  assert.deepEqual(periodsOf('2028-02-15').month, { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(periodsOf('2027-02-15').month, { from: '2027-02-01', to: '2027-02-28' });
});

test('the periods follow the calendar date, whatever the server time zone', () => {
  const zone = process.env.TZ;
  try {
    for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = tz;
      assert.deepEqual(periodsOf('2026-11-01').week, { from: '2026-10-26', to: '2026-11-01' }, tz);
      assert.deepEqual(periodsOf('2026-03-01').month, { from: '2026-03-01', to: '2026-03-31' }, tz);
    }
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});
