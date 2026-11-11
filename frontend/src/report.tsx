import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { DailyBars } from './daily-bars';
import { dailyRangeText, earliestDate, inDailyRange, isValidDate, latestDate } from './daily-date';
import { type Health, healthText } from './health';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { count } from './plural';
import { RemindersCard } from './reminders';
import {
  changeText,
  daysText,
  fewNights,
  minutesText,
  type Period,
  periodSpan,
  periodWords,
  type Report,
  type ReportSummary,
  shareOf,
  shiftPeriod,
  spanLabel,
} from './report-text';

function Stat({
  label,
  value,
  change,
  sample,
}: {
  label: string;
  value: string;
  change: string | null;
  sample: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
      <dd className="text-caption break-keep text-muted-foreground">
        {sample}
        {change ? ` · ${change}` : ''}
      </dd>
    </div>
  );
}

function Stats({
  current,
  previous,
  period,
}: {
  current: ReportSummary;
  previous: ReportSummary;
  period: Period;
}) {
  const words = periodWords[period];
  const diet = shareOf(current.diet);
  const sleepGood = shareOf(current.sleepGood);
  const points = (value: number) => `${value}%p`;
  const drinking = shareOf({ days: current.drinking.days, yes: current.drinking.drinkingDays });
  const previousDrinking = { days: previous.drinking.days, yes: previous.drinking.drinkingDays };
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Stat
        label="Average sleep"
        value={
          current.sleep.averageMinutes === null
            ? 'No records'
            : minutesText(current.sleep.averageMinutes)
        }
        sample={daysText(current.sleep.days)}
        change={changeText(
          current.sleep.averageMinutes,
          previous.sleep.averageMinutes,
          previous.sleep.days,
          words,
          minutesText,
        )}
      />
      <Stat
        label="Average daily calories"
        value={
          current.calories.average === null
            ? 'No records'
            : `${current.calories.average.toLocaleString('en-US')}kcal`
        }
        sample={
          daysText(current.calories.days) +
          (current.calories.incompleteDays
            ? ` (excludes ${count(current.calories.incompleteDays, 'day')} with unknown calories)`
            : '')
        }
        change={changeText(
          current.calories.average,
          previous.calories.average,
          previous.calories.days,
          words,
          (value) => `${value.toLocaleString('en-US')}kcal`,
        )}
      />
      <Stat
        label="Days with drinking"
        value={
          drinking === null
            ? 'No records'
            : `${count(current.drinking.drinkingDays, 'day')} (${drinking}%)`
        }
        sample={daysText(current.drinking.days)}
        // Periods with different numbers of recorded days compare by share, not by count.
        change={changeText(
          drinking,
          shareOf(previousDrinking),
          previous.drinking.days,
          words,
          points,
        )}
      />
      <Stat
        label="Average daily smoking"
        value={
          current.smoking.averagePerDay === null
            ? 'No records'
            : count(current.smoking.averagePerDay, 'cigarette')
        }
        sample={
          daysText(current.smoking.days) +
          (current.smoking.cigarettes === null
            ? ''
            : ` · total ${count(current.smoking.cigarettes, 'cigarette')}`)
        }
        change={changeText(
          current.smoking.averagePerDay,
          previous.smoking.averagePerDay,
          previous.smoking.days,
          words,
          (value) => count(Number(value.toFixed(1)), 'cigarette'),
        )}
      />
      <Stat
        label="Diet kept"
        value={diet === null ? 'No records' : `${diet}%`}
        sample={`${count(current.diet.days, 'day')} checked`}
        change={changeText(diet, shareOf(previous.diet), previous.diet.days, words, points)}
      />
      <Stat
        label="Sleep good"
        value={sleepGood === null ? 'No records' : `${sleepGood}%`}
        sample={`${count(current.sleepGood.days, 'day')} checked`}
        change={changeText(
          sleepGood,
          shareOf(previous.sleepGood),
          previous.sleepGood.days,
          words,
          points,
        )}
      />
    </dl>
  );
}

