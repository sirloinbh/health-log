// Reads the text of a Korean nutrition facts table that the person copied from a product page
// (#35). Nothing here opens a page: a shop link is only ever stored as the food's source (#34).
//
// A whole product page may be pasted, with prices ("100g당 2,211원"), reviews ("당류 0g이라 좋아요")
// and the table's own footer ("2,000kcal 기준"). A wrong number is worse than an empty field, so
// values are read only inside the table: from the amount they are given for (or the table's
// heading) up to the first line that is not part of a table or the next basis on a later line.

type LabelNutrient = 'calories' | 'carbs' | 'protein' | 'fat' | 'sugars' | 'sodium';
type Size = { size: number; unit: 'g' | 'ml' };

export type LabelReading = {
  /** The amount the values are given for, such as "100g당" or "1회 제공량 30g". */
  basis: Size | null;
  /** True when no basis is written and the values are taken to be for the whole package. */
  basisFromTotal: boolean;
  /** The whole package, from "총 내용량". */
  total: Size | null;
  values: Partial<Record<LabelNutrient, number>>;
  /** Written as "N미만": not a number to store, so left empty. */
  lessThan: LabelNutrient[];
  /** Numbers found but larger than a food can hold, left empty. */
  outOfRange: LabelNutrient[];
};

// The server's limit for any stored amount (backend/src/foods.ts).
const maxAmount = 99_999;

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
const nutrientWords = nutrientNames.map(({ name }) => name).join('|');

/**
 * Full-width digits and units such as ㎉, ㎎, ㎖ become plain text. "1,250" loses its comma, while
 * "2,5g" and "0,125g", written with a decimal comma, become 2.5 and 0.125.
 */
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /(?<![\d.,])([1-9]\d{0,2})((?:,\d{3})+)(?![\d,])/g,
      (_, head: string, rest: string) => head + rest.replaceAll(',', ''),
    )
    .replace(/(\d),(\d+)(?=\s*(?:mg|g|ml|kcal))/g, '$1.$2')
    .replace(/[ \t]+/g, ' ');

// Stored amounts have two decimals at most.
const twoDecimals = (value: number) => Math.round(value * 100) / 100;

const sizeOf = (size: string, unitText: string): Size | null => {
  const value = twoDecimals(Number(size));
  return value > 0 && value <= maxAmount ? { size: value, unit: unitText as Size['unit'] } : null;
};

// Inside a table an energy value or a nutrient comes soon after the basis.
const tableFollows = new RegExp(
  String.raw`^[^\n]{0,15}(?:\n[^\n]{0,15})?(?:\d+(?:\.\d+)?\s*kcal|열량|에너지|${nutrientWords})`,
);

type Candidate = {
  index: number;
  end: number;
  basis: Size | null;
  /** per: "100g당". serving: "1회 제공량 …". total: "총 내용량당", the package's column. */
  kind: 'per' | 'serving' | 'total';
};

/** Every place that names the amount the values are for, in order. */
function basisCandidates(text: string, total: Size | null): Candidate[] {
  const found: Candidate[] = [];
  // "100g당", "1봉지(45g)당", "100g당열량", but not 당류 or 당알코올, and not a price
  // ("100g당 2211원", "100g당 가격").
  const per = new RegExp(
    String.raw`${number}\s*${unit}\s*\)?\s*당(?:(?=열량|에너지|칼로리|${nutrientWords})|(?![가-힣]))(?!\s*(?:가격|\d+(?:\.\d+)?\s*원))`,
    'g',
  );
  for (const match of text.matchAll(per)) {
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      basis: sizeOf(match[1], match[2]),
      kind: 'per',
    });
  }
  // "총 내용량당" with no size of its own: the package, whose size "총 내용량 300g" gives (#120).
  for (const match of text.matchAll(/총\s*내용량\s*당/g)) {
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      basis: total,
      kind: 'total',
    });
  }
  // "1회 제공량 30g", "1회 제공량 1개(30g)", "1회 섭취참고량 30g", and "1회 제공량당" with no size.
  const serving = new RegExp(
    String.raw`1회\s*(?:제공량|섭취\s*참고량)\s*(?:당)?\s*[:：]?\s*(?:(?:[^\n()]*\()?\s*${number}\s*${unit})?`,
    'g',
  );
  for (const match of text.matchAll(serving)) {
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      basis: match[1] ? sizeOf(match[1], match[2]) : null,
      kind: 'serving',
    });
  }
  return found.sort((a, b) => a.index - b.index);
}

