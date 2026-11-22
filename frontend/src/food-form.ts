// The food form model and the rules for filling it from a pasted nutrition table (#200). Nothing
// here renders or saves: the dialog in food-dialog.tsx shows the result and saves on Save only.

import { parseAmount } from './number-input';
import { type LabelReading, packageText } from './nutrition-label';

export const nutrients = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
] as const;

export const sourceLabels = {
  official: 'Official data',
  public: 'Public data',
  label: 'Product label',
  estimate: 'Estimate',
  manual: 'Manual entry',
} as const;

type NutrientKey = (typeof nutrients)[number]['key'];
export type SourceType = keyof typeof sourceLabels;

export type Food = Record<NutrientKey, number | null> & {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  servingSize: number;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  checkedOn: string | null;
  isJunk: boolean;
};

export type Form = Record<NutrientKey, string> & {
  name: string;
  brand: string;
  category: string;
  servingSize: string;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string;
  checkedOn: string;
  isJunk: boolean;
};

export const emptyForm: Form = {
  name: '',
  brand: '',
  category: '',
  servingSize: '',
  servingUnit: 'g',
  calories: '',
  carbs: '',
  protein: '',
  fat: '',
  sugars: '',
  sodium: '',
  sourceType: 'manual',
  sourceUrl: '',
  checkedOn: '',
  isJunk: false,
};

export const formOf = (food: Food): Form => ({
  name: food.name,
  brand: food.brand ?? '',
  category: food.category ?? '',
  servingSize: String(food.servingSize),
  servingUnit: food.servingUnit,
  calories: food.calories?.toString() ?? '',
  carbs: food.carbs?.toString() ?? '',
  protein: food.protein?.toString() ?? '',
  fat: food.fat?.toString() ?? '',
  sugars: food.sugars?.toString() ?? '',
  sodium: food.sodium?.toString() ?? '',
  sourceType: food.sourceType,
  sourceUrl: food.sourceUrl ?? '',
  checkedOn: food.checkedOn ?? '',
  isJunk: food.isJunk,
});

const textOrNull = (value: string) => value.trim() || null;

const numberFields = [
  { key: 'servingSize', label: 'Serving size' },
  ...nutrients.map(({ key, label, unit }) => ({ key, label: `${label} (${unit})` })),
] as const;

/** The label of the first number field that cannot be read, such as "49,5"; undefined when all can. */
export const unreadableField = (form: Form) =>
  numberFields.find(({ key }) => parseAmount(form[key]) === undefined)?.label;

/** The request body for a save. Blank text and blank numbers are sent as no value. */
export const bodyOf = (form: Form) => ({
  name: form.name,
  brand: textOrNull(form.brand),
  category: textOrNull(form.category),
  servingSize: parseAmount(form.servingSize),
  servingUnit: form.servingUnit,
  calories: parseAmount(form.calories),
  carbs: parseAmount(form.carbs),
  protein: parseAmount(form.protein),
  fat: parseAmount(form.fat),
  sugars: parseAmount(form.sugars),
  sodium: parseAmount(form.sodium),
  sourceType: form.sourceType,
  sourceUrl: textOrNull(form.sourceUrl),
  checkedOn: textOrNull(form.checkedOn),
  isJunk: form.isJunk,
});

/** What reading a table did: the form to show, or why it stays as it was, in lines to read out. */
export type LabelFill =
  { kind: 'status'; form: Form; lines: string[] } | { kind: 'error'; lines: string[] };

const labelOf = (key: NutrientKey) => nutrients.find((nutrient) => nutrient.key === key)!.label;

/**
 * Fills the form from a reading of a pasted table. `today` is the checked date, in the service time
 * zone. The result only fills the form; nothing is saved until Save is pressed, so the person
 * checks it first.
 */
export function fillFromLabel(form: Form, reading: LabelReading, today: string): LabelFill {
  const found = nutrients.filter(({ key }) => reading.values[key] !== undefined);
  // No value read: a basis alone would clear every field for nothing, so nothing changes.
  if (found.length === 0) {
    return {
      kind: 'error',
      lines: [
        reading.basis
          ? `Found the basis amount (${reading.basis.size}${reading.basis.unit}) but could not read the nutrition values, so no field was changed.`
          : 'Could not find a nutrition table. Only tables in text can be read.',
        'If the table is only an image or its layout differs, enter the values by hand.',
      ],
    };
  }
  // Values without the amount they are for would sit next to a serving size from somewhere else,
  // such as an official source's (#120). They are shown so they can be typed in with the size.
  const { basis } = reading;
  if (!basis) {
    return {
      kind: 'error',
      lines: [
        'Could not find the serving size, so no field was changed. It is not clear what amount the values are for.',
        `Values read: ${found.map(({ key, label, unit }) => `${label} ${reading.values[key]}${unit}`).join(', ')}`,
        'Check the serving size and enter it by hand.',
      ],
    };
  }
  const emptied = [...reading.lessThan, ...reading.outOfRange];
  // A new basis makes every old value wrong, so what the table leaves out is cleared too.
  const missing = nutrients.filter(
    ({ key }) => reading.values[key] === undefined && !emptied.includes(key),
  );
  const cleared = [...emptied, ...missing.map(({ key }) => key)];
  const wasPublished = form.sourceType === 'official' || form.sourceType === 'public';
  const total = packageText(reading);
  const listed = (prefix: string, keys: readonly NutrientKey[]) =>
    keys.length ? [`${prefix}: ${keys.map(labelOf).join(', ')}`] : [];
  return {
    kind: 'status',
    form: {
      ...form,
      servingSize: String(basis.size),
      servingUnit: basis.unit,
      ...Object.fromEntries(cleared.map((key) => [key, ''])),
      ...Object.fromEntries(found.map(({ key }) => [key, String(reading.values[key])])),
      // Values copied from the product's own table are its label, checked today (#34).
      sourceType: 'label',
      checkedOn: today,
    },
    lines: [
      `Filled in: ${['Serving size', ...found.map(({ label }) => label)].join(', ')}`,
      ...(reading.basisFromTotal
        ? [
            `No serving size was given, so the total amount (${basis.size}${basis.unit}) was used as the basis. Correct it if the table is for another amount.`,
          ]
        : []),
      ...listed('Cleared because the table says "less than"', reading.lessThan),
      ...listed('Cleared because the value is too large', reading.outOfRange),
      ...listed(
        'Cleared because the table has no value',
        missing.map(({ key }) => key),
      ),
      ...(wasPublished
        ? [
            'The source type was changed to "Product label". Check that the source URL points to this product.',
          ]
        : []),
      ...(total ? [total] : []),
      'Check the values, then press Save to save them.',
    ],
  };
}
