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

export type PeriodWords = { name: string; previous: string; same: string };

// 주 ends in a vowel and 달 in a consonant, so "the same as" takes 와 and 과.
export const periodWords: Record<Period, PeriodWords> = {
  week: { name: '주', previous: '지난주', same: '지난주와 같음' },
  month: { name: '달', previous: '지난달', same: '지난달과 같음' },
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
  words: PeriodWords,
  format: (magnitude: number) => string,
) => {
  if (current === null) return null;
  if (previous === null) return `${words.previous} 기록 없음`;
  const change = current - previous;
  if (change === 0) return words.same;
  return `${words.previous}보다 ${signed(change, format(Math.abs(change)))}`;
};

export const shareOf = ({ days, yes }: Count) => (days ? Math.round((yes / days) * 100) : null);

export const daysText = (days: number) => `기록한 날 ${days}일`;

/** Fewer nights than this in either group make the comparison too thin to lean on. */
export const fewNights = 5;

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** "11월 2일 ~ 11월 8일" */
export const spanLabel = ({ from, to }: { from: string; to: string }) =>
  `${monthDay(from)} ~ ${monthDay(to)}`;

/** The date to ask for one period before or after the one that holds `date`. */
export const shiftPeriod = (period: Period, from: string, step: -1 | 1) => {
  const start = Date.parse(`${from}T00:00:00Z`);
  if (period === 'week') return new Date(start + step * 7 * 86_400_000).toISOString().slice(0, 10);
  const day = new Date(start);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + step, 1))
    .toISOString()
    .slice(0, 10);
};
