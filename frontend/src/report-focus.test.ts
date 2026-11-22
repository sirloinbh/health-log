import { describe, expect, test } from 'vitest';

import {
  initialReportFocus,
  type ReportFocus,
  reportFocus,
  type ReportFocusEvent,
} from './report-focus';

const run = (...events: ReportFocusEvent[]): ReportFocus =>
  events.reduce(reportFocus, initialReportFocus);

/** Where focus was last sent after the events, or null if nowhere. */
const target = (...events: ReportFocusEvent[]) => run(...events).target?.to ?? null;

const move: ReportFocusEvent = { type: 'move', arrival: false };
const arrival: ReportFocusEvent = { type: 'move', arrival: true };
const load: ReportFocusEvent = { type: 'load' };
const retry: ReportFocusEvent = { type: 'retry' };
const ok: ReportFocusEvent = { type: 'done', outcome: 'ok' };
const failed: ReportFocusEvent = { type: 'done', outcome: 'failed' };

describe('where focus goes when a load ends', () => {
  test.each<[name: string, events: ReportFocusEvent[], to: 'span' | 'retry' | null]>([
    ['the first report leaves focus alone', [load, ok], null],
    ['a first report that fails leaves focus alone', [load, failed], null],
    ['a period button keeps its focus when the report comes', [move, load, ok], null],
    ['a period button whose report fails sends focus to Try again', [move, load, failed], 'retry'],
    ['"This week" sends focus to the period once it is shown', [arrival, load, ok], 'span'],
    ['"This week" whose report fails sends focus to Try again', [arrival, load, failed], 'retry'],
    ['a retry that works sends focus to the period', [load, failed, retry, ok], 'span'],
    ['a retry that fails again leaves focus on its button', [load, failed, retry, failed], null],
  ])('%s', (_name, events, to) => {
    expect(target(...events)).toBe(to);
  });
});

test('a retry keeps its button until it ends', () => {
  expect(run(load, failed, retry).running).toBe('retry');
  expect(run(load, failed, retry, ok).running).toBe('none');
  expect(run(load, failed, retry, failed).running).toBe('none');
});

test('a new period ends a retry still on its way', () => {
  expect(run(load, failed, retry, move, load).running).toBe('move');
  // The address changed without a button: the load is not a retry either.
  expect(run(load, failed, retry, load).running).toBe('none');
});

test('a move is used by the next load only', () => {
  // "This week" failed; the next report, from somewhere else, does not take the focus.
  expect(target(arrival, load, failed, load, ok)).toBe('retry');
  expect(run(arrival, load, failed, load, ok).target?.n).toBe(1);
  // A later plain move replaces a "This week" not yet loaded.
  expect(target(arrival, move, load, ok)).toBeNull();
});

test('asking for the same place again is a new target, so focus moves again', () => {
  const first = run(move, load, failed);
  const second = [move, load, failed].reduce(reportFocus, first);
  expect(second.target).toEqual({ to: 'retry', n: 2 });
});
