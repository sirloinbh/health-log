import { spanText } from './habit-text';
import { count } from './plural';
import { minutesText } from './report-text';

/** Where goals are set: the same as pages.settings in app.tsx. */
export const goalSettingsPath = '/settings';

export const goalItems = ['calories', 'protein', 'sleep', 'sober_days'] as const;
export type GoalItem = (typeof goalItems)[number];

export type Goal = { from: string; target: number } | null;
export type Goals = {
  today: string;
  /** Today's Monday-to-Sunday week. */
  week: { from: string; to: string };
  /** Daily goals as of today; sober days as of this week's Sunday. */
  current: Record<GoalItem, Goal>;
  /** Every change, newest first within each item. A null target turned the goal off. */
  history: { item: GoalItem; from: string; target: number | null }[];
};

/** unknown: recorded, but not enough to decide. none: nothing recorded, which is never a miss. */
export type Status = 'met' | 'missed' | 'unknown' | 'none';

type Sum = { entries: number; total: number | null; missing: number };
type Judged<I, A> = { item: I; goal: Goal; status: Status | null; actual: A };
export type GoalDayItem =
  | Judged<'calories' | 'protein', Sum>
  | Judged<'sleep', { minutes: number | null }>
  | Judged<'sober_days', { from: string; to: string; recordedDays: number; soberDays: number }>;

export type GoalDay = {
  date: string;
  items: GoalDayItem[];
  checks: { dietKept: boolean | null; sleepGood: boolean | null } | null;
};

/** What the person types, and what it becomes for the API. Sleep is typed in hours and minutes. */
export const goalFields: Record<
  GoalItem,
  { title: string; label: string; unit: string; min: number; max: number; example: string }
> = {
  calories: {
    title: 'Calories',
    label: 'Daily calorie limit',
    unit: 'kcal',
    min: 100,
    max: 10_000,
    example: '2000',
  },
  protein: {
    title: 'Protein',
    label: 'Daily protein minimum',
    unit: 'g',
    min: 1,
    max: 1000,
    example: '100',
  },
  sleep: {
    title: 'Sleep',
    label: 'Daily sleep time',
    unit: 'hours',
    min: 1,
    max: 24,
    example: '7',
  },
  sober_days: {
    title: 'Alcohol-free',
    label: 'Alcohol-free days per week',
    unit: 'days',
    min: 1,
    max: 7,
    example: '5',
  },
};

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "Up to 2,000 kcal a day" */
export function targetText(item: GoalItem, target: number) {
  switch (item) {
    case 'calories':
      return `Up to ${number(target)}kcal a day`;
    case 'protein':
      return `At least ${number(target)}g a day`;
    case 'sleep':
      return `At least ${minutesText(target)}`;
    case 'sober_days':
      return `At least ${count(target, 'alcohol-free day')} a week`;
  }
}

/** The goal as it stands from a date: its target, or that it was turned off. */
export const changeText = (item: GoalItem, target: number | null) =>
  target === null ? 'Goal off' : targetText(item, target);

/** A number typed in the form, as the API takes it; a string says why it cannot be. Not for sleep. */
export function toTarget(item: Exclude<GoalItem, 'sleep'>, value: number): number | string {
  const { label, unit, min, max } = goalFields[item];
  if (value < min || value > max) return `${label}: enter ${min} to ${max} ${unit}`;
  return Number.isInteger(value) ? value : `${label}: enter a whole number`;
}

/**
 * Sleep is typed as hours and minutes, like the sleep card, and kept in minutes. Hours alone as a
 * decimal could not say 7 h 10 min.
 */
export function toSleepTarget(hours: number, minutes: number): number | string {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return 'Sleep time: enter hours and minutes as whole numbers';
  }
  if (minutes > 59) return 'Sleep time: enter minutes from 0 to 59';
  const total = hours * 60 + minutes;
  return total < 60 || total > 1440 ? 'Sleep time: enter between 1 and 24 hours' : total;
}

/** A stored sleep target as its two fields. */
export const sleepParts = (target: number) => ({
  hours: String(Math.floor(target / 60)),
  minutes: String(target % 60),
});

/**
 * The last start date that already counts now. Daily goals count from today; sober days from this
 * week's Sunday, as the whole week is judged by that day's goal (#107).
 */
export const countsUntil = (goals: Goals, item: GoalItem) =>
  item === 'sober_days' ? goals.week.to : goals.today;

/** "Current goal: …", or for sober days the goal this week is judged by, with the week. */
export function currentText(goals: Goals, item: GoalItem) {
  const goal = goals.current[item];
  const label =
    item === 'sober_days' ? `This week's goal (${spanText(goals.week)})` : 'Current goal';
  return goal
    ? `${label}: ${targetText(item, goal.target)} (from ${goal.from})`
    : `${label}: not set`;
}

/**
 * The goals once one change is deleted: the item's current goal is then its latest change that
 * already counts, as the server counts it. Shown at once, so a failed reload cannot leave the
 * deleted change on screen.
 */
export function withoutChange(goals: Goals, item: GoalItem, from: string): Goals {
  const history = goals.history.filter((change) => !(change.item === item && change.from === from));
  const until = countsUntil(goals, item);
  const latest = history.find((change) => change.item === item && change.from <= until);
  const current =
    latest && latest.target !== null ? { from: latest.from, target: latest.target } : null;
  return { ...goals, history, current: { ...goals.current, [item]: current } };
}

export const statusText: Record<Status, string> = {
  met: 'Met',
  missed: 'Missed',
  unknown: 'Undetermined',
  none: 'No records',
};

/** What the day's records add up to, said the same way whether or not a goal is set. */
export function actualText(day: GoalDayItem) {
  switch (day.item) {
    case 'calories':
    case 'protein': {
      const { entries, total, missing } = day.actual;
      if (entries === 0) return 'No meal records';
      // Nothing known to add up is not zero.
      if (total === null) return `${count(missing, 'food')} with unknown values`;
      const unit = day.item === 'calories' ? 'kcal' : 'g';
      const sum = `${number(total ?? 0)}${unit}`;
      return missing ? `${sum} (excludes ${count(missing, 'food')} with unknown values)` : sum;
    }
    case 'sleep':
      return day.actual.minutes === null ? 'No sleep record' : minutesText(day.actual.minutes);
    case 'sober_days': {
      const { recordedDays, soberDays } = day.actual;
      const span = spanText(day.actual);
      return recordedDays === 0
        ? `This week (${span}): no drink records`
        : `This week (${span}): ${count(soberDays, 'alcohol-free day')} / ${count(recordedDays, 'day')} recorded`;
    }
  }
}

/** Why a verdict is held, so "Undetermined" is never left unexplained. */
export const unknownReason = (item: GoalItem) =>
  item === 'sober_days'
    ? 'It depends on days not recorded yet'
    : 'Some foods have unknown values, so it cannot be judged';
