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
  /** The whole package, from "총 내용량" (total content). */
  total: Size | null;
  values: Partial<Record<LabelNutrient, number>>;
  /** Written as "N미만" (less than N): not a number to store, so left empty. */
  lessThan: LabelNutrient[];
  /** Numbers found but larger than a food can hold, left empty. */
  outOfRange: LabelNutrient[];
};

// The server's limit for any stored amount (backend/src/foods.ts).
const maxAmount = 99_999;

// Regular expression pieces used in more than one pattern below.
/** An amount such as 30 or 2.5, not captured. */
const amount = String.raw`\d+(?:\.\d+)?`;
/** An amount, captured. */
const number = `(${amount})`;
/** The unit of a size, captured. */
const unit = String.raw`(g|ml)`;
/** Words that start the energy row. */
const energyWords = '열량|에너지|칼로리';
/** Not a price after a basis: "100g당 2211원", "100g당 가격". */
const notPrice = String.raw`(?!\s*(?:가격|${amount}\s*원))`;

// Hangul before a name means another nutrient: 트랜스지방 (trans fat) and 포화지방 (saturated fat) are not 지방 (fat), nor are they
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
export const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /(?<![\d.,])([1-9]\d{0,2})((?:,\d{3})+)(?![\d,])/g,
      (_, head: string, rest: string) => head + rest.replaceAll(',', ''),
    )
    .replace(/(\d),(\d+)(?=\s*(?:mg|g|ml|kcal))/g, '$1.$2')
    // A Markdown table's rule under its head ("|---|:---:|") is no row: it goes with its line
    // break, so the head and the values stay together (#122). A rule without bars ("---") may part
    // two products, so it stays and ends the table.
    .replace(/^(?=[^\n]*\|)[ \t|:-]*-{3,}[ \t|:-]*(?:\n|$)/gm, '')
    // A table copied from a web page separates its cells with tabs: they are column bars, so an
    // empty cell ("당류\t\t5g") stays empty instead of joining the next value (#120).
    .replace(/\t/g, ' | ')
    // Bars at both ends of a row ("| 열량 | 250kcal |", a Markdown table) frame it; they are no cell.
    .replace(/^[ ]*\|(.*)\|[ ]*$/gm, '$1')
    .replace(/ +/g, ' ');

// Stored amounts have two decimals at most.
const twoDecimals = (value: number) => Math.round(value * 100) / 100;

const sizeOf = (size: string, unitText: string): Size | null => {
  const value = twoDecimals(Number(size));
  return value > 0 && value <= maxAmount ? { size: value, unit: unitText as Size['unit'] } : null;
};

// Inside a table an energy value or a nutrient comes soon after the basis.
const tableFollows = new RegExp(
  String.raw`^[^\n]{0,15}(?:\n[^\n]{0,15})?(?:${amount}\s*kcal|열량|에너지|${nutrientWords})`,
);

type Candidate = {
  index: number;
  end: number;
  basis: Size | null;
  /** per: "100g당". serving: "1회 제공량 …". total: "총 내용량당", the package's column. */
  kind: 'per' | 'serving' | 'total';
};

/** Every place that names the amount the values are for, in order. */
export function basisCandidates(text: string, total: Size | null): Candidate[] {
  const found: Candidate[] = [];
  // "100g당", "1봉지(45g)당", "100g당열량", but not 당류 or 당알코올, and not a price.
  const per = new RegExp(
    String.raw`${number}\s*${unit}\s*\)?\s*당(?:(?=${energyWords}|${nutrientWords})|(?![가-힣]))${notPrice}`,
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
  // A size right after the words comes first, so "1회 제공량 30g (100g당)" is 30g: the size in
  // brackets is taken only when none is written before them (#122).
  const serving = new RegExp(
    String.raw`1회\s*(?:제공량|섭취\s*참고량)\s*(?:당)?\s*[:：]?\s*(?:${number}\s*${unit}|[^\n()]*\(\s*${number}\s*${unit})?`,
    'g',
  );
  for (const match of text.matchAll(serving)) {
    const [size, sizeUnit] = match[1] ? [match[1], match[2]] : [match[3], match[4]];
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      basis: size ? sizeOf(size, sizeUnit) : null,
      kind: 'serving',
    });
  }
  return found.sort((a, b) => a.index - b.index);
}