function SleepAfterDrinking({ report }: { report: Report }) {
  const { afterDrinking, afterNoDrinking } = report.sleepAfterDrinking;
  const groups = [
    { label: 'Nights after drinking', group: afterDrinking, bar: 'bg-[#eb6834] dark:bg-[#d95926]' },
    {
      label: 'Nights without drinking',
      group: afterNoDrinking,
      bar: 'bg-[#2a78d6] dark:bg-[#3987e5]',
    },
  ];
  const longest = Math.max(...groups.map(({ group }) => group.averageMinutes ?? 0), 1);
  const thin = groups.some(({ group }) => group.nights < fewNights);
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Drinking and sleep that night</CardTitle>
        <CardDescription className="break-keep">
          This shows a relationship only; it does not establish a cause.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-3">
          {groups.map(({ label, group, bar }) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="flex flex-wrap justify-between gap-2 text-body-sm">
                <span>{label}</span>
                <span className="text-muted-foreground">
                  Sample: {count(group.nights, 'night')}
                </span>
              </dt>
              <dd className="flex items-center gap-2 text-body-sm">
                <span className="h-2 min-w-0 flex-1 rounded-full bg-muted">
                  {group.averageMinutes === null ? null : (
                    <span
                      className={`block h-2 rounded-full ${bar}`}
                      style={{ width: `${(group.averageMinutes / longest) * 100}%` }}
                    />
                  )}
                </span>
                <span className="w-24 shrink-0 text-right">
                  {group.averageMinutes === null ? 'No records' : minutesText(group.averageMinutes)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {thin ? (
          <p className="text-caption break-keep text-muted-foreground">
            One sample has fewer than {fewNights} nights, so the difference is hard to trust. Check
            again once more records build up.
          </p>
        ) : null}
        <p className="text-caption break-keep text-muted-foreground">
          Compares sleep from nights after a recorded drinking day to the next morning. Sleep is
          recorded by the day you wake up, so it is the next date's sleep. Nights after days without
          a drinking record are left out.
        </p>
      </CardContent>
    </Card>
  );
}

const periods: { value: Period; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

export function ReportPage({ health }: { health: Health }) {
  const [params, setParams] = useSearchParams();
  const period: Period = params.get('period') === 'month' ? 'month' : 'week';
  const asked = params.get('date');
  // The last date the server gave. One failed health poll must not blank a report already shown.
  const [lastToday, setLastToday] = useState<string | null>(null);
  if (health.state === 'ok' && health.today !== lastToday) setLastToday(health.today);
  const today = health.state === 'ok' ? health.today : lastToday;
  // A date the daily page would not open holds no records: said, as there, instead of an empty
  // report (#130).
  const outOfRange = asked !== null && isValidDate(asked) && !inDailyRange(asked);
  const date = outOfRange ? null : asked && isValidDate(asked) ? asked : today;
  const [report, setReport] = useState<Report | null>(null);
  // Moving to another period keeps the report on screen, dimmed, until the next one arrives: the
  // period row and the button just pressed stay, and so does keyboard focus (#138).
  const [loading, setLoading] = useState(false);
  const { notice, error, clear } = useNotice();
  const latest = useRef(0);
  // While a retry is on its way its button stays, so keyboard focus is not dropped to the page;
  // once the report is back, focus moves to the period it shows (#128).
  const [retrying, setRetrying] = useState(false);
  const focusSpan = useRef(false);
  // "Go to this week" goes with the word about a date out of range; its report takes the focus too.
  const focusOnArrival = useRef(false);
  const span = useRef<HTMLParagraphElement>(null);
  // A move whose report fails takes its row away; focus goes to "Try again" instead (#138).
  const moved = useRef(false);
  const [focusRetry, setFocusRetry] = useState(0);
  const retryButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (): Promise<'ok' | 'failed' | 'stale'> => {
    // A slow answer for a period already left must not replace the one on screen, nor land next
    // to the word about a date out of range.
    const request = ++latest.current;
    clear();
    if (!date) {
      setReport(null);
      setLoading(false);
      return 'stale';
    }
    setLoading(true);
    try {
      const data = await requestJson<Report>(`/api/report?period=${period}&date=${date}`);
      if (request !== latest.current) return 'stale';
      setReport(data);
      setLoading(false);
      return 'ok';
    } catch (cause) {
      if (request !== latest.current) return 'stale';
      setReport(null);
      setLoading(false);
      // Nothing arrives, so a focus waiting for the report must not fire on a later one.
      focusOnArrival.current = false;
      error(cause);
      return 'failed';
    }
  }, [clear, date, error, period]);

  const retry = async () => {
    setRetrying(true);
    const outcome = await load();
    // A retry for a period already left is over: the period change ended it, and a newer retry
    // may be on its way, whose button must stay.
    if (outcome === 'stale') return;
    focusSpan.current = outcome === 'ok';
    setRetrying(false);
  };

  useEffect(() => {
    // A retry for the period left is over: the one now asked for is not a retry.
    setRetrying(false);
    focusSpan.current = false;
    const fromMove = moved.current;
    moved.current = false;
    void load().then((outcome) => {
      if (outcome === 'failed' && fromMove) setFocusRetry((count) => count + 1);
    });
  }, [load]);

  useEffect(() => {
    if (!focusRetry) return;
    if (document.activeElement === document.body || document.activeElement === null) {
      retryButton.current?.focus();
    }
  }, [focusRetry]);

  // `arrival`: the pressed button goes once the period asked for is shown, so its focus moves to
  // the period then. Any other move drops a focus still waiting from an earlier one.
  const go = (next: { period?: Period; date?: string }, arrival = false) => {
    const nextPeriod = next.period ?? period;
    const nextDate = next.date ?? date ?? '';
    // The same period and date ask for nothing: no load follows to clear the marks set here.
    if (nextPeriod === period && nextDate === (date ?? '')) return;
    focusOnArrival.current = arrival;
    moved.current = true;
    setParams({ period: nextPeriod, date: nextDate });
  };

  const words = periodWords[period];
  // The last report, even for the period just left while the next one is on its way.
  const shown = report && report.period in periodWords ? report : null;

  useEffect(() => {
    if (!shown) return;
    if (focusOnArrival.current) {
      focusOnArrival.current = false;
      focusSpan.current = true;
    }
    if (retrying || !focusSpan.current) return;
    focusSpan.current = false;
    // Only focus that the gone button dropped; somewhere the person moved to meanwhile stays.
    if (document.activeElement === document.body || document.activeElement === null) {
      span.current?.focus();
    }
  }, [retrying, shown]);

  // The first and last periods holding a day the daily page opens (#130).
  // The period asked for, which the shown one may still trail while it loads (#138).
  const target = date ? periodSpan(period, date) : null;
  const atStart = target !== null && target.from <= earliestDate;
  const atEnd = target !== null && target.to >= latestDate;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">Dashboard</h1>
        <p className="text-body text-muted-foreground">
          View weekly and monthly changes in sleep, diet, alcohol and tobacco, and daily checks.
        </p>
        {health.state === 'error' ? (
          <p role="alert" className="text-body-sm text-destructive">
            {healthText(health)}
          </p>
        ) : (
          <p role="status" className="text-caption text-muted-foreground">
            {healthText(health)}
          </p>
        )}
      </header>
      {/* Keyed by the service day, so an open dashboard moves on at midnight (#48). */}
      {today ? <RemindersCard key={today} /> : null}
      <nav aria-label="Choose period" className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period unit" className="flex gap-2">
          {periods.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? 'default' : 'outline'}
              aria-pressed={period === value}
              onClick={() => go({ period: value })}
            >
              {label}
            </Button>
          ))}
        </div>
        {shown ? (
          <div className="flex items-center gap-2">
            {/* aria-disabled, not disabled: a disabled button drops the focus of whoever pressed
                it, as the daily page's day links do at the range's ends. */}
            <Button
              variant="outline"
              size="icon"
              aria-label={`Previous ${words.name}`}
              aria-disabled={atStart || undefined}
              aria-description={atStart ? dailyRangeText : undefined}
              title={atStart ? dailyRangeText : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                // The previous period may start before the range while holding 2000-01-01, as
                // the week of 1999-12-27 does: that period is asked for by its first day in range.
                if (!atStart && target) {
                  const previous = shiftPeriod(period, target.from, -1);
                  go({ date: previous < earliestDate ? earliestDate : previous });
                }
              }}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <p
              ref={span}
              tabIndex={-1}
              aria-live="polite"
              className="text-body-sm break-keep outline-none"
            >
              {/* A date with its year no longer fits a phone's row: the line breaks only at "–",
                  never inside "Jan 2, 2000". */}
              {spanLabel(shown.current, today).replace(/(?<!–) (?!–)/g, '\u00a0')}
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Next ${words.name}`}
              aria-disabled={atEnd || undefined}
              aria-description={atEnd ? dailyRangeText : undefined}
              title={atEnd ? dailyRangeText : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (!atEnd && target) go({ date: shiftPeriod(period, target.from, 1) });
              }}
            >
              <ChevronRight aria-hidden />
            </Button>
            {/* Shown by the period on screen, so the button stays, with its focus, while the next
                period loads; it goes once that period arrives. */}
            {today && (today < shown.current.from || today > shown.current.to) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // The button goes once this period is shown; its focus moves to the period.
                  go({ date: today }, true);
                }}
              >
                This {words.name}
              </Button>
            ) : null}
          </div>
        ) : null}
      </nav>
      {outOfRange ? (
        <>
          <Notice notice={{ kind: 'error', text: `${dailyRangeText}: ${asked}` }} />
          {today ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                // The button goes with the word, which would drop keyboard focus to the page.
                go({ date: today }, true);
              }}
            >
              Go to this {words.name}
            </Button>
          ) : null}
        </>
      ) : null}
      <Notice notice={notice} />
      {(notice || retrying) && date ? (
        <Button
          ref={retryButton}
          variant="outline"
          className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-disabled={retrying || undefined}
          onClick={() => {
            if (!retrying) void retry();
          }}
        >
          Try again
        </Button>
      ) : null}
      {!date && !outOfRange && health.state === 'error' ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          The server's today date is unknown, so the report could not be loaded. It loads again once
          the server connection is back.
        </p>
      ) : null}
      {!shown && !notice && !outOfRange && (date || health.state === 'loading') ? (
        <div role="status" aria-busy="true" aria-label="Loading report">
          <SkeletonText lines={3} />
        </div>
      ) : null}
      {shown ? (
        // The earlier report stays, dimmed and marked busy, until the next one replaces it.
        <div
          aria-busy={loading || undefined}
          className={`flex flex-col gap-6 transition-opacity ${loading ? 'opacity-50' : ''}`}
        >
          <Stats current={shown.current} previous={shown.previous} period={shown.period} />
          <Card>
            <CardHeader>
              <CardTitle asHeading="h2">Records by day</CardTitle>
              <CardDescription className="break-keep">
                Days without a record are left blank. Hover or tap a bar to see its value.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <DailyBars
                title="Sleep time"
                bars={shown.days.map((day) => ({ date: day.date, value: day.sleepMinutes }))}
                format={minutesText}
              />
              <DailyBars
                title="Calories"
                bars={shown.days.map((day) => ({ date: day.date, value: day.calories }))}
                format={(value) => `${value.toLocaleString('en-US')}kcal`}
              />
            </CardContent>
          </Card>
          <SleepAfterDrinking report={shown} />
        </div>
      ) : null}
    </section>
  );
}
