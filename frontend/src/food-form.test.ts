import { describe, expect, test } from 'vitest';

import { bodyOf, emptyForm, fillFromLabel, type Form, formOf, unreadableField } from './food-form';
import type { LabelReading } from './nutrition-label';

const today = '2026-11-22';

const reading = (part: Partial<LabelReading>): LabelReading => ({
  basis: null,
  basisFromTotal: false,
  total: null,
  values: {},
  lessThan: [],
  outOfRange: [],
  ...part,
});

// An official food already in the store, with every value filled.
const official: Form = {
  ...emptyForm,
  name: '치즈버거',
  brand: '버거집',
  servingSize: '120',
  servingUnit: 'g',
  calories: '300',
  carbs: '30',
  protein: '15',
  fat: '13',
  sugars: '6',
  sodium: '700',
  sourceType: 'official',
  sourceUrl: 'https://example.com/menu',
  checkedOn: '2026-10-31',
};

describe('fillFromLabel', () => {
  test('a table with a basis fills the serving and the values, and marks them as the label read today', () => {
    const result = fillFromLabel(
      emptyForm,
      reading({ basis: { size: 45, unit: 'g' }, values: { calories: 230, fat: 13 } }),
      today,
    );
    expect(result.kind).toBe('status');
    if (result.kind !== 'status') return;
    expect(result.form).toMatchObject({
      servingSize: '45',
      servingUnit: 'g',
      calories: '230',
      fat: '13',
      sourceType: 'label',
      checkedOn: today,
    });
    expect(result.lines[0]).toBe('Filled in: Serving size, Calories, Fat');
    expect(result.lines.at(-1)).toBe('Check the values, then press Save to save them.');
  });

  test('a new basis clears old values the table leaves out, says "less than", or cannot hold', () => {
    const result = fillFromLabel(
      official,
      reading({
        basis: { size: 100, unit: 'g' },
        values: { calories: 280, protein: 12 },
        lessThan: ['sugars'],
        outOfRange: ['sodium'],
      }),
      today,
    );
    if (result.kind !== 'status') throw new Error('expected a fill');
    expect(result.form).toMatchObject({
      calories: '280',
      protein: '12',
      sugars: '',
      sodium: '',
      carbs: '',
      fat: '',
    });
    // The name, brand and source address are not part of a table and stay as they were.
    expect(result.form).toMatchObject({
      name: '치즈버거',
      brand: '버거집',
      sourceUrl: official.sourceUrl,
    });
    expect(result.lines).toEqual(
      expect.arrayContaining([
        'Cleared because the table says "less than": Sugars',
        'Cleared because the value is too large: Sodium',
        'Cleared because the table has no value: Carbs, Fat',
        'The source type was changed to "Product label". Check that the source URL points to this product.',
      ]),
    );
  });

  test('a form that was not from published data gets no warning about its source type', () => {
    const result = fillFromLabel(
      { ...official, sourceType: 'estimate' },
      reading({ basis: { size: 100, unit: 'g' }, values: { calories: 280 } }),
      today,
    );
    expect(result.lines.some((line) => line.startsWith('The source type was changed'))).toBe(false);
  });

  test('a basis taken from the total amount says so, and a larger total says how many servings it is', () => {
    const fromTotal = fillFromLabel(
      emptyForm,
      reading({
        basis: { size: 90, unit: 'g' },
        basisFromTotal: true,
        total: { size: 90, unit: 'g' },
        values: { calories: 460 },
      }),
      today,
    );
    expect(fromTotal.lines).toContain(
      'No serving size was given, so the total amount (90g) was used as the basis. Correct it if the table is for another amount.',
    );
    const twice = fillFromLabel(
      emptyForm,
      reading({
        basis: { size: 45, unit: 'g' },
        total: { size: 90, unit: 'g' },
        values: { calories: 230 },
      }),
      today,
    );
    expect(twice.lines.join(' ')).toContain('2 times the serving size (45g), about 460kcal');
  });

  test('values without a basis change nothing and are listed to type in', () => {
    const result = fillFromLabel(
      official,
      reading({ values: { calories: 310, sodium: 90 } }),
      today,
    );
    expect(result).toEqual({
      kind: 'error',
      lines: [
        'Could not find the serving size, so no field was changed. It is not clear what amount the values are for.',
        'Values read: Calories 310kcal, Sodium 90mg',
        'Check the serving size and enter it by hand.',
      ],
    });
  });

  test('a basis without any value, or no table at all, changes nothing', () => {
    const basisOnly = fillFromLabel(official, reading({ basis: { size: 100, unit: 'ml' } }), today);
    expect(basisOnly.kind).toBe('error');
    expect(basisOnly.lines[0]).toBe(
      'Found the basis amount (100ml) but could not read the nutrition values, so no field was changed.',
    );
    const nothing = fillFromLabel(official, reading({}), today);
    expect(nothing.kind).toBe('error');
    expect(nothing.lines[0]).toBe(
      'Could not find a nutrition table. Only tables in text can be read.',
    );
  });

  test('the form given is never changed in place', () => {
    const before = { ...official };
    fillFromLabel(
      official,
      reading({ basis: { size: 100, unit: 'g' }, values: { calories: 1 } }),
      today,
    );
    expect(official).toEqual(before);
  });
});

describe('the form model', () => {
  test('a food opens as text and saves back as the same numbers, with blanks as no value', () => {
    const food = {
      id: 1,
      name: '우유',
      brand: null,
      category: null,
      servingSize: 200,
      servingUnit: 'mL',
      calories: 130,
      carbs: 9.5,
      protein: 6,
      fat: null,
      sugars: 0,
      sodium: 100,
      sourceType: 'public' as const,
      sourceUrl: null,
      checkedOn: null,
      isJunk: false,
    };
    const form = formOf(food);
    expect(form).toMatchObject({ brand: '', carbs: '9.5', fat: '', sugars: '0' });
    const { id: _id, ...saved } = food;
    expect(bodyOf(form)).toEqual(saved);
  });

  test('blank or spaced text is sent as no value', () => {
    expect(bodyOf({ ...emptyForm, name: 'x', brand: '  ', sourceUrl: '' })).toMatchObject({
      brand: null,
      sourceUrl: null,
      servingSize: null,
      calories: null,
    });
  });

  test('the first number that cannot be read is named, and readable numbers pass', () => {
    expect(unreadableField({ ...emptyForm, servingSize: '100', fat: '49,5' })).toBe('Fat (g)');
    expect(unreadableField({ ...emptyForm, servingSize: 'abc', fat: '49,5' })).toBe('Serving size');
    expect(unreadableField({ ...emptyForm, servingSize: '100', fat: '4.5' })).toBeUndefined();
  });
});
