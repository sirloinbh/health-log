import { shortMonthDay } from './daily-date';
import { count } from './plural';

export const drinkKinds = {
  soju: 'Soju',
  beer: 'Beer',
  wine: 'Wine',
  makgeolli: 'Makgeolli',
  whisky: 'Spirits',
  other: 'Other',
} as const;

export const drinkUnits = { glass: 'glass', bottle: 'bottle', can: 'can' } as const;

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

/** "Soju 1 bottle, Beer 2.5 glasses" */
export const drinksText = (drinks: Drink[]) =>
  drinks
    .map(
      ({ kind, unit, amount }) =>
        `${drinkKinds[kind]} ${amount} ${drinkUnits[unit]}${amount === 1 ? '' : unit === 'glass' ? 'es' : 's'}`,
    )
    .join(', ');

export const smokingText = (cigarettes: number | null) =>
  cigarettes === null
    ? 'Not recorded'
    : cigarettes === 0
      ? 'No smoking'
      : count(cigarettes, 'cigarette');

export const drinkingText = (drinks: Drink[] | null) =>
  drinks === null ? 'Not recorded' : drinks.length === 0 ? 'No drinking' : drinksText(drinks);

/** "Nov 2 – Nov 8" */
export const spanText = ({ from, to }: { from: string; to: string }) =>
  `${shortMonthDay(from)} – ${shortMonthDay(to)}`;

export const summaryLines = ({ smoking, drinking }: HabitSummary) => ({
  // A period with no recorded day says so, instead of a total of zero nobody counted.
  smoking:
    smoking.days === 0
      ? 'No records'
      : `${count(smoking.cigarettes ?? 0, 'cigarette')} (${count(smoking.days, 'day')} recorded)`,
  drinking:
    drinking.days === 0
      ? 'No records'
      : `Drank on ${count(drinking.drinkingDays, 'day')} / ${count(drinking.days, 'day')} recorded` +
        (drinking.totals.length ? ` · ${drinksText(drinking.totals)}` : ''),
});
