export const drinkKinds = {
  soju: '소주',
  beer: '맥주',
  wine: '와인',
  makgeolli: '막걸리',
  whisky: '양주',
  other: '기타',
} as const;

export const drinkUnits = { glass: '잔', bottle: '병', can: '캔' } as const;

export type DrinkKind = keyof typeof drinkKinds;
export type DrinkUnit = keyof typeof drinkUnits;
export type Drink = { kind: DrinkKind; unit: DrinkUnit; amount: number };

/** null: not recorded. 0 or []: recorded as none. */
export type HabitRecord = { date: string; cigarettes: number | null; drinks: Drink[] | null };

export type HabitSummary = {
  from: string;
  to: string;
  smoking: { days: number; cigarettes: number | null };
  drinking: { days: number; drinkingDays: number; totals: Drink[] };
};

export type HabitDay = { record: HabitRecord | null; week: HabitSummary; month: HabitSummary };

/** "소주 1병, 맥주 2.5잔" */
export const drinksText = (drinks: Drink[]) =>
  drinks
    .map(({ kind, unit, amount }) => `${drinkKinds[kind]} ${amount}${drinkUnits[unit]}`)
    .join(', ');

export const smokingText = (cigarettes: number | null) =>
  cigarettes === null ? '기록 안 함' : cigarettes === 0 ? '안 피움' : `${cigarettes}개비`;

export const drinkingText = (drinks: Drink[] | null) =>
  drinks === null ? '기록 안 함' : drinks.length === 0 ? '안 마심' : drinksText(drinks);

const monthDay = (date: string) => `${date.slice(5, 7)}.${date.slice(8, 10)}`;

/** "11.02~11.08" */
export const spanText = ({ from, to }: { from: string; to: string }) =>
  `${monthDay(from)}~${monthDay(to)}`;

export const summaryLines = ({ smoking, drinking }: HabitSummary) => ({
  // A period with no recorded day says so, instead of a total of zero nobody counted.
  smoking:
    smoking.days === 0
      ? '기록 없음'
      : `${smoking.cigarettes ?? 0}개비 (기록한 날 ${smoking.days}일)`,
  drinking:
    drinking.days === 0
      ? '기록 없음'
      : `마신 날 ${drinking.drinkingDays}일 / 기록한 날 ${drinking.days}일` +
        (drinking.totals.length ? ` · ${drinksText(drinking.totals)}` : ''),
});
