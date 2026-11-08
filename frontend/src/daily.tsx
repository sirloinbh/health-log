import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { BodyCard } from './body';
import { ChecksCard } from './checks';
import { Button } from './components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import {
  dailyRangeText,
  earliestDate,
  formatDate,
  inDailyRange,
  isValidDate,
  latestDate,
  shiftDate,
} from './daily-date';
import { GoalsCard } from './goals';
import { HabitsCard } from './habits';
import { type Health, healthText } from './health';
import { MealCard } from './meals';
import { SleepCard } from './sleep';

// Each feature replaces its placeholder here as its issue lands.
const sections = ['병원·약'];

// Typing a year passes through values like 0002-10-31: they stay out of range and change nothing,
// and only a year of four digits is worth a word about the range.
const typedYear = (value: string) => value >= '1000';

/**
 * The previous or next day. At an end of the range it stays the same link, marked disabled and
 * pointing at the day shown, so keyboard focus survives the last step there and the reason can
 * still be read. A different element in its place would drop focus to the page.
 */
function DayLink({
  label,
  to,
  here,
  icon,
}: {
  label: string;
  to: string | null;
  here: string;
  icon: ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="icon">
      <Link
        to={to ?? here}
        aria-label={label}
        aria-disabled={to ? undefined : true}
        aria-description={to ? undefined : dailyRangeText}
        title={to ? undefined : dailyRangeText}
        // Not pointer-events-none: that would also hide the title that says why.
        className={to ? undefined : 'cursor-default opacity-50 hover:bg-background'}
        onClick={to ? undefined : (event) => event.preventDefault()}
      >
        {icon}
      </Link>
    </Button>
  );
}

function DailyHeader({ description }: { description?: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 id="page-title">하루 기록</h1>
      {description ? (
        <p aria-live="polite" className="text-body text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}

// "Today" comes from the server, which counts it in the service time zone.
// The server's today is always within the daily range until 2100, when latestDate needs moving.
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
  // The field keeps what was typed until blur: writing a value back while typing makes the browser
  // restart the part being typed, so "12" as a month would become 02.
  const [draft, setDraft] = useState<string | null>(null);
  // Whether the field was left holding a date out of range; typing again drops the word.
  const [leftOutOfRange, setLeftOutOfRange] = useState(false);
  // The page stays mounted from day to day, so a word left for one day must not come back on it.
  const [noticeDate, setNoticeDate] = useState(date);
  if (noticeDate !== date) {
    setNoticeDate(date);
    setLeftOutOfRange(false);
  }
  // Each typed digit can form a valid date; one edit of the field leaves one history entry.
  const editing = useRef(false);

  // Back and forward do not blur the field, so they have to end the edit themselves.
  useEffect(() => {
    const endEdit = () => {
      editing.current = false;
      setDraft(null);
    };
    window.addEventListener('popstate', endEdit);
    return () => window.removeEventListener('popstate', endEdit);
  }, []);

  if (!isValidDate(date) || !inDailyRange(date)) {
    return (
      <section aria-labelledby="page-title" className="flex flex-col gap-6">
        <DailyHeader />
        <Notice
          notice={{
            kind: 'error',
            text: isValidDate(date) ? `${dailyRangeText}: ${date}` : `없는 날짜입니다: ${date}`,
          }}
        />
        <Button asChild variant="outline" className="self-start">
          <Link to={basePath}>오늘 기록으로 이동</Link>
        </Button>
      </section>
    );
  }

  const today = health.state === 'ok' ? health.today : null;
  const outOfRange =
    (draft !== null && isValidDate(draft) && typedYear(draft) && !inDailyRange(draft)) ||
    leftOutOfRange;
  const pathOf = (value: string) => `${basePath}/${value}`;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <DailyHeader description={formatDate(date)} />
      {health.state === 'error' ? (
        <Notice notice={{ kind: 'error', text: health.message }} />
      ) : null}
      <nav aria-label="날짜 이동" className="flex flex-wrap items-center gap-2">
        <DayLink
          label="이전 날"
          to={date > earliestDate ? pathOf(shiftDate(date, -1)) : null}
          here={pathOf(date)}
          icon={<ChevronLeft aria-hidden />}
        />
        <Input
          type="date"
          aria-label="날짜 선택"
          className="w-auto"
          min={earliestDate}
          max={latestDate}
          value={draft ?? date}
          onBlur={() => {
            // Chrome stops taking year digits at the field's max, so typing 2100 can end as 0210;
            // leaving the field with a date out of range still gets the word about the range.
            if (draft !== null && isValidDate(draft) && !inDailyRange(draft))
              setLeftOutOfRange(true);
            editing.current = false;
            setDraft(null);
          }}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            setLeftOutOfRange(false);
            if (isValidDate(value) && inDailyRange(value) && value !== date) {
              void navigate(pathOf(value), { replace: editing.current });
              editing.current = true;
            }
          }}
        />
        <DayLink
          label="다음 날"
          to={date < latestDate ? pathOf(shiftDate(date, 1)) : null}
          here={pathOf(date)}
          icon={<ChevronRight aria-hidden />}
        />
        {today && today !== date ? (
          <Button asChild variant="outline">
            <Link to={pathOf(today)}>오늘</Link>
          </Button>
        ) : null}
      </nav>
      {/* Always in the page: a live region added along with its text may not be read out. */}
      <p aria-live="polite" className="text-body-sm text-destructive empty:hidden">
        {outOfRange ? dailyRangeText : null}
      </p>
      {/* An explicit column: an implicit one grows with its content, past the edge of a phone. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SleepCard key={date} date={date} />
        <MealCard key={`meal-${date}`} date={date} />
        <BodyCard key={`body-${date}`} date={date} />
        <HabitsCard key={`habits-${date}`} date={date} />
        <ChecksCard key={`checks-${date}`} date={date} />
        <GoalsCard key={`goals-${date}`} date={date} />
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