// A line that belongs to a nutrition table: a nutrient, energy, a percentage, the footer, a size,
// or a value alone, as when a table is copied one cell per line ("나트륨\n300mg").
const tableLine = new RegExp(
  String.raw`${energyWords}|kcal|kj|${nutrientWords}|당알코올|콜레스테롤|식이섬유|기준치|영양|내용량|제공량|섭취|\d\s*%|\d\s*(?:g|mg|ml)\s*\)?\s*당|^[\s|]*${amount}\s*(?:mg|g|ml|kcal)\b`,
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
 * the same table: never from a review or another product after it, never from 섭취참고량 (reference intake) (#120).
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
      // The size that cut the table ("(1회 제공량 50g)") still belongs to it, unless values follow
      // it: then it heads the next product's table ("영양정보 1회 제공량 50g / 열량 300kcal").
      (candidate.index < to ||
        (candidate.index === to && !tableFollows.test(text.slice(candidate.end)))) &&
      text.slice(candidate.index, candidate.end).includes('제공량'),
  );
  lenders.sort((a, b) => Math.abs(a.index - chosen.index) - Math.abs(b.index - chosen.index));
  return lenders[0]?.basis ?? null;
}

// A line that only states a serving size: "1회 제공량 30g", "1회 제공량: 1개(30g)", "(1회 제공량 50g)".
const servingSizeLine =
  /^\s*\(?\s*1회\s*제공량\s*[:：]?\s*(?:\d+(?:\.\d+)?\s*[가-힣]{1,3}\s*\()?\s*\d+(?:\.\d+)?\s*(?:g|ml)\s*\)?\s*\)?\s*$/;

/**
 * Where a table with no heading may lend a serving size from: the line right above it, if that
 * line states nothing but a serving size. A review above it ("1회 제공량 40g씩 먹어요") does not.
 */
function servingLineAbove(text: string, index: number) {
  if (index === 0) return index;
  const lineStart = text.lastIndexOf('\n', index - 2) + 1;
  return servingSizeLine.test(text.slice(lineStart, index - 1)) ? lineStart : index;
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
export function headRow(text: string, followed: Candidate, candidates: Candidate[]) {
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

/** The cells of a row with bars, without daily-value shares and without empty cells at its end. */
function rowCells(line: string) {
  // A daily-value share in a cell of its own ("나트륨\t300mg\t15%") is no value column.
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => !/^\d+(?:\.\d+)?\s*%$/.test(cell));
  // Empty cells at the row's end ("열량 150kcal |", a share cell left blank) hold nothing.
  while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
  return cells;
}

// An amount, not a basis such as the head "100g당".
const hasValue = /\d\s*(?:kcal|mg|g|ml)(?!\s*\)?\s*당)/;

/**
 * Whether the table's rows give the name a cell of its own ("열량 | 250kcal | 75kcal"): some full
 * row says so, and none writes the name and first value in one cell ("열량 250kcal | 75kcal").
 */
function namesInOwnCell(lines: string[], heads: number) {
  const rows = lines.filter((line) => line.includes('|')).map(rowCells);
  return (
    rows.some((cells) => cells.length === heads + 1 && !hasValue.test(cells[0])) &&
    !rows.some((cells) => heads > 1 && cells.length === heads && hasValue.test(cells[0]))
  );
}

/**
 * A row of a table with `heads` value columns, cut to its name and first column's cell. With bars,
 * "당류 | | 5g" (an empty first cell) keeps only "당류", so the second column's value is never read
 * as the first's. "열량 900kcal | 300kcal" and "열량 | 900kcal | 300kcal" both keep 900kcal.
 */
export function firstColumn(line: string, heads: number, ownCell: boolean) {
  if (!line.includes('|')) return line;
  const cells = rowCells(line);
  if (cells.length === 1) return cells[0];
  // Name and first value in one cell, the rest after it.
  if (cells.length <= heads && hasValue.test(cells[0])) return cells[0];
  // The name in a cell of its own. In a table whose rows all do that, a shorter row ("열량 |
  // 250kcal" under two heads) lost its last cells, as a copy drops empty cells at a row's end (#122).
  // Where names share a cell with the first value, "당류 | 5g" is an empty first cell instead.
  if (cells.length === heads + 1 || (ownCell && cells.length <= heads)) {
    return `${cells[0]} ${cells[1]}`;
  }
  // Cells that do not line up with the heads: only the name, no value to trust.
  return cells[0].replace(/\d[\d.]*\s*(?:kcal|mg|g|ml|%)/g, '');
}

// The head of a column of daily-value shares ("1일 영양성분 기준치에 대한 비율", the 2021 layout):
// its cells hold percentages, no values, so it is no value column (#122).
const shareHead = /^(?:1일\s*)?영양\s*성분\s*기준치(?:에\s*대한\s*비율)?(?:\s*\(%\))?$/;
const shareHeadAfter =
  /^[ ]*\|[ ]*(?:1일[ ]*)?영양[ ]*성분[ ]*기준치(?:에[ ]*대한[ ]*비율)?(?:[ ]*\(%\))?[ ]*/;

