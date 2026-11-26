import assert from 'node:assert/strict';
import { test } from 'node:test';

import { charCount, hasTwoDecimalsAtMost, maxAmount, periodsOf } from '../src/contract.js';

test('weeks run Monday to Sunday, and months end on their own last day', () => {
  // 2026-11-01 is a Sunday, so it closes the week that began on Monday 10-26.
  assert.deepEqual(periodsOf('2026-11-01'), {
    week: { from: '2026-10-26', to: '2026-11-01' },
    weeks12: { from: '2026-08-10', to: '2026-11-01' },
    month: { from: '2026-11-01', to: '2026-11-30' },
  });
  assert.deepEqual(periodsOf('2026-11-02').week, { from: '2026-11-02', to: '2026-11-08' });
  // A week can span a year.
  assert.deepEqual(periodsOf('2026-12-31').week, { from: '2026-12-28', to: '2027-01-03' });
  assert.deepEqual(periodsOf('2028-02-15').month, { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(periodsOf('2027-02-15').month, { from: '2027-02-01', to: '2027-02-28' });
});

test('the 12 weeks end with the week that holds the date and span 84 days (#350)', () => {
  assert.deepEqual(periodsOf('2026-11-05').weeks12, { from: '2026-08-17', to: '2026-11-08' });
  // Across a year.
  assert.deepEqual(periodsOf('2026-01-05').weeks12, { from: '2025-10-20', to: '2026-01-11' });
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

// #215: the limits the screens show come from the same file as the server's checks.
test('the shared number and text rules', () => {
  assert.equal(charCount('밥😀'), 2);
  assert.equal(hasTwoDecimalsAtMost(1.25), true);
  assert.equal(hasTwoDecimalsAtMost(1.255), false);
  assert.equal(maxAmount, 99_999);
});
