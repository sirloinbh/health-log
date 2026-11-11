import { shortMonthDay } from './daily-date';
import { count } from './plural';

export type Period = 'week' | 'month';

type Count = { days: number; yes: number };
export type ReportSummary = {
  from: string;
  to: string;
  sleep: { days: number; averageMinutes: number | null };
  calories: { days: number; incompleteDays: number; average: number | null };
  drinking: { days: number; drinkingDays: number };
  smoking: { days: number; cigarettes: number | null; averagePerDay: number | null };
  diet: Count;
  sleepGood: Count;
};
type ReportDay = {
  date: string;
  sleepMinutes: number | null;
  calories: number | null;
  drank: boolean | null;
};
type Night = { nights: number; averageMinutes: number | null };
export type Report = {
  period: Period;
  current: ReportSummary;
  previous: ReportSummary;
  days: ReportDay[];
  sleepAfterDrinking: { afterDrinking: Night; afterNoDrinking: Night };
};

export type PeriodWords = { name: string; previous: string };

// How each period is named on screen.
export const periodWords: Record<Period, PeriodWords> = {
  week: { name: 'week', previous: 'last week' },
  month: { name: 'month', previous: 'last month' },
};

/** "7 h 30 min" */
export const minutesText = (minutes: number) => {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

const signed = (value: number, text: string) =>
  value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;

/**
 * How this period compares with the one before. Either side without a record has nothing to
 * compare, which is said instead of a change.
 */
export const changeText = (
  current: number | null,
  previous: number | null,
  previousDays: number,
  words: PeriodWords,
  format: (magnitude: number) => string,
) => {
  if (current === null) return null;
  if (previous === null) return `No records ${words.previous}`;
  // The earlier period's day count, so a change against one recorded day reads as thin as it is.
  const earlier = `${words.previous} (${count(previousDays, 'day')})`;
  const change = current - previous;
  if (change === 0) return `Same as ${earlier}`;
  return `${signed(change, format(Math.abs(change)))} vs ${earlier}`;
};

export const shareOf = ({ days, yes }: Count) => (days ? Math.round((yes / days) * 100) : null);

export const daysText = (days: number) => `${count(days, 'day')} recorded`;

/** Fewer nights than this in either group make the comparison too thin to lean on. */
export const fewNights = 5;

const yearOf = (date: string) => Number(date.slice(0, 4));

/**
 * "Nov 2 – Nov 8" for a period of this year. Another year, or one the period crosses, is
 * written out, as the daily page does ("Jan 1, 2000"): "Nov 1 – Nov 30, 2025",
 * "Dec 27, 1999 – Jan 2, 2000" (#129). Without the server's today the year is written too.
 */
export const spanLabel = ({ from, to }: { from: string; to: string }, today: string | null) => {
  if (yearOf(from) !== yearOf(to)) {
    return `${shortMonthDay(from)}, ${yearOf(from)} – ${shortMonthDay(to)}, ${yearOf(to)}`;
  }
  if (today === null || yearOf(today) !== yearOf(from)) {
    return `${shortMonthDay(from)} – ${shortMonthDay(to)}, ${yearOf(from)}`;
  }
  return `${shortMonthDay(from)} – ${shortMonthDay(to)}`;
};

/**
 * The period holding `date`, as the server counts it (backend/src/day-records.ts `periodsOf`):
 * weeks run Monday to Sunday. The buttons step from the period asked for, so pressing twice
 * before the first answer arrives moves two periods (#138).
 */
export const periodSpan = (period: Period, date: string) => {
  const day = Date.parse(`${date}T00:00:00Z`);
  const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
  if (period === 'week') {
    const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * 86_400_000;
    return { from: toDate(monday), to: toDate(monday + 6 * 86_400_000) };
  }
  const [year, month] = date.split('-').map(Number);
  return { from: `${date.slice(0, 7)}-01`, to: toDate(Date.UTC(year, month, 0)) };
};

/** The date to ask for one period before or after the one that holds `date`. */
export const shiftPeriod = (period: Period, from: string, step: -1 | 1) => {
  const start = Date.parse(`${from}T00:00:00Z`);
  if (period === 'week') return new Date(start + step * 7 * 86_400_000).toISOString().slice(0, 10);
  const day = new Date(start);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + step, 1))
    .toISOString()
    .slice(0, 10);
};
