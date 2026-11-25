// Water (ml) and caffeine (mg) counters of a day (#325). The server decides how much one tap adds.
export const intakeKinds = ['water', 'coffee', 'tea', 'energy', 'other_caffeine'] as const;
export type IntakeKind = (typeof intakeKinds)[number];

export type IntakeDay = {
  date: string;
  kinds: Record<IntakeKind, { count: number; amount: number }>;
  waterMl: number;
  caffeineMg: number;
};

export const intakeLabels: Record<IntakeKind, string> = {
  water: 'Water',
  coffee: 'Coffee',
  tea: 'Tea',
  energy: 'Energy drink',
  other_caffeine: 'Other caffeine',
};

/** Water counts in ml, every other kind in mg of caffeine. */
export const intakeUnit = (kind: IntakeKind) => (kind === 'water' ? 'ml' : 'mg');

export const amountText = (kind: IntakeKind, amount: number) =>
  `${amount.toLocaleString('en-US')} ${intakeUnit(kind)}`;

/** The one-line total under the counters. */
export const intakeSummary = (day: IntakeDay) =>
  `Water ${amountText('water', day.waterMl)} · Caffeine ${amountText('coffee', day.caffeineMg)}`;
