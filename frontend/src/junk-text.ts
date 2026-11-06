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

/** "3회 · 먹은 날 2일 · 1850kcal" */
export function junkText({ times, days, calories }: JunkPeriod) {
  if (times === 0) return '없음';
  const kcal =
    calories.value === null
      ? '칼로리 값 없음'
      : calories.missing > 0
        ? `${calories.value}kcal 이상 (칼로리 모르는 기록 ${calories.missing}개 제외)`
        : `${calories.value}kcal`;
  return `${times}회 · 먹은 날 ${days}일 · ${kcal}`;
}