// The first cell of a head line that names the rows, not a column of values: "구분", "영양성분 (단위)".
const nameHead =
  /^(?:구분|항목|내용|영양\s*(?:성분|정보|소)(?:\s*명)?|성분(?:\s*명)?)?(?:\s*\(\s*단위\s*\))?$/;

// Where a row's values start on a head line: what is before it is the head itself.
const valueStart = new RegExp(String.raw`${energyWords}|\d\s*kcal|${nutrientWords}`);

// A size in running text. It is a basis when marked "당" or "기준" (not a price), and the package
// when "총 …" comes before it ("총 내용량 300g", "총 2회 제공량(60g)").
const sizeMention = new RegExp(
  String.raw`(?<package>총[^\n\d]{0,10}(?:\d+\s*회[^\n\d]{0,8})?)?(?<![\d.])${number}\s*${unit}(?![a-z])(\s*[\])]?\s*(?:당(?![가-힣])|기준)${notPrice})?`,
  'g',
);

type Match = RegExpExecArray;

/** Where the line holding `index` starts. */
const lineStart = (text: string, index: number) => text.lastIndexOf('\n', index - 1) + 1;

/**
 * The table's heading and the package size. A shop's line above the heading may give the whole
 * bundle ("총 내용량 500g (25g x 20봉)"), so a size from the heading on comes first.
 */
export function findTotals(text: string) {
  // The table's heading, not the footer's "1일 영양성분 기준치".
  const header = /(?<!1일\s*)영양\s*(?:정보|성분)(?!\s*기준)/.exec(text);
  const totals = [
    ...text.matchAll(new RegExp(String.raw`총\s*내용량\s*[:：]?\s*${number}\s*${unit}`, 'g')),
  ];
  const tableTotals = header ? totals.filter((match) => match.index >= header.index) : totals;
  const first = tableTotals[0] ?? totals[0];
  return { header, total: first ? sizeOf(first[1], first[2]) : null, tableTotals };
}

/** The package size a "총 내용량당" head stands for: the nearest one in the table. */
function nearestTotal(tableTotals: Match[], index: number): Match | undefined {
  return [...tableTotals].sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index))[0];
}

/**
 * The head the values are read under. `all` has every basis in the text, `candidates` only those
 * from the heading on: with a heading, nothing above it is the table, not a title ("닭가슴살 100g당
 * 단백질 23g") nor a shop line ("무료배송 100g당 최저가").
 */
function chooseBasis(text: string, header: Match | null, tableTotals: Match[]) {
  const all = basisCandidates(text, null).map((candidate) => {
    if (candidate.kind !== 'total') return candidate;
    const near = nearestTotal(tableTotals, candidate.index);
    return { ...candidate, basis: near ? sizeOf(near[1], near[2]) : null };
  });
  const candidates = header ? all.filter((candidate) => candidate.index >= header.index) : all;
  // The table's basis is the first one that values follow. A basis named but unreadable
  // ("1회 제공량당" with no size) is still the basis, so the package is not assumed instead.
  const followed =
    candidates.find((candidate) =>
      tableFollows.test(text.slice(candidate.end).replace(shareHeadAfter, '')),
    ) ??
    candidates[0] ??
    null;
  // A row of column heads ("총 내용량당 | 100g당"): values are read from the first column, so the
  // basis is that column's, whichever head the values seemed to follow (#120).
  const row = followed ? headRow(text, followed, candidates) : [];
  const chosen: Candidate | null = row[0] ?? null;
  return { all, candidates, row, chosen };
}

/**
 * Where the table lies. The 2021 layout puts the package and its energy above the "총 내용량당"
 * head ("총 내용량 30g / 130kcal / 총 내용량당 / 나트륨 …"): that line belongs to the table too.
 */
function chosenTableRange(
  text: string,
  chosen: Candidate | null,
  header: Match | null,
  all: Candidate[],
  tableTotals: Match[],
) {
  if (!chosen) return tableRange(text, header ? header.index : null, all, null);
  const near = chosen.kind === 'total' ? nearestTotal(tableTotals, chosen.index) : undefined;
  const packageLine = near && near.index < chosen.index ? near.index : null;
  return tableRange(text, packageLine ?? chosen.index, all, chosen.index);
}

/**
 * Heads on two lines one above the other ("100g당\n1회 제공량(30g)당") with cells copied one per
 * line cannot be told apart, so no basis is claimed for them.
 */
