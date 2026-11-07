import { spanText } from './habit-text';
import { minutesText } from './report-text';

/** Where goals are set: the same as pages.settings in app.tsx. */
export const goalSettingsPath = '/settings';

export const goalItems = ['calories', 'protein', 'sleep', 'sober_days'] as const;
export type GoalItem = (typeof goalItems)[number];

export type Goal = { from: string; target: number } | null;
export type Goals = {
  today: string;
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

/** What the person types, and what it becomes for the API. Sleep is typed in hours, kept in minutes. */
export const goalFields: Record<
  GoalItem,
  { title: string; label: string; unit: string; min: number; max: number; example: string }
> = {
  calories: {
    title: '칼로리',
    label: '하루 칼로리 상한',
    unit: 'kcal',
    min: 100,
    max: 10_000,
    example: '2000',
  },
  protein: {
    title: '단백질',
    label: '하루 단백질 하한',
    unit: 'g',
    min: 1,
    max: 1000,
    example: '100',
  },
  sleep: { title: '수면', label: '하루 수면 시간', unit: '시간', min: 1, max: 24, example: '7.5' },
  sober_days: { title: '금주', label: '주 금주 일수', unit: '일', min: 1, max: 7, example: '5' },
};

const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/** "하루 2,000kcal 이하" */
export function targetText(item: GoalItem, target: number) {
  switch (item) {
    case 'calories':
      return `하루 ${number(target)}kcal 이하`;
    case 'protein':
      return `하루 ${number(target)}g 이상`;
    case 'sleep':
      return `${minutesText(target)} 이상`;
    case 'sober_days':
      return `주 ${target}일 이상 금주`;
  }
}

/** The goal as it stands from a date: its target, or that it was turned off. */
export const changeText = (item: GoalItem, target: number | null) =>
  target === null ? '목표 끔' : targetText(item, target);

/** A number typed in the form, as the API takes it; a string says why it cannot be. */
export function toTarget(item: GoalItem, value: number): number | string {
  const { label, unit, min, max } = goalFields[item];
  if (value < min || value > max) return `${label}: ${min}~${max}${unit} 사이로 입력해 주세요`;
  if (item === 'sleep') {
    const minutes = value * 60;
    // 7.33 hours is 439.8 minutes: no whole minute to store.
    if (Math.abs(minutes - Math.round(minutes)) > 1e-9) {
      return '수면 시간은 분 단위로 떨어지게 입력해 주세요 (예: 7.5)';
    }
    return Math.round(minutes);
  }
  return Number.isInteger(value) ? value : `${label}: 정수로 입력해 주세요`;
}

/** The stored target as it is typed back into the form. */
export const toTyped = (item: GoalItem, target: number) =>
  String(item === 'sleep' ? Number((target / 60).toFixed(4)) : target);

export const statusText: Record<Status, string> = {
  met: '달성',
  missed: '미달',
  unknown: '판정 보류',
  none: '기록 없음',
};

/** What the day's records add up to, said the same way whether or not a goal is set. */
export function actualText(day: GoalDayItem) {
  switch (day.item) {
    case 'calories':
    case 'protein': {
      const { entries, total, missing } = day.actual;
      if (entries === 0) return '식사 기록 없음';
      const unit = day.item === 'calories' ? 'kcal' : 'g';
      const sum = `${number(total ?? 0)}${unit}`;
      return missing ? `${sum} (값을 모르는 음식 ${missing}개 제외)` : sum;
    }
    case 'sleep':
      return day.actual.minutes === null ? '수면 기록 없음' : minutesText(day.actual.minutes);
    case 'sober_days': {
      const { recordedDays, soberDays } = day.actual;
      const span = spanText(day.actual);
      return recordedDays === 0
        ? `이 주(${span}) 술 기록 없음`
        : `이 주(${span}) 금주 ${soberDays}일 / 기록 ${recordedDays}일`;
    }
  }
}

/** Why a verdict is held, so "판정 보류" is never left unexplained. */
export const unknownReason = (item: GoalItem) =>
  item === 'sober_days'
    ? '아직 기록하지 않은 날에 따라 달라집니다'
    : '값을 모르는 음식이 있어 판정할 수 없습니다';
