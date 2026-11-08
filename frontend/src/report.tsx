import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { DailyBars } from './daily-bars';
import { isValidDate } from './daily-date';
import { type Health, healthText } from './health';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { RemindersCard } from './reminders';
import {
  changeText,
  daysText,
  fewNights,
  minutesText,
  type Period,
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
        label="평균 수면"
        value={
          current.sleep.averageMinutes === null
            ? '기록 없음'
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
        label="하루 평균 칼로리"
        value={
          current.calories.average === null
            ? '기록 없음'
            : `${current.calories.average.toLocaleString('ko-KR')}kcal`
        }
        sample={
          daysText(current.calories.days) +
          (current.calories.incompleteDays
            ? ` (칼로리를 모르는 날 ${current.calories.incompleteDays}일 제외)`
            : '')
        }
        change={changeText(
          current.calories.average,
          previous.calories.average,
          previous.calories.days,
          words,
          (value) => `${value.toLocaleString('ko-KR')}kcal`,
        )}
      />
      <Stat
        label="술 마신 날"
        value={
          drinking === null ? '기록 없음' : `${current.drinking.drinkingDays}일 (${drinking}%)`
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
        label="하루 평균 흡연"
        value={
          current.smoking.averagePerDay === null
            ? '기록 없음'
            : `${current.smoking.averagePerDay}개비`
        }
        sample={
          daysText(current.smoking.days) +
          (current.smoking.cigarettes === null ? '' : ` · 합계 ${current.smoking.cigarettes}개비`)
        }
        change={changeText(
          current.smoking.averagePerDay,
          previous.smoking.averagePerDay,
          previous.smoking.days,
          words,
          (value) => `${Number(value.toFixed(1))}개비`,
        )}
      />
      <Stat
        label="식단 지킴"
        value={diet === null ? '기록 없음' : `${diet}%`}
        sample={`체크한 날 ${current.diet.days}일`}
        change={changeText(diet, shareOf(previous.diet), previous.diet.days, words, points)}
      />
      <Stat
        label="수면 만족"
        value={sleepGood === null ? '기록 없음' : `${sleepGood}%`}
        sample={`체크한 날 ${current.sleepGood.days}일`}
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
    { label: '술 마신 날 밤', group: afterDrinking, bar: 'bg-[#eb6834] dark:bg-[#d95926]' },
    { label: '안 마신 날 밤', group: afterNoDrinking, bar: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  ];
  const longest = Math.max(...groups.map(({ group }) => group.averageMinutes ?? 0), 1);
  const thin = groups.some(({ group }) => group.nights < fewNights);
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">술과 그날 밤 수면</CardTitle>
        <CardDescription className="break-keep">
          관련성을 보여 줄 뿐, 원인을 판정하지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-3">
          {groups.map(({ label, group, bar }) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="flex flex-wrap justify-between gap-2 text-body-sm">
                <span>{label}</span>
                <span className="text-muted-foreground">표본 {group.nights}일</span>
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
                  {group.averageMinutes === null ? '기록 없음' : minutesText(group.averageMinutes)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {thin ? (
          <p className="text-caption break-keep text-muted-foreground">
            한쪽 표본이 {fewNights}일보다 적어 차이를 믿기 어렵습니다. 기록이 더 쌓이면 다시 보세요.
          </p>
        ) : null}
        <p className="text-caption break-keep text-muted-foreground">
          술을 기록한 날 밤에 자고 다음 날 아침에 깬 수면을 비교합니다. 수면은 깬 날짜로 기록하므로
          다음 날짜의 수면입니다. 술을 기록하지 않은 날 밤은 빼고 셉니다.
        </p>
      </CardContent>
    </Card>
  );
}

const periods: { value: Period; label: string }[] = [
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
];

export function ReportPage({ health }: { health: Health }) {
  const [params, setParams] = useSearchParams();
  const period: Period = params.get('period') === 'month' ? 'month' : 'week';
  const asked = params.get('date');
  // The last date the server gave. One failed health poll must not blank a report already shown.
  const [lastToday, setLastToday] = useState<string | null>(null);
  if (health.state === 'ok' && health.today !== lastToday) setLastToday(health.today);
  const today = health.state === 'ok' ? health.today : lastToday;
  const date = asked && isValidDate(asked) ? asked : today;
  const [report, setReport] = useState<Report | null>(null);
  const { notice, error, clear } = useNotice();
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!date) return;
    // A slow answer for a period already left must not replace the one on screen.
    const request = ++latest.current;
    clear();
    try {
      const data = await requestJson<Report>(`/api/report?period=${period}&date=${date}`);
      if (request === latest.current) setReport(data);
    } catch (cause) {
      if (request === latest.current) {
        setReport(null);
        error(cause);
      }
    }
  }, [clear, date, error, period]);

  useEffect(() => {
    setReport(null);
    void load();
  }, [load]);

  const go = (next: { period?: Period; date?: string }) =>
    setParams({ period: next.period ?? period, date: next.date ?? date ?? '' });

  const words = periodWords[period];
  const shown = report && report.period === period ? report : null;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">대시보드</h1>
        <p className="text-body text-muted-foreground">
          수면, 식단, 술·담배, 하루 체크의 주간·월간 변화를 봅니다.
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
      <nav aria-label="기간 선택" className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="기간 단위" className="flex gap-2">
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
            <Button
              variant="outline"
              size="icon"
              aria-label={`이전 ${words.name}`}
              onClick={() => go({ date: shiftPeriod(period, shown.current.from, -1) })}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <p aria-live="polite" className="text-body-sm">
              {spanLabel(shown.current)}
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label={`다음 ${words.name}`}
              onClick={() => go({ date: shiftPeriod(period, shown.current.from, 1) })}
            >
              <ChevronRight aria-hidden />
            </Button>
            {today && (today < shown.current.from || today > shown.current.to) ? (
              <Button variant="outline" size="sm" onClick={() => go({ date: today })}>
                이번 {words.name}
              </Button>
            ) : null}
          </div>
        ) : null}
      </nav>
      <Notice notice={notice} />
      {notice && date ? (
        <Button variant="outline" className="self-start" onClick={() => void load()}>
          다시 시도
        </Button>
      ) : null}
      {!date && health.state === 'error' ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          서버의 오늘 날짜를 알 수 없어 리포트를 불러오지 못했습니다. 서버 연결이 돌아오면 다시
          불러옵니다.
        </p>
      ) : null}
      {!shown && !notice && (date || health.state === 'loading') ? (
        <div role="status" aria-busy="true" aria-label="리포트 불러오는 중">
          <SkeletonText lines={3} />
        </div>
      ) : null}
      {shown ? (
        <>
          <Stats current={shown.current} previous={shown.previous} period={period} />
          <Card>
            <CardHeader>
              <CardTitle asHeading="h2">날짜별 기록</CardTitle>
              <CardDescription className="break-keep">
                기록이 없는 날은 막대 없이 비워 둡니다. 막대에 마우스를 올리거나 누르면 값이
                보입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <DailyBars
                title="수면 시간"
                bars={shown.days.map((day) => ({ date: day.date, value: day.sleepMinutes }))}
                format={minutesText}
              />
              <DailyBars
                title="칼로리"
                bars={shown.days.map((day) => ({ date: day.date, value: day.calories }))}
                format={(value) => `${value.toLocaleString('ko-KR')}kcal`}
              />
            </CardContent>
          </Card>
          <SleepAfterDrinking report={shown} />
        </>
      ) : null}
    </section>
  );
}