export function stackedHeads(text: string, chosen: Candidate, candidates: Candidate[]) {
  const chosenLine = lineStart(text, chosen.index);
  const lineAbove = lineStart(text, chosenLine - 1);
  const previousLine = text.slice(lineAbove, chosenLine);
  return candidates.some(
    (candidate) =>
      candidate.kind !== 'serving' &&
      lineStart(text, candidate.index) < chosenLine &&
      lineStart(text, candidate.index) === lineAbove &&
      headGap.test(
        previousLine.replace(text.slice(candidate.index, candidate.end), '').replace(/\n/g, ''),
      ),
  );
}

/**
 * The cells of the chosen head's line, when it has bars. Its first cell may name the rows ("구분 |
 * 100g당 | …"); the values read are the next cell's. When the chosen head sits in a later cell, the
 * first value column has a head this reader did not recognise ("총 내용량 500ml | 100ml당", "1병 |
 * 100ml당"), so the basis of the values read is unknown (#120).
 */
export function headColumns(text: string, chosen: Candidate | null) {
  if (!chosen) return { headCells: [], nameCell: false, headInLaterColumn: false };
  const start = lineStart(text, chosen.index);
  const headLine = text.slice(start, text.indexOf('\n', chosen.index) + 1 || text.length);
  const headCells = headLine.includes('|') ? headLine.split('|').map((cell) => cell.trim()) : [];
  const nameCell = headCells.length > 0 && nameHead.test(headCells[0]);
  const chosenCell = text.slice(start, chosen.index).split('|').length - 1;
  return {
    headCells,
    nameCell,
    headInLaterColumn: headCells.length > 0 && chosenCell > (nameCell ? 1 : 0),
  };
}

/** The sizes written between `from` and `to`, each marked as a basis or as the package. */
export function sizesIn(text: string, from: number, to: number) {
  return [...text.slice(from, to).matchAll(sizeMention)].map((match) => ({
    size: `${twoDecimals(Number(match[2]))}${match[3]}`,
    unit: match[3],
    isBasis: !!match[4],
    isPackage: !!match.groups?.package,
  }));
}

/**
 * "1회 제공량 30g (100g당)", "1회 제공량 약 30g (100g 기준)": the serving is named, yet the same head
 * says the values are for 100g. One column of values cannot be for both, so no basis is claimed.
 * So for a heading "영양정보 (100g당)" above the serving, and for "1회 제공량 30g (총 내용량당)".
 * "100g당 (1회 제공량 30g)" is fine: only the 100g has 당, and the bracket notes the serving size.
 * A head row with bars is a row of columns, read from the first (#122).
 */
export function hasBracketedBasis(
  text: string,
  chosen: Candidate,
  candidates: Candidate[],
  header: Match | null,
) {
  if (chosen.kind !== 'serving') return false;
  const chosenSize = chosen.basis ? `${chosen.basis.size}${chosen.basis.unit}` : null;
  const lineEnd = text.indexOf('\n', chosen.index);
  const head = text
    .slice(chosen.index, lineEnd === -1 ? text.length : lineEnd)
    .split(valueStart)[0];
  if (head.includes('|')) return false;
  const headEnd = chosen.index + head.length;
  // Another size on the serving's head: "30g (100g당)", "30g (100g 중)", "약 30g (100g)". A weight
  // beside a volume ("200ml (206g)"), "1개(30g)", the serving's own "30g당" and the package
  // ("총 내용량 300g") name no other basis.
  const otherSize = sizesIn(text, chosen.index, headEnd).some(
    ({ size, unit: sizeUnit, isBasis, isPackage }) =>
      !isPackage &&
      size !== chosenSize &&
      (isBasis || (chosenSize !== null && sizeUnit === chosen.basis?.unit)),
  );
  const packageHead = candidates.some(
    (candidate) =>
      candidate.kind === 'total' &&
      candidate.index > chosen.index &&
      candidate.index < headEnd &&
      (candidate.basis === null || `${candidate.basis.size}${candidate.basis.unit}` !== chosenSize),
  );
  const headingBasis =
    header !== null &&
    lineStart(text, header.index) < lineStart(text, chosen.index) &&
    sizesIn(text, header.index, text.indexOf('\n', header.index)).some(
      ({ size, isBasis }) => isBasis && size !== chosenSize,
    );
  return otherSize || packageHead || headingBasis;
}

/**
 * The table's lines cut to their name and first value column. Columns are counted on the head line
 * itself when it has bars, so a head the row did not recognise still counts: a 2-cell row then
 * holds the name and the first value, not two values. A name cell is not a value column.
 */
