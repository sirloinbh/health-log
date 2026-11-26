// Rules the API and the screens must count the same way (#215). This file is the source of truth: the
// screens import it directly, and `npm run contract:sync` copies it to backend/src/contract.ts, which is
// never edited by hand (ADR-0026: health-log opts in to the shared contract). It imports nothing, so the
// copy works on its own.

/**
 * Characters as PostgreSQL's char_length counts them: an emoji is one, not the two UTF-16 units that
 * `string.length` and an input's `maxLength` count (#92). Every text limit uses this.
 */
export const charCount = (value: string) => [...value].length;

/** Amounts are stored with two decimals; anything finer would be rounded silently, even down to zero. */
export const hasTwoDecimalsAtMost = (value: number) => Number(value.toFixed(2)) === value;

/** The largest amount a food or a meal entry can hold: calories, nutrients and the serving size. */
export const maxAmount = 99_999;

const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * The week (Monday to Sunday), the 12 weeks ending with it, and the calendar month that hold `date`. The date is already a day in
 * the service time zone; counting it as a UTC midnight keeps every boundary on the day it names,
 * whatever the zone of the server or the browser.
 */
export function periodsOf(date: string) {
  const day = Date.parse(`${date}T00:00:00Z`);
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  const monday = day - sinceMonday * 86_400_000;
  const [year, month] = date.split('-').map(Number);
  return {
    week: { from: toDay(monday), to: toDay(monday + 6 * 86_400_000) },
    // Twelve weeks (84 days) that end with the week holding `date` (#350).
    weeks12: { from: toDay(monday - 77 * 86_400_000), to: toDay(monday + 6 * 86_400_000) },
    // Day 0 of the next month is the last day of this one.
    month: { from: `${date.slice(0, 7)}-01`, to: toDay(Date.UTC(year, month, 0)) },
  };
}
