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
function firstColumn(line: string, heads: number, ownCell: boolean) {
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
    candidates.find((candidate) =>
      tableFollows.test(text.slice(candidate.end).replace(shareHeadAfter, '')),
    ) ??
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

  // A head line with bars: its first cell may name the rows ("구분 | 100g당 | …"); the values read
  // are the next cell's. When the chosen head sits in a later cell, the first value column has a
  // head this reader did not recognise ("총 내용량 500ml | 100ml당", "1병 | 100ml당"), so the basis
  // of the values read is unknown (#120).
  const headLine = chosen
    ? text.slice(lineStart(chosen.index), text.indexOf('\n', chosen.index) + 1 || text.length)
    : '';
  const headCells = headLine.includes('|') ? headLine.split('|').map((cell) => cell.trim()) : [];
  const nameCell =
    headCells.length > 0 &&
    /^(?:구분|항목|내용|영양\s*(?:성분|정보|소)(?:\s*명)?|성분(?:\s*명)?)?(?:\s*\(\s*단위\s*\))?$/.test(
      headCells[0],
    );
  const chosenCell = chosen
    ? text.slice(lineStart(chosen.index), chosen.index).split('|').length - 1
    : 0;
  const headInLaterColumn = headCells.length > 0 && chosenCell > (nameCell ? 1 : 0);

  // "1회 제공량 30g (100g당)", "1회 제공량 약 30g (100g 기준)": the serving is named, yet the same
  // head says the values are for 100g. One column of values cannot be for both, so no basis is
  // claimed. So for a heading "영양정보 (100g당)" above the serving. "100g당 (1회 제공량 30g)" is
  // fine: only the 100g has 당, and the bracket notes the serving size. A head row with bars is a
  // row of columns, read from the first (#122).
  const sizesIn = (from: number, to: number) =>
    [
      ...text
        .slice(from, to)
        .matchAll(/(\d+(?:\.\d+)?)\s*(g|ml)(?![a-z])(\s*[\])]?\s*(?:당(?![가-힣])|기준))?/g),
    ].map((match) => ({
      size: `${twoDecimals(Number(match[1]))}${match[2]}`,
      isBasis: !!match[3],
    }));
  const chosenSize = chosen?.basis ? `${chosen.basis.size}${chosen.basis.unit}` : null;
  // Two sizes on the serving's head, one of them a basis ("30g (100g당)"); a weight noted beside
  // a volume ("200ml (206g)") or "1개(30g)" names one serving.
  const twoBases = (from: number, to: number) => {
    const sizes = sizesIn(from, to);
    return sizes.some(({ isBasis }) => isBasis) && new Set(sizes.map(({ size }) => size)).size > 1;
  };
  // A basis on the heading line above the serving ("영양정보 (100g당)") that is another size.
  const otherBasis = (from: number, to: number) =>
    sizesIn(from, to).some(({ size, isBasis }) => isBasis && size !== chosenSize);
  const chosenLineEnd = chosen ? text.indexOf('\n', chosen.index) : -1;
  const servingHead = chosen
    ? text
        .slice(chosen.index, chosenLineEnd === -1 ? text.length : chosenLineEnd)
        .split(new RegExp(String.raw`열량|에너지|칼로리|\d\s*kcal|${nutrientWords}`))[0]
    : '';
  const bracketedBasis =
    chosen?.kind === 'serving' &&
    !servingHead.includes('|') &&
    (twoBases(chosen.index, chosen.index + servingHead.length) ||
      // "1회 제공량 30g (총 내용량당)": the package, another size than the serving.
      candidates.some(
        (candidate) =>
          candidate.kind === 'total' &&
          candidate.index > chosen.index &&
          candidate.index < chosen.index + servingHead.length &&
          (candidate.basis === null ||
            `${candidate.basis.size}${candidate.basis.unit}` !== chosenSize),
      ) ||
      (header !== null &&
        lineStart(header.index) < lineStart(chosen.index) &&
        otherBasis(header.index, text.indexOf('\n', header.index))));

  const basisFromTotal = candidates.length === 0 && total !== null;
  const basis =
    stackedHeads || headInLaterColumn || bracketedBasis
      ? null
      : chosen
        ? (chosen.basis ??
          borrowedServing(
            chosen,
            candidates,
            text,
            header ? header.index : servingLineAbove(text, range.begin),
            range.end,
          ))
        : basisFromTotal
          ? total
          : null;

  // Columns are counted on the head line itself when it has bars, so a head the row did not
  // recognise still counts: a 2-cell row then holds the name and the first value, not two values.
  // A name cell is not a value column.
  const heads = headCells.length
    ? headCells.slice(nameCell ? 1 : 0).filter((cell) => cell && !shareHead.test(cell)).length
    : Math.max(row.length, 1);
  const lines = text.slice(range.begin, range.end).split('\n');
  const ownCell = namesInOwnCell(lines, heads);
  const table = lines.map((line) => firstColumn(line, heads, ownCell)).join('\n');

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
