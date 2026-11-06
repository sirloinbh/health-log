import { useState } from 'react';

type Bar = { date: string; value: number | null };

const height = 120;
const slot = 12;
const barWidth = 8;

const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/**
 * One value per day as thin bars from a shared baseline. A day without a value is a gap with a
 * small mark, never a zero bar. Hovering or tapping a bar shows its day; keyboard and screen
 * reader users read every value from the table below.
 */
export function DailyBars({
  title,
  bars,
  format,
}: {
  title: string;
  bars: Bar[];
  format: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const values = bars.flatMap((bar) => (bar.value === null ? [] : [bar.value]));
  const max = Math.max(...values, 0);
  const width = bars.length * slot;
  const recorded = values.length;
  const summary =
    recorded === 0
      ? `${title}: 기록한 날이 없습니다`
      : `${title}: ${bars.length}일 중 ${recorded}일 기록, 가장 높은 날 ${format(max)}`;
  const shown = active === null ? null : bars[active];
  // The same share of bars counts as an edge on either side.
  const edgeSpan = bars.length / 4;
  const edge =
    active === null
      ? null
      : active < edgeSpan
        ? 'start'
        : bars.length - 1 - active < edgeSpan
          ? 'end'
          : null;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium">{title}</span>
        {recorded ? (
          <span className="text-caption text-muted-foreground">최고 {format(max)}</span>
        ) : null}
      </figcaption>
      <div className="relative">
        <svg
          role="img"
          aria-label={summary}
          viewBox={`0 0 ${width} ${height + 4}`}
          preserveAspectRatio="none"
          className="h-32 w-full overflow-visible"
          onMouseLeave={() => setActive(null)}
        >
          <line
            x1={0}
            x2={width}
            y1={height + 0.5}
            y2={height + 0.5}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {bars.map((bar, index) => {
            const x = index * slot + (slot - barWidth) / 2;
            const barHeight =
              bar.value === null || max === 0 ? 0 : Math.max((bar.value / max) * height, 2);
            return (
              <g key={bar.date}>
                {bar.value === null ? (
                  // A gap still shows that the day exists and has no record.
                  <rect
                    x={x + barWidth / 2 - 1}
                    y={height - 3}
                    width={2}
                    height={3}
                    className="fill-muted-foreground/40"
                  />
                ) : (
                  <rect
                    x={x}
                    y={height - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    className={
                      active === index
                        ? 'fill-[#1f5fae] dark:fill-[#6aa6ee]'
                        : 'fill-[#2a78d6] dark:fill-[#3987e5]'
                    }
                  />
                )}
                {/* The hit area is the whole column, larger than the bar itself. */}
                <rect
                  x={index * slot}
                  y={0}
                  width={slot}
                  height={height + 4}
                  fill="transparent"
                  onMouseEnter={() => setActive(index)}
                  // A touch screen has no hover; a tap shows the day. A tap also sends mouseenter
                  // first, so toggling here would hide it again at once.
                  onClick={() => setActive(index)}
                />
              </g>
            );
          })}
        </svg>
        {shown ? (
          <div
            role="status"
            // Near either edge the tip hangs inward, so it never sticks out past the card.
            className={`pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-md border bg-popover px-2 py-1 text-caption whitespace-nowrap text-popover-foreground shadow-sm ${
              edge === 'start' ? '' : edge === 'end' ? '-translate-x-full' : '-translate-x-1/2'
            }`}
            style={{
              left: `${(((active ?? 0) + (edge === 'start' ? 0 : edge === 'end' ? 1 : 0.5)) / bars.length) * 100}%`,
            }}
          >
            {dayLabel(shown.date)} · {shown.value === null ? '기록 없음' : format(shown.value)}
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-caption text-muted-foreground">
        <span>{bars[0] ? dayLabel(bars[0].date) : null}</span>
        <span>{bars.at(-1) ? dayLabel(bars.at(-1)!.date) : null}</span>
      </div>
      <details className="text-body-sm">
        <summary className="cursor-pointer text-muted-foreground">{title} 표로 보기</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-4 font-normal">
                날짜
              </th>
              <th scope="col" className="py-1 font-normal">
                {title}
              </th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.date}>
                <th scope="row" className="py-0.5 pr-4 font-normal">
                  {dayLabel(bar.date)}
                </th>
                <td className="py-0.5">{bar.value === null ? '기록 없음' : format(bar.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
