import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { labsPath, rangeText } from './lab-text';
import {
  chartOf,
  mixedUnits,
  optionText,
  type TestName,
  type Trend,
  trendRows,
  unitsOf,
} from './lab-trend';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';

const statusWord = { low: 'Below range', normal: 'In range', high: 'Above range' } as const;

// Same look as the dialog's native select.
const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none pointer-coarse:min-h-11 md:text-body-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function TrendChart({ trend }: { trend: Trend }) {
  const chart = chartOf(trend.points);
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const label = `${trend.name}: ${trend.points.length} results from ${first.date} to ${last.date}, latest ${last.value}${last.unit ? ` ${last.unit}` : ''}`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      className="h-auto w-full max-w-xl rounded-md border border-border"
    >
      {chart.band ? (
        <rect
          x={0}
          width={chart.width}
          y={chart.band.y}
          height={chart.band.height}
          className="fill-muted"
        />
      ) : null}
      {chart.dots.length > 1 ? (
        <polyline
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={1.5}
          points={chart.dots.map((dot) => `${dot.x},${dot.y}`).join(' ')}
        />
      ) : null}
      {chart.dots.map((dot) => (
        <circle
          key={dot.id}
          cx={dot.x}
          cy={dot.y}
          r={4}
          className={
            dot.status === 'high' || dot.status === 'low' ? 'fill-destructive' : 'fill-foreground'
          }
        />
      ))}
    </svg>
  );
}

function TrendView({ trend }: { trend: Trend }) {
  const { points } = trend;
  if (points.length === 0) {
    return <p className="text-body-sm text-muted-foreground">No results for this test.</p>;
  }
  const rows = trendRows(points);
  const latest = points[points.length - 1];
  const range = rangeText(latest);
  return (
    <div className="flex flex-col gap-3">
      {points.length === 1 ? (
        <p className="text-body-sm text-muted-foreground">
          Only one result so far, so there is no trend yet.
        </p>
      ) : null}
      {mixedUnits(points) ? (
        <p role="note" className="text-body-sm text-muted-foreground">
          This test was recorded with different units ({unitsOf(points).join(', ')}). Changes are
          shown only between results with the same unit.
        </p>
      ) : null}
      <TrendChart trend={trend} />
      {range ? (
        <p className="text-caption text-muted-foreground">
          The shaded band is the latest result&apos;s range. {range}.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <caption className="sr-only">Results of {trend.name} over time</caption>
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-2 font-normal">
                Date
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Result
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Change
              </th>
              <th scope="col" className="px-2 py-1 font-normal">
                Range
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="py-1 pr-2 font-normal whitespace-nowrap">
                  {row.date}
                </th>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.value}
                  {row.unit ? ` ${row.unit}` : ''}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{row.change ?? '—'}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.status ? statusWord[row.status] : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One test over the years: pick a recorded test, see its values with the reference range. */
export function LabTrendCard() {
  const names = useApiQuery<{ names: TestName[] }>(apiKey(labsPath, 'names'), `${labsPath}/names`);
  const [chosen, setChosen] = useState('');
  const list = names.data?.names ?? [];
  // A test whose last result was deleted drops out of the list, and so out of the choice.
  const selected = list.some((item) => item.name === chosen) ? chosen : '';
  const trend = useApiQuery<Trend>(
    apiKey(labsPath, 'trend', selected),
    `${labsPath}/trend?name=${encodeURIComponent(selected)}`,
    { enabled: selected !== '' },
  );
  const failed = names.isError
    ? errorText(names.error)
    : selected && trend.isError
      ? errorText(trend.error)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Trend over time</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.length === 0 && !names.isError ? (
          <p className="text-body-sm text-muted-foreground">
            {names.isPending ? 'Loading…' : 'Record a result to see how a test changes over time.'}
          </p>
        ) : (
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor="lab-trend-name">Test</Label>
            <select
              id="lab-trend-name"
              className={selectClass}
              value={selected}
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">Choose a test</option>
              {list.map((item) => (
                <option key={item.name} value={item.name}>
                  {optionText(item)}
                </option>
              ))}
            </select>
          </div>
        )}
        <Notice notice={failed ? { kind: 'error', text: failed } : undefined} />
        {selected && trend.isPending && !trend.isError ? (
          <p role="status" className="text-body-sm text-muted-foreground">
            Loading…
          </p>
        ) : null}
        {selected && trend.data ? <TrendView trend={trend.data} /> : null}
      </CardContent>
    </Card>
  );
}
