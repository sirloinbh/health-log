import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { formatDate, isValidDate, shiftDate } from './daily-date';
import { type Health, healthText } from './health';

// Each feature replaces its placeholder here as its issue lands.
const sections = ['수면', '식단', '술·담배', '하루 체크', '병원·약'];

// Typing a year passes through values like 0002-10-31; those must not change the page.
const earliestDate = '2000-01-01';

function DailyHeader({ description }: { description?: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 id="page-title">하루 기록</h1>
      {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
    </header>
  );
}

// "Today" comes from the server, which counts it in the service time zone.
export function TodayRedirect({ basePath, health }: { basePath: string; health: Health }) {
  if (health.state === 'ok') return <Navigate to={`${basePath}/${health.today}`} replace />;
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <DailyHeader />
      <Notice
        notice={{ kind: health.state === 'error' ? 'error' : 'status', text: healthText(health) }}
      />
    </section>
  );
}

export function DailyPage({ basePath, health }: { basePath: string; health: Health }) {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  // The date input reports partial values while typing; hold them until they form a usable date.
  const [draft, setDraft] = useState<string | null>(null);

  if (!isValidDate(date)) {
    return (
      <section aria-labelledby="page-title" className="flex flex-col gap-6">
        <DailyHeader />
        <Notice notice={{ kind: 'error', text: `없는 날짜입니다: ${date}` }} />
        <Button asChild variant="outline" className="self-start">
          <Link to={basePath}>오늘 기록으로 이동</Link>
        </Button>
      </section>
    );
  }

  const today = health.state === 'ok' ? health.today : null;
  const pathOf = (value: string) => `${basePath}/${value}`;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <DailyHeader description={formatDate(date)} />
      {health.state === 'error' ? (
        <Notice notice={{ kind: 'error', text: health.message }} />
      ) : null}
      <nav aria-label="날짜 이동" className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon">
          <Link to={pathOf(shiftDate(date, -1))} aria-label="이전 날">
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <Input
          type="date"
          aria-label="날짜 선택"
          className="w-auto"
          min={earliestDate}
          value={draft ?? date}
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            const value = event.target.value;
            if (isValidDate(value) && value >= earliestDate) {
              setDraft(null);
              void navigate(pathOf(value));
            } else {
              setDraft(value);
            }
          }}
        />
        <Button asChild variant="outline" size="icon">
          <Link to={pathOf(shiftDate(date, 1))} aria-label="다음 날">
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        {today && today !== date ? (
          <Button asChild variant="outline">
            <Link to={pathOf(today)}>오늘</Link>
          </Button>
        ) : null}
      </nav>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle asHeading="h2">{title}</CardTitle>
              <CardDescription>아직 기록 기능이 없습니다.</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
