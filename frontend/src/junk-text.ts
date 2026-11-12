import { count } from './plural';

/** Junk food of a week or a month, as the meals API answers it (#38). */
export type JunkPeriod = {
  from: string;
  to: string;
  /** Entries marked junk food: each one is a time eaten, whatever its servings. */
  times: number;
  /** Days with at least one of them. */
  days: number;
  /** Calories of those entries; `missing` counts the ones whose calories are not known. */
  calories: { value: number | null; missing: number };
};

/** "3 times · 2 days · 1850kcal" */
export function junkText({ times, days, calories }: JunkPeriod) {
  if (times === 0) return 'None';
  const kcal =
    calories.value === null
      ? 'No calorie value'
      : calories.missing > 0
        ? `${calories.value}kcal or more (excludes ${count(calories.missing, 'record')} with unknown calories)`
        : `${calories.value}kcal`;
  return `${count(times, 'time')} · ${count(days, 'day')} · ${kcal}`;
}
