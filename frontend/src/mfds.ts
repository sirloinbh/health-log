// The MFDS food nutrition lookup (#118): what GET /api/foods/mfds answers, and how a picked match fills
// the food form. Nothing here saves; the person checks the draft and presses Save.

import type { Form } from './food-form';

/** A match's food draft, already converted to the total content by the API. */
export type MfdsDraft = {
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  sugars: number | null;
  sodium: number | null;
  sourceType: 'public';
  sourceUrl: string;
};

export type MfdsResult = {
  code: string;
  name: string;
  maker: string | null;
  group: string | null;
  /** The amount the database's values are for, such as "100g". */
  basis: string;
  /** The total content, such as "77g", or null when the database has none. */
  total: string | null;
  updatedOn: string | null;
  food: MfdsDraft;
};

export type MfdsAnswer =
  // total: matches in the database; read: how many this answer looked at (repeats show once).
  | { state: 'ok'; total: number; read: number; results: MfdsResult[] }
  | { state: 'off' }
  | { state: 'unavailable' };

export const mfdsPath = (q: string, maker: string) => {
  const params = new URLSearchParams({ q });
  if (maker) params.set('maker', maker);
  return `/api/foods/mfds?${params.toString()}`;
};

export const offText =
  'The MFDS lookup is not set up on this server. Paste the nutrition table or enter the values by hand.';
export const unavailableText =
  'The MFDS database cannot be reached right now. Try again later, or enter the values by hand.';
export const noMatchText =
  'No food in the MFDS database matches. Check the spelling, try a shorter name, or enter the values by hand.';

/** Said when the answer looked at only part of the matches. */
export const moreText = (read: number, total: number) =>
  total > read
    ? `The database has ${total} matches and only the first ${read} were read. Add the maker or a longer name to narrow them.`
    : null;

/**
 * One match in the list: its amount and main values as the draft would save them. The database can
 * hold the same name more than once with other values, so calories alone cannot tell them apart.
 */
export const resultText = (result: MfdsResult) => {
  const { food } = result;
  const value = (label: string, amount: number | null, unit: string) =>
    `${label} ${amount === null ? '?' : `${amount}${unit}`}`;
  return [
    result.maker,
    result.group,
    `${food.servingSize}${food.servingUnit}`,
    `${food.calories === null ? '?' : food.calories}kcal`,
    [
      value('carbs', food.carbs, 'g'),
      value('protein', food.protein, 'g'),
      value('fat', food.fat, 'g'),
    ].join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
};

/**
 * Fills the form from a picked match. The draft replaces the name, brand, serving and every value
 * (an unknown one is cleared, not kept from before); the category and the junk food mark stay as they
 * are. `today` is the verified date, in the service time zone.
 */
export function fillFromMfds(form: Form, result: MfdsResult, today: string) {
  const { food } = result;
  const text = (value: number | null) => (value === null ? '' : String(value));
  const unknown = (
    [
      ['Calories', food.calories],
      ['Carbs', food.carbs],
      ['Protein', food.protein],
      ['Fat', food.fat],
      ['Sugars', food.sugars],
      ['Sodium', food.sodium],
    ] as const
  )
    .filter(([, value]) => value === null)
    .map(([label]) => label);
  const converted =
    result.total !== null && `${food.servingSize}${food.servingUnit}` !== result.basis;
  return {
    form: {
      ...form,
      name: food.name,
      brand: food.brand ?? '',
      servingSize: String(food.servingSize),
      servingUnit: food.servingUnit,
      calories: text(food.calories),
      carbs: text(food.carbs),
      protein: text(food.protein),
      fat: text(food.fat),
      sugars: text(food.sugars),
      sodium: text(food.sodium),
      sourceType: food.sourceType,
      sourceUrl: food.sourceUrl,
      checkedOn: today,
    },
    lines: [
      `Filled in from the MFDS database: ${result.name}`,
      converted
        ? `The database gives values per ${result.basis}; they were converted to the total content (${food.servingSize}${food.servingUnit}).`
        : `The values are per ${food.servingSize}${food.servingUnit}, as the database gives them.`,
      ...(unknown.length ? [`The database has no value for: ${unknown.join(', ')}`] : []),
      'Check the values, then press Save to save them.',
    ],
  };
}