// A line that belongs to a nutrition table: a nutrient, energy, a percentage, the footer, a size,
// or a value alone, as when a table is copied one cell per line ("나트륨\n300mg").
const tableLine = new RegExp(
  String.raw`열량|에너지|칼로리|kcal|kj|${nutrientWords}|당알코올|콜레스테롤|식이섬유|기준치|영양|내용량|제공량|섭취|\d\s*%|\d\s*(?:g|mg|ml)\s*\)?\s*당|^[\s|]*\d+(?:\.\d+)?\s*(?:mg|g|ml|kcal)\b`,
);

/**
 * The table alone: from `start` (its basis or heading; null when neither is found, then from its
 * first table line) to the first line that is not part of a table, such as "상품평" or "함께 보면
 * 좋은 상품", or to a basis on a later line than `head`, which starts another product's values.
 * `begin` and `end` give where it lies in `text`.
 */
function tableRange(
  text: string,
  start: number | null,
  candidates: Candidate[],
  // The chosen basis, when the table starts before it (the package's line above "총 내용량당").
  head: number | null = start,
) {
  const lines = text.split('\n');
  let offset = 0;
  let inTable = false;
  let begin = start ?? 0;
  let end = text.length;
  for (const line of lines) {
    const lineEnd = offset + line.length;
    if (start === null && !inTable && tableLine.test(line)) {
      inTable = true;
      begin = offset;
    } else if (start !== null && !inTable && lineEnd >= start) {
      inTable = true;
    } else if (inTable && line.trim() && !tableLine.test(line)) {
      end = offset;
      break;
    }
    offset = lineEnd + 1;
  }
  if (start === null && !inTable) return { begin: 0, end: 0 };
  // A basis on a later line than the chosen one starts other values: "(100g당 500kcal)".
  const headLineEnd = text.indexOf('\n', Math.max(begin, head ?? begin));
  const next = candidates.find((candidate) => headLineEnd !== -1 && candidate.index > headLineEnd);
  return { begin, end: Math.min(end, next ? next.index : text.length) };
}

/**
 * The size for a "1회 제공량당" column head without one, from the nearest "1회 제공량 30g" inside
 * the same table: never from a review or another product after it, never from 섭취참고량 (#120).
 */
function borrowedServing(
  chosen: Candidate,
  candidates: Candidate[],
  text: string,
  from: number,
  to: number,
) {
  if (chosen.kind !== 'serving') return null;
  const lenders = candidates.filter(
    (candidate) =>
      candidate.kind === 'serving' &&
      candidate.basis &&
      candidate.index >= from &&
      // The size that cut the table ("(1회 제공량 50g)") still belongs to it.
      candidate.index <= to &&
      text.slice(candidate.index, candidate.end).includes('제공량'),
  );
  lenders.sort((a, b) => Math.abs(a.index - chosen.index) - Math.abs(b.index - chosen.index));
  return lenders[0]?.basis ?? null;
}

/**
 * Where the table lines directly above `index` start, so a "1회 제공량 30g" on the line above a
 * table with no heading still belongs to it. A blank or other line stops it.
 */
function tableLinesAbove(text: string, index: number) {
  let start = index;
  for (;;) {
    const lineEnd = start - 1;
    if (lineEnd < 0) return start;
    const lineStart = text.lastIndexOf('\n', lineEnd - 1) + 1;
    const line = text.slice(lineStart, lineEnd);
    if (!line.trim() || !tableLine.test(line)) return start;
    start = lineStart;
  }
}

