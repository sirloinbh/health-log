// Reads the text of a Korean nutrition facts table that the person copied from a product page
// (#35). Nothing here opens a page: a shop link is only ever stored as the food's source (#34).

type LabelNutrient = 'calories' | 'carbs' | 'protein' | 'fat' | 'sugars' | 'sodium';

export type LabelReading = {
  /** The amount the values are given for, such as "100g당" or "1회 제공량 30g". */
  basis: { size: number; unit: 'g' | 'ml' } | null;
  /** The whole package, from "총 내용량". */
  total: { size: number; unit: 'g' | 'ml' } | null;
  values: Partial<Record<LabelNutrient, number>>;
  /** Written as "N미만": not a number to store, so left for the person. */
  lessThan: LabelNutrient[];
};

const number = String.raw`(\d+(?:\.\d+)?)`;
const unit = String.raw`(g|ml)`;

// Hangul before a name means another nutrient: 트랜스지방 and 포화지방 are not 지방, nor are they
// when written with a space.
const nutrientNames: { key: Exclude<LabelNutrient, 'calories'>; name: string; mg: boolean }[] = [
  { key: 'carbs', name: '탄수화물', mg: false },
  { key: 'protein', name: '단백질', mg: false },
  { key: 'fat', name: '지방', mg: false },
  { key: 'sugars', name: '당류', mg: false },
  { key: 'sodium', name: '나트륨', mg: true },
];

/** Full-width digits and units such as ㎉, ㎎, ㎖ become plain text; "1,250" becomes "1250". */
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .toLowerCase();

const sizeOf = (size: string, unitText: string) => ({
  size: Number(size),
  unit: unitText as 'g' | 'ml',
});

// Stored amounts have two decimals at most.
const twoDecimals = (value: number) => Math.round(value * 100) / 100;

export function readNutritionLabel(pasted: string): LabelReading {
  const text = normalize(pasted);
  const total = new RegExp(String.raw`총\s*내용량\s*[:：]?\s*${number}\s*${unit}`).exec(text);
  // "100g당", "1봉지(45g)당", "1회 제공량 1개(30g)", "1회 제공량: 30g".
  // 당 but not 당류: "4g 당류" is sugars, not a basis.
  const per = new RegExp(String.raw`${number}\s*${unit}\s*\)?\s*당(?!류)`).exec(text);
  const serving = new RegExp(
    // "1개(" before the size is skipped; without a bracket the size comes right after.
    String.raw`1회\s*제공량\s*[:：]?\s*(?:[^\n()]*\()?\s*${number}\s*${unit}`,
  ).exec(text);
  const basisMatch = per ?? serving;
  const basis = basisMatch
    ? sizeOf(basisMatch[1], basisMatch[2])
    : total
      ? // Values with only a total given are for the whole package.
        sizeOf(total[1], total[2])
      : null;
  // The values that follow the basis are the ones for it; a table may also give the package's.
  const from = basisMatch ? basisMatch.index : 0;
  const after = text.slice(from);

  const values: LabelReading['values'] = {};
  const lessThan: LabelNutrient[] = [];
  const kcal =
    new RegExp(String.raw`${number}\s*kcal(\s*미만)?`).exec(after) ??
    new RegExp(String.raw`${number}\s*kcal(\s*미만)?`).exec(text);
  if (kcal) {
    if (kcal[2]) lessThan.push('calories');
    else values.calories = twoDecimals(Number(kcal[1]));
  }
  for (const { key, name, mg } of nutrientNames) {
    const pattern = new RegExp(
      String.raw`(?<![가-힣])(?<!트랜스\s)(?<!포화\s)${name}\s*[:：]?\s*${number}\s*(mg|g)(\s*미만)?`,
    );
    const found = pattern.exec(after) ?? pattern.exec(text);
    if (!found) continue;
    if (found[3]) {
      lessThan.push(key);
      continue;
    }
    const amount = Number(found[1]);
    // Sodium is kept in mg, everything else in g, whichever the label used.
    const inUnit = mg
      ? found[2] === 'g'
        ? amount * 1000
        : amount
      : found[2] === 'mg'
        ? amount / 1000
        : amount;
    values[key] = twoDecimals(inUnit);
  }
  return {
    basis,
    total: total ? sizeOf(total[1], total[2]) : null,
    values,
    lessThan,
  };
}

/**
 * "총 내용량 500g은 1회 제공량(100g)의 5배, 약 1,250kcal입니다." — how much a whole package is,
 * so a meal can be recorded in servings. Null when the label does not say enough.
 */
export function packageText({ basis, total, values }: LabelReading) {
  if (!basis || !total || basis.unit !== total.unit || total.size === basis.size) return null;
  const times = twoDecimals(total.size / basis.size);
  const kcal =
    values.calories === undefined
      ? ''
      : `, 약 ${Math.round(values.calories * times).toLocaleString('ko-KR')}kcal`;
  return `총 내용량 ${total.size}${total.unit}은(는) 1회 제공량(${basis.size}${basis.unit})의 ${times}배${kcal}입니다. 한 봉지를 다 먹었으면 식사에 ${times}회분으로 기록하세요.`;
}

/** A Coupang product link, recognised only to explain that the app never opens it. */
export function isCoupangUrl(value: string) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    return host === 'coupang.com' || host.endsWith('.coupang.com');
  } catch {
    return false;
  }
}
