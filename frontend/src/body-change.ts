import { shiftDate } from './daily-date';

export type BodyRecord = {
  date: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  waistCm: number | null;
  systolicMmhg: number | null;
  diastolicMmhg: number | null;
  memo: string | null;
};

export const changeWindows = [7, 30, 90];

type ChangeKey = 'weightKg' | 'bodyFatPercent' | 'waistCm';

export type Change = { amount: number; from: string; to: string };

/**
 * The change between the first and last measurement in the days ending at `date`.
 * Null with fewer than two measurements: a single reading is not a change.
 */
export function changeOver(
  records: BodyRecord[],
  key: ChangeKey,
  date: string,
  days: number,
): Change | null {
  const start = shiftDate(date, 1 - days);
  const measured = records
    .filter((record) => record.date >= start && record.date <= date && record[key] !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (measured.length < 2) return null;
  const first = measured[0];
  const last = measured[measured.length - 1];
  // Whole hundredths, so 70.1 - 70 does not show as 0.09999999999999432.
  const amount = (Math.round(last[key]! * 100) - Math.round(first[key]! * 100)) / 100;
  return { amount, from: first.date, to: last.date };
}

export function formatChange(change: Change, unit: string) {
  if (change.amount === 0) return `변화 없음`;
  return `${change.amount > 0 ? '+' : '−'}${Math.abs(change.amount)}${unit}`;
}
