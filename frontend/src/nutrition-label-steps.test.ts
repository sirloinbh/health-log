// The steps of readNutritionLabel, each on its own (#201). The whole reader is covered by
// nutrition-label.test.ts; these pin the decisions in between.
import { describe, expect, test } from 'vitest';

import {
  basisCandidates,
  findTotals,
  firstColumn,
  hasBracketedBasis,
  headColumns,
  headRow,
  normalize,
  readValues,
  sizesIn,
  stackedHeads,
} from './nutrition-label';

describe('normalize', () => {
  test('full-width text becomes plain, thousands lose their comma, a decimal comma becomes a point', () => {
    expect(normalize('열량 1,250㎉ 나트륨 0,5g')).toBe('열량 1250kcal 나트륨 0.5g');
  });

  test('tabs become column bars and a Markdown rule line goes away', () => {
    expect(normalize('| 구분 | 100g당 |\n|---|:---:|\n| 당류\t\t5g |')).toBe(
      ' 구분 | 100g당 \n 당류 | | 5g ',
    );
  });
});

describe('findTotals', () => {
  test('a package size inside the table wins over a shop line above the heading', () => {
    const text = normalize('총 내용량 500g (25g x 20봉)\n영양정보\n총 내용량 25g\n100g당 500kcal');
    const { header, total } = findTotals(text);
    expect(header?.[0]).toBe('영양정보');
    expect(total).toEqual({ size: 25, unit: 'g' });
  });

  test('the footer "1일 영양성분 기준치" is no heading', () => {
    expect(findTotals(normalize('1일 영양성분 기준치에 대한 비율')).header).toBeNull();
  });
});

describe('basisCandidates', () => {
  test('finds each kind of basis in order, and a price is no basis', () => {
    const text = normalize('100g당 2,211원\n1회 제공량 30g\n총 내용량당\n1봉지(45g)당 230kcal');
    const found = basisCandidates(text, { size: 90, unit: 'g' });
    expect(found.map(({ kind, basis }) => [kind, basis])).toEqual([
      ['serving', { size: 30, unit: 'g' }],
      ['total', { size: 90, unit: 'g' }],
      ['per', { size: 45, unit: 'g' }],
    ]);
  });

  test('a serving with its size in brackets takes that size; 당류 is not a basis', () => {
    const found = basisCandidates(normalize('1회 제공량 1개(30g) 당류 5g'), null);
    expect(found).toHaveLength(1);
    expect(found[0].basis).toEqual({ size: 30, unit: 'g' });
  });
});

describe('headRow', () => {
  test('heads with only separators between them form one row', () => {
    const text = normalize('총 내용량당 | 100g당\n열량 300kcal | 100kcal');
    const candidates = basisCandidates(text, null);
    expect(headRow(text, candidates[1], candidates)).toHaveLength(2);
  });

  test('other text between two heads keeps them apart', () => {
    const text = normalize('1개(30g)당 총 내용량 60g 100g당');
    const candidates = basisCandidates(text, null);
    expect(headRow(text, candidates[0], candidates)).toEqual([candidates[0]]);
  });
});

describe('firstColumn', () => {
  test('keeps the name and the first column only', () => {
    expect(firstColumn('열량 | 900kcal | 300kcal', 2, true)).toBe('열량 900kcal');
    expect(firstColumn('열량 900kcal | 300kcal', 2, false)).toBe('열량 900kcal');
  });

  test('an empty first cell keeps only the name, so the second column is not read as the first', () => {
    expect(firstColumn('당류 | | 5g', 2, true).trim()).toBe('당류');
  });

  test('a line without bars stays as it is', () => {
    expect(firstColumn('나트륨 300mg', 2, false)).toBe('나트륨 300mg');
  });
});

describe('sizesIn', () => {
  test('marks a basis and the package, and not a price', () => {
    const text = '30g (100g당) 총 내용량 300g 50g당 2211원';
    expect(sizesIn(text, 0, text.length)).toEqual([
      { size: '30g', unit: 'g', isBasis: false, isPackage: false },
      { size: '100g', unit: 'g', isBasis: true, isPackage: false },
      { size: '300g', unit: 'g', isBasis: false, isPackage: true },
      { size: '50g', unit: 'g', isBasis: false, isPackage: false },
    ]);
  });
});

describe('the checks that withhold a basis', () => {
  const chosenIn = (text: string, at = 0) => {
    const candidates = basisCandidates(text, null);
    return { candidates, chosen: candidates[at] };
  };

  test('a serving whose head names another basis is unclear; a basis noting the serving is not', () => {
    const unclear = normalize('1회 제공량 30g (100g당)\n열량 150kcal');
    const one = chosenIn(unclear);
    expect(hasBracketedBasis(unclear, one.chosen, one.candidates, null)).toBe(true);

    const fine = normalize('100g당 (1회 제공량 30g)\n열량 500kcal');
    const other = chosenIn(fine);
    expect(other.chosen.kind).toBe('per');
    expect(hasBracketedBasis(fine, other.chosen, other.candidates, null)).toBe(false);
  });

  test('heads stacked on two lines cannot be told apart', () => {
    const text = normalize('100g당\n1회 제공량(30g)당\n열량\n250kcal\n75kcal');
    const { candidates } = chosenIn(text);
    const serving = candidates.find(({ kind }) => kind === 'serving')!;
    expect(stackedHeads(text, serving, candidates)).toBe(true);

    const single = normalize('1회 제공량 30g\n열량 75kcal');
    const one = chosenIn(single);
    expect(stackedHeads(single, one.chosen, one.candidates)).toBe(false);
  });

  test('a head in a later cell means the first column has an unknown head', () => {
    const later = normalize('총 내용량 500ml | 100ml당\n열량 | 200kcal | 40kcal');
    expect(headColumns(later, chosenIn(later).chosen).headInLaterColumn).toBe(true);

    const named = normalize('구분 | 100g당 | 1회 제공량(30g)당\n열량 | 250kcal | 75kcal');
    const columns = headColumns(named, chosenIn(named).chosen);
    expect(columns).toMatchObject({ nameCell: true, headInLaterColumn: false });
    expect(columns.headCells).toHaveLength(3);
  });
});

describe('readValues', () => {
  test('the energy line wins over the footer, and units are made g or mg', () => {
    // readValues gets normalized text, where "2,000kcal" is already "2000kcal".
    expect(readValues('2000kcal 기준\n열량 250kcal\n나트륨 1.2g\n단백질 500mg')).toEqual({
      values: { calories: 250, protein: 0.5, sodium: 1200 },
      lessThan: [],
      outOfRange: [],
    });
  });

  test('"less than" and amounts too large are left out, and trans fat is not fat', () => {
    expect(readValues('당류 1g 미만\n트랜스지방 0g\n탄수화물 120000g')).toEqual({
      values: {},
      lessThan: ['sugars'],
      outOfRange: ['carbs'],
    });
  });

  test('a share of the daily value written first does not hide the value', () => {
    expect(readValues('나트륨 15% 300mg').values).toEqual({ sodium: 300 });
  });
});
