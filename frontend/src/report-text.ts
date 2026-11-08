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

export type PeriodWords = { name: string; previous: string; with: string };

// 주 ends in a vowel and 달 in a consonant, so "with" is 와 for one and 과 for the other.
export const periodWords: Record<Period, PeriodWords> = {
  week: { name: '주', previous: '지난주', with: '와' },
  month: { name: '달', previous: '지난달', with: '과' },
};

/** "7시간 30분" */
export const minutesText = (minutes: number) => {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
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
  if (previous === null) return `${words.previous} 기록 없음`;
  // The earlier period's day count, so a change against one recorded day reads as thin as it is.
  const earlier = `${words.previous}(${previousDays}일)`;
  const change = current - previous;
  if (change === 0) return `${earlier}${words.with} 같음`;
  return `${earlier}보다 ${signed(change, format(Math.abs(change)))}`;
};

export const shareOf = ({ days, yes }: Count) => (days ? Math.round((yes / days) * 100) : null);

export const daysText = (days: number) => `기록한 날 ${days}일`;

/** Fewer nights than this in either group make the comparison too thin to lean on. */
export const fewNights = 5;

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

const yearOf = (date: string) => Number(date.slice(0, 4));

/**
 * "11월 2일 ~ 11월 8일" for a period of this year. Another year, or one the period crosses, is
 * written out, as the daily page does ("2000년 1월 1일"): "2025년 11월 1일 ~ 11월 30일",
 * "1999년 12월 27일 ~ 2000년 1월 2일" (#129). Without the server's today the year is written too.
 */
export const spanLabel = ({ from, to }: { from: string; to: string }, today: string | null) => {
  if (yearOf(from) !== yearOf(to)) {
    return `${yearOf(from)}년 ${monthDay(from)} ~ ${yearOf(to)}년 ${monthDay(to)}`;
  }
  if (today === null || yearOf(today) !== yearOf(from)) {
    return `${yearOf(from)}년 ${monthDay(from)} ~ ${monthDay(to)}`;
  }
  return `${monthDay(from)} ~ ${monthDay(to)}`;
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
