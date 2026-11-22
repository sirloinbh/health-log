import { describe, expect, test } from 'vitest';

import {
  type Draft,
  draftOf,
  type ProcedureDraft,
  readCost,
  readDraft,
  tooLong,
} from './visit-form';
import type { Visit } from './visit-text';

// Made-up values only: no real visit belongs in tests.
const procedure = (fields: Partial<ProcedureDraft> = {}): ProcedureDraft => ({
  key: 1,
  name: '가상 시술',
  area: '',
  amount: '',
  cost: '',
  note: '',
  ...fields,
});

const draft = (fields: Partial<Draft> = {}): Draft => ({
  date: '2026-03-15',
  clinic: '가상의원',
  department: '',
  note: '',
  cost: '',
  nextVisitOn: '',
  procedures: [],
  ...fields,
});

const range = 'Records can be kept from 2000-01-01 to 2099-12-31';

describe('readDraft gives the first reason a visit cannot be sent', () => {
  test.each<[rule: string, form: Draft, reason: string]>([
    ['the visit date is missing', draft({ date: '' }), 'Choose a visit date'],
    ['the visit date is not a real day', draft({ date: '2026-02-30' }), 'Choose a visit date'],
    [
      'the visit date is before the daily range',
      draft({ date: '1999-12-31' }),
      `Visit date: ${range}`,
    ],
    [
      'the visit date is after the daily range',
      draft({ date: '2100-01-01' }),
      `Visit date: ${range}`,
    ],
    ['the clinic name is blank', draft({ clinic: '   ' }), 'Enter the clinic name'],
    [
      'the clinic name is over 100 characters',
      draft({ clinic: '🏥'.repeat(101) }),
      'Clinic name must be 100 characters or fewer',
    ],
    [
      'the department is over 50 characters',
      draft({ department: '가'.repeat(51) }),
      'Department must be 50 characters or fewer',
    ],
    [
      'the note is over 1000 characters',
      draft({ note: '가'.repeat(1001) }),
      'Symptoms and diagnosis note must be 1000 characters or fewer',
    ],
    [
      'the visit cost is not whole won',
      draft({ cost: '1.5' }),
      'Visit cost: enter whole won, for example 12000 or 12,000',
    ],
    [
      'the visit cost is over 100 million won',
      draft({ cost: '100,000,001' }),
      'Visit cost must be 100 million won or less',
    ],
    [
      'the next appointment is not a real day',
      draft({ nextVisitOn: '2026-04-31' }),
      'The next appointment date is not valid',
    ],
    [
      'the next appointment is after the daily range',
      draft({ nextVisitOn: '2100-01-01' }),
      `Next appointment: ${range}`,
    ],
    [
      'the next appointment is before the visit',
      draft({ nextVisitOn: '2026-03-14' }),
      'The next appointment date cannot be before the visit date',
    ],
    [
      'a procedure has no name',
      draft({ procedures: [procedure({ name: ' ' })] }),
      'Procedure 1: enter a name',
    ],
    [
      'a procedure name is over 100 characters',
      draft({ procedures: [procedure({ name: '가'.repeat(101) })] }),
      'Procedure 1 name must be 100 characters or fewer',
    ],
    [
      'a procedure area is over 50 characters',
      draft({ procedures: [procedure({ area: '가'.repeat(51) })] }),
      'Procedure 1 area must be 50 characters or fewer',
    ],
    [
      'a procedure dose is over 50 characters',
      draft({ procedures: [procedure({ amount: '가'.repeat(51) })] }),
      'Procedure 1 dose or count must be 50 characters or fewer',
    ],
    [
      'a procedure note is over 500 characters',
      draft({ procedures: [procedure({ note: '가'.repeat(501) })] }),
      'Procedure 1 note must be 500 characters or fewer',
    ],
    [
      'a procedure cost is not whole won',
      draft({ procedures: [procedure({ cost: '12,00' })] }),
      'Procedure 1 cost: enter whole won, for example 12000 or 12,000',
    ],
    [
      'a procedure cost is over 100 million won',
      draft({ procedures: [procedure({ cost: '100000001' })] }),
      'Procedure 1 cost must be 100 million won or less',
    ],
    [
      'the second procedure is the one at fault',
      draft({ procedures: [procedure(), procedure({ key: 2, name: '' })] }),
      'Procedure 2: enter a name',
    ],
  ])('%s', (_rule, form, reason) => {
    expect(readDraft(form)).toBe(reason);
  });

  test('the visit is checked before its procedures', () => {
    expect(readDraft(draft({ clinic: '', procedures: [procedure({ name: '' })] }))).toBe(
      'Enter the clinic name',
    );
  });
});

describe('readDraft builds the request body from a valid form', () => {
  test('blanks are sent as typed, costs as whole won and a blank appointment as null', () => {
    expect(
      readDraft(
        draft({
          cost: '12,000',
          procedures: [procedure({ area: 'Forehead', cost: '50000', note: '가상 메모' })],
        }),
      ),
    ).toEqual({
      date: '2026-03-15',
      clinic: '가상의원',
      department: '',
      note: '',
      cost: 12000,
      nextVisitOn: null,
      procedures: [
        { name: '가상 시술', area: 'Forehead', amount: '', cost: 50000, note: '가상 메모' },
      ],
    });
  });

  test.each<[edge: string, form: Draft]>([
    ['an appointment on the visit day', draft({ nextVisitOn: '2026-03-15' })],
    [
      'the first and last days of the range',
      draft({ date: '2000-01-01', nextVisitOn: '2099-12-31' }),
    ],
    ['exactly 100 million won', draft({ cost: '100,000,000' })],
    ['a clinic name of exactly 100 characters', draft({ clinic: '🏥'.repeat(100) })],
    ['spaces around a full-length name do not count', draft({ clinic: ` ${'가'.repeat(100)} ` })],
  ])('%s is accepted', (_edge, form) => {
    expect(typeof readDraft(form)).toBe('object');
  });
});

test('tooLong names the first field over its limit, counting characters, not UTF-16 units', () => {
  expect(tooLong([['Name', '🏥'.repeat(10), 10]])).toBeNull();
  expect(
    tooLong([
      ['First', 'ab', 1],
      ['Second', 'abc', 1],
    ]),
  ).toBe('First must be 1 characters or fewer');
});

test('readCost reads blank as no cost and says why a cost cannot be read', () => {
  expect(readCost('Cost', '')).toBeNull();
  expect(readCost('Cost', '1,234')).toBe(1234);
  expect(readCost('Cost', '-1')).toBe('Cost: enter whole won, for example 12000 or 12,000');
});

test('draftOf fills the form from a saved visit, or starts blank on the given day', () => {
  const visit: Visit = {
    id: 7,
    date: '2026-03-10',
    clinic: '가상피부과',
    department: null,
    note: null,
    cost: 12000,
    nextVisitOn: null,
    procedures: [{ name: '가상 레이저', area: null, amount: '1', cost: null, note: null }],
  };
  const filled = draftOf(visit, '2026-03-15');
  expect(filled).toMatchObject({
    date: '2026-03-10',
    clinic: '가상피부과',
    department: '',
    note: '',
    cost: '12000',
    nextVisitOn: '',
  });
  expect(filled.procedures).toMatchObject([
    { name: '가상 레이저', area: '', amount: '1', cost: '', note: '' },
  ]);
  // Rows need their own keys to be added and removed.
  expect(draftOf(visit, '').procedures[0].key).not.toBe(filled.procedures[0].key);
  expect(draftOf(null, '2026-03-15')).toEqual(draft({ clinic: '' }));
});
