// One lab test over the years (#331): the points as the API sends them, and the figures built from them.
import { formatChange } from './body-change';

export type TrendPoint = {
  id: number;
  date: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
};

export type TestName = { name: string; count: number; latest: string };

export type Trend = { name: string; points: TrendPoint[] };

export type TrendRow = TrendPoint & {
  /** Against the result before it, when that one used the same unit. */
  change: string | null;
  status: 'low' | 'normal' | 'high' | null;
};

/** Whole ten-thousandths, so 0.3 - 0.1 does not show as 0.19999999999999998. */
const scaled = (value: number) => Math.round(value * 10_000);

const statusOf = (point: TrendPoint) => {
  if (point.refLow === null && point.refHigh === null) return null;
  if (point.refLow !== null && point.value < point.refLow) return 'low' as const;
  if (point.refHigh !== null && point.value > point.refHigh) return 'high' as const;
  return 'normal' as const;
};

/** "+10 mg/dL", "−5.5", "No change"; null for the first result or when the unit changed. */
export function changeText(previous: TrendPoint | undefined, point: TrendPoint) {
  if (!previous || previous.unit !== point.unit) return null;
  const amount = (scaled(point.value) - scaled(previous.value)) / 10_000;
  return formatChange(
    { amount, from: previous.date, to: point.date },
    point.unit ? ` ${point.unit}` : '',
  );
}

/** The rows of the table: oldest first, as the API sends them. */
export const trendRows = (points: TrendPoint[]): TrendRow[] =>
  points.map((point, index) => ({
    ...point,
    change: changeText(points[index - 1], point),
    status: statusOf(point),
  }));

/** The units the test was recorded with, in the order first used. */
export const unitsOf = (points: TrendPoint[]) => [
  ...new Set(points.map((point) => point.unit).filter((unit): unit is string => unit !== null)),
];

/** True when the results do not all share one unit, so their values are not directly comparable. */
export const mixedUnits = (points: TrendPoint[]) =>
  new Set(points.map((point) => point.unit)).size > 1;

/** The count the selector shows next to a name: "LDL (3 results)". */
export const optionText = (item: TestName) =>
  `${item.name} (${item.count} ${item.count === 1 ? 'result' : 'results'})`;

const chartWidth = 320;
const chartHeight = 140;
const pad = 12;

export type Chart = {
  width: number;
  height: number;
  /** Every dot, in chart units, oldest first. */
  dots: { id: number; x: number; y: number; status: TrendRow['status'] }[];
  /** The latest result's reference range as a band, or null without one. */
  band: { y: number; height: number } | null;
};

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * Where the dots and the reference band go. Dates are spread by distance, so a gap of years looks like
 * one. The band is the latest result's range, clipped to the chart; a missing limit runs to the edge.
 */
export function chartOf(points: TrendPoint[]): Chart {
  const latest = points[points.length - 1];
  const limits = latest ? [latest.refLow, latest.refHigh] : [];
  const values = [
    ...points.map((point) => point.value),
    ...limits.filter((limit) => limit !== null),
  ];
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A single level still needs a span to draw on.
  const span = high - low || Math.max(Math.abs(high), 1);
  const bottom = high - low ? low : low - span / 2;
  const top = bottom + span;
  const y = (value: number) => pad + ((top - value) / (top - bottom)) * (chartHeight - 2 * pad);
  const first = points.length ? day(points[0].date) : 0;
  const run = points.length ? day(points[points.length - 1].date) - first : 0;
  const x = (date: string) =>
    run === 0 ? chartWidth / 2 : pad + ((day(date) - first) / run) * (chartWidth - 2 * pad);
  const band =
    latest && (latest.refLow !== null || latest.refHigh !== null)
      ? (() => {
          const upper = latest.refHigh === null ? pad : y(Math.min(latest.refHigh, top));
          const lower =
            latest.refLow === null ? chartHeight - pad : y(Math.max(latest.refLow, bottom));
          return { y: upper, height: Math.max(lower - upper, 1) };
        })()
      : null;
  return {
    width: chartWidth,
    height: chartHeight,
    dots: trendRows(points).map((row) => ({
      id: row.id,
      x: x(row.date),
      y: y(row.value),
      status: row.status,
    })),
    band,
  };
}