// Only separators between two column heads: "총 내용량당 | 100g당", "1회 제공량당 / 총 내용량당".
// A line break is not one: heads of one row share a line.
// The words a head may start with before its size are allowed too: "100g당 | 총 내용량(300g)당".
const headGap =
  /^[ \t|/]*(?:총[ \t]*내용량|1회[ \t]*(?:제공량|섭취[ \t]*참고량)|1[ \t]*[가-힣]{1,3})?[ \t]*\(?[ \t]*$/;

/**
 * The heads of one header row around `followed`: neighbours on its line with nothing but
 * separators between them. Text in between ("1개(30g) 총 내용량 60g 100g당") means one long line,
 * not a row of columns, so `followed` stands alone.
 */
function headRow(text: string, followed: Candidate, candidates: Candidate[]) {
  const row = [followed];
  const sorted = [...candidates].sort((a, b) => a.index - b.index);
  const at = sorted.indexOf(followed);
  for (let i = at - 1; i >= 0; i--) {
    if (!headGap.test(text.slice(sorted[i].end, row[0].index))) break;
    row.unshift(sorted[i]);
  }
  for (let i = at + 1; i < sorted.length; i++) {
    if (!headGap.test(text.slice(row[row.length - 1].end, sorted[i].index))) break;
    row.push(sorted[i]);
  }
  return row;
}

/**
 * A row of a table with `heads` value columns, cut to its name and first column's cell. With bars,
 * "당류 | | 5g" (an empty first cell) keeps only "당류", so the second column's value is never read
 * as the first's. "열량 900kcal | 300kcal" and "열량 | 900kcal | 300kcal" both keep 900kcal.
 */
function firstColumn(line: string, heads: number) {
  if (!line.includes('|')) return line;
  const cells = line.split('|').map((cell) => cell.trim());
  // Name and first value in one cell, the rest after it.
  if (cells.length === heads) return cells[0];
  // The name in a cell of its own.
  if (cells.length === heads + 1) return `${cells[0]} ${cells[1]}`;
  // Cells that do not line up with the heads: only the name, no value to trust.
  return cells[0].replace(/\d[\d.]*\s*(?:kcal|mg|g|ml|%)/g, '');
}

export function readNutritionLabel(pasted: string): LabelReading {
  const text = normalize(pasted);
  // The table's heading, not the footer's "1일 영양성분 기준치".
  const header = /(?<!1일\s*)영양\s*(?:정보|성분)(?!\s*기준)/.exec(text);
  const totals = [
    ...text.matchAll(new RegExp(String.raw`총\s*내용량\s*[:：]?\s*${number}\s*${unit}`, 'g')),
  ];
  // A shop's line above the heading may give the whole bundle ("총 내용량 500g (25g x 20봉)").
  const tableTotals = header ? totals.filter((match) => match.index >= header.index) : totals;
  const firstTotal = tableTotals[0] ?? totals[0];
  const total = firstTotal ? sizeOf(firstTotal[1], firstTotal[2]) : null;
  // The package size a "총 내용량당" head stands for: the nearest one in the table.
  const nearestTotal = (index: number) =>
    [...tableTotals].sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index))[0];

  const all = basisCandidates(text, null).map((candidate) => {
    if (candidate.kind !== 'total') return candidate;
    const near = nearestTotal(candidate.index);
    return { ...candidate, basis: near ? sizeOf(near[1], near[2]) : null };
  });
  // With a heading, nothing above it is the table: not a title ("닭가슴살 100g당 단백질 23g"), nor
  // a shop line ("무료배송 100g당 최저가") when the table itself names no basis.
  const candidates = header ? all.filter((candidate) => candidate.index >= header.index) : all;
  // The table's basis is the first one that values follow. A basis named but unreadable
  // ("1회 제공량당" with no size) is still the basis, so the package is not assumed instead.
  const followed =
    candidates.find((candidate) => tableFollows.test(text.slice(candidate.end))) ??
    candidates[0] ??
    null;
  // A row of column heads ("총 내용량당 | 100g당"): values are read from the first column, so the
  // basis is that column's, whichever head the values seemed to follow (#120).
  const row = followed ? headRow(text, followed, candidates) : [];
  const chosen = row[0] ?? null;

  // The 2021 layout puts the package and its energy above the "총 내용량당" head:
  // "총 내용량 30g / 130kcal / 총 내용량당 / 나트륨 …". That line belongs to the table too.
  const near = chosen?.kind === 'total' ? nearestTotal(chosen.index) : undefined;
  const packageLine = near && near.index < chosen.index ? near.index : null;
  const range = tableRange(
    text,
    packageLine ?? (chosen ? chosen.index : header ? header.index : null),
    all,
    chosen ? chosen.index : null,
  );

  // Heads on two lines one above the other ("100g당\n1회 제공량(30g)당") with cells copied one per
  // line cannot be told apart, so no basis is claimed for them.
  const lineStart = (index: number) => text.lastIndexOf('\n', index - 1) + 1;
  const previousLine = chosen
    ? text.slice(lineStart(lineStart(chosen.index) - 1), lineStart(chosen.index))
    : '';
  const stackedHeads =
    chosen !== null &&
    candidates.some(
      (candidate) =>
        candidate.kind !== 'serving' &&
        lineStart(candidate.index) < lineStart(chosen.index) &&
        lineStart(candidate.index) === lineStart(lineStart(chosen.index) - 1) &&
        headGap.test(
          previousLine.replace(text.slice(candidate.index, candidate.end), '').replace(/\n/g, ''),
        ),
    );

  const basisFromTotal = candidates.length === 0 && total !== null;
  const basis = stackedHeads
    ? null
    : chosen
      ? (chosen.basis ??
        borrowedServing(
          chosen,
          candidates,
          text,
          header ? header.index : tableLinesAbove(text, range.begin),
          range.end,
        ))
      : basisFromTotal
        ? total
        : null;

  // Columns are counted on the head line itself when it has bars, so a head the row did not
  // recognise still counts: a 2-cell row then holds the name and the first value, not two values.
  const headLine = chosen
    ? text.slice(lineStart(chosen.index), text.indexOf('\n', chosen.index) + 1 || text.length)
    : '';
  const heads = headLine.includes('|')
    ? headLine.split('|').filter((cell) => cell.trim()).length
    : Math.max(row.length, 1);
  const table = text
    .slice(range.begin, range.end)
    .split('\n')
    .map((line) => firstColumn(line, heads))
    .join('\n');

  const values: LabelReading['values'] = {};
  const lessThan: LabelNutrient[] = [];
  const outOfRange: LabelNutrient[] = [];
  const keep = (key: LabelNutrient, value: number) => {
    const rounded = twoDecimals(value);
    if (rounded > maxAmount) outOfRange.push(key);
    else values[key] = rounded;
  };

  // An energy line wins over any other kcal; "2,000kcal 기준" in the footer is never a value.
  const kcal = String.raw`${number}\s*kcal(?!\s*(?:을|를)?\s*기준)(\s*미만)?`;
  // Between a name and its value: spaces, a line break, a colon, and a share of the daily value
  // written first ("나트륨 15% 300mg"). Column bars are already resolved by `firstColumn`.
  const gap = String.raw`[\s:：]*(?:\d+(?:\.\d+)?\s*%\s*)?`;
  const energy =
    new RegExp(String.raw`(?:열량|에너지)${gap}${kcal}`).exec(table) ??
    new RegExp(kcal).exec(table);
  if (energy) {
    if (energy[2]) lessThan.push('calories');
    else keep('calories', Number(energy[1]));
  }
  for (const { key, name, mg } of nutrientNames) {
    const found = new RegExp(
      String.raw`(?<![가-힣])(?<!트랜스\s)(?<!포화\s)${name}${gap}${number}\s*(mg|g)(\s*미만)?`,
    ).exec(table);
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
    keep(key, inUnit);
  }
  return { basis, basisFromTotal, total, values, lessThan, outOfRange };
}

/**
 * "총 내용량 500g은(는) 1회 제공량(100g)의 5배, 약 1,250kcal입니다." — how much a whole package is,
 * so a meal can be recorded in servings. Null when the label does not say enough.
 */
export function packageText({ basis, total, values }: LabelReading) {
  if (!basis || !total || basis.unit !== total.unit || total.size === basis.size) return null;
  const times = twoDecimals(total.size / basis.size);
  const kcal =
    values.calories === undefined
      ? ''
      : `, 약 ${Math.round(values.calories * times).toLocaleString('ko-KR')}kcal`;
  return `총 내용량 ${total.size}${total.unit}은(는) 1회 제공량(${basis.size}${basis.unit})의 ${times}배${kcal}입니다. 포장 하나를 다 먹었으면 식사에 ${times}회분으로 기록하세요.`;
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
