import type { MealKey } from './meal-entry';

// The quick entry page's starting meal comes from the time of day in Asia/Seoul (#329, user
// decision 2026-11-26): breakfast from 05:00, lunch from 10:00, dinner from 15:00, and snack from
// 21:00 until 05:00.
const hourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  hourCycle: 'h23',
});

/** The meal a recent food goes to at `now`, by the hour in Asia/Seoul. */
export function mealAt(now: Date): MealKey {
  const hour = Number(hourFormat.format(now));
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
  return 'snack';
}

/** "3 cups · 750 ml" for the water counter. */
export const waterText = (count: number, amount: number) =>
  `${count} ${count === 1 ? 'cup' : 'cups'} · ${amount.toLocaleString('en-US')} ml`;