function firstColumns(
  tableText: string,
  columns: ReturnType<typeof headColumns>,
  rowLength: number,
) {
  const { headCells, nameCell } = columns;
  const heads = headCells.length
    ? headCells.slice(nameCell ? 1 : 0).filter((cell) => cell && !shareHead.test(cell)).length
    : Math.max(rowLength, 1);
  const lines = tableText.split('\n');
  const ownCell = namesInOwnCell(lines, heads);
  return lines.map((line) => firstColumn(line, heads, ownCell)).join('\n');
}

// An energy value; "2,000kcal 기준" in the footer is never one.
const kcalValue = String.raw`${number}\s*kcal(?!\s*(?:을|를)?\s*기준)(\s*미만)?`;
// Between a name and its value: spaces, a line break, a colon, and a share of the daily value
// written first ("나트륨 15% 300mg"). Column bars are already resolved by `firstColumn`.
const nameGap = String.raw`[\s:：]*(?:${amount}\s*%\s*)?`;
const energyValue = new RegExp(String.raw`(?:열량|에너지)${nameGap}${kcalValue}`);
const anyKcal = new RegExp(kcalValue);
const nutrientValue = new Map(
  nutrientNames.map(({ key, name }) => [
    key,
    new RegExp(
      String.raw`(?<![가-힣])(?<!트랜스\s)(?<!포화\s)${name}${nameGap}${number}\s*(mg|g)(\s*미만)?`,
    ),
  ]),
);

/**
 * The values in a table already cut to one column: an energy line wins over any other kcal,
 * sodium is kept in mg and everything else in g, whichever the label used.
 */
export function readValues(table: string) {
  const values: LabelReading['values'] = {};
  const lessThan: LabelNutrient[] = [];
  const outOfRange: LabelNutrient[] = [];
  const keep = (key: LabelNutrient, value: number) => {
    const rounded = twoDecimals(value);
    if (rounded > maxAmount) outOfRange.push(key);
    else values[key] = rounded;
  };
  const energy = energyValue.exec(table) ?? anyKcal.exec(table);
  if (energy) {
    if (energy[2]) lessThan.push('calories');
    else keep('calories', Number(energy[1]));
  }
  for (const { key, mg } of nutrientNames) {
    const found = nutrientValue.get(key)!.exec(table);
    if (!found) continue;
    if (found[3]) {
      lessThan.push(key);
      continue;
    }
    const written = Number(found[1]);
    if (mg) keep(key, found[2] === 'g' ? written * 1000 : written);
    else keep(key, found[2] === 'mg' ? written / 1000 : written);
  }
  return { values, lessThan, outOfRange };
}

export function readNutritionLabel(pasted: string): LabelReading {
  const text = normalize(pasted);
  const { header, total, tableTotals } = findTotals(text);
  const { all, candidates, row, chosen } = chooseBasis(text, header, tableTotals);
  const range = chosenTableRange(text, chosen, header, all, tableTotals);
  const columns = headColumns(text, chosen);
  // A basis that cannot be told from another one is not claimed at all.
  const unclear =
    chosen !== null &&
    (stackedHeads(text, chosen, candidates) ||
      columns.headInLaterColumn ||
      hasBracketedBasis(text, chosen, candidates, header));

  const basisFromTotal = candidates.length === 0 && total !== null;
  let basis: Size | null = null;
  if (chosen && !unclear) {
    const from = header ? header.index : servingLineAbove(text, range.begin);
    basis = chosen.basis ?? borrowedServing(chosen, candidates, text, from, range.end);
  } else if (!chosen && basisFromTotal) {
    basis = total;
  }

  const table = firstColumns(text.slice(range.begin, range.end), columns, row.length);
  return { basis, basisFromTotal, total, ...readValues(table) };
}

/**
 * "The total amount of 500g is 5 times the serving size (100g), about 1,250kcal." — how much a whole package is,
 * so a meal can be recorded in servings. Null when the label does not say enough.
 */
export function packageText({ basis, total, values }: LabelReading) {
  if (!basis || !total || basis.unit !== total.unit || total.size === basis.size) return null;
  const times = twoDecimals(total.size / basis.size);
  const kcal =
    values.calories === undefined
      ? ''
      : `, about ${Math.round(values.calories * times).toLocaleString('en-US')}kcal`;
  return `The total amount of ${total.size}${total.unit} is ${times} times the serving size (${basis.size}${basis.unit})${kcal}. If you ate the whole package, record it as ${times} servings.`;
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
