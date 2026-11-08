import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { formatDate } from './daily-date';
import { RequestError, requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { medicationsPath } from './med-text';
import { trackWrite, writesSettled } from './pending-writes';
import {
  type Reminder,
  reminderDetail,
  reminderKey,
  reminderPage,
  type Reminders,
  remindersPath,
  reminderTitle,
  whenText,
} from './reminder-text';
import { visitsPath } from './visit-text';

/**
 * Clinic appointments and medicine end days coming up within the lead time (#48), shown on the
 * dashboard and on today's daily page. Whoever shows it gives it a key per service day, so a page
 * left open past midnight loads the new day's list.
 */
export function RemindersCard() {
  const [data, setData] = useState<Reminders | undefined>(undefined);
  const [marking, setMarking] = useState<string | null>(null);
  const { notice, status, error, clear } = useNotice();
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      // A day changed on the clinic or medicine page may still be on its way (#71).
      await Promise.all([
        writesSettled(`${visitsPath}/`),
        writesSettled(`${medicationsPath}/`),
        writesSettled(`${remindersPath}/`),
      ]);
      if (!live.current) return;
      const next = await requestJson<Reminders>(remindersPath);
      if (live.current) setData(next);
    } catch (cause) {
      if (live.current) error(cause);
    }
  }, [error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  // The pressed button is gone by now.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const markDone = async (item: Reminder) => {
    if (marking) return;
    const key = reminderKey(item);
    // Cleared first, so the same failure twice is announced again.
    clear();
    setMarking(key);
    try {
      await trackWrite(
        `${remindersPath}/done`,
        requestJson<void>(`${remindersPath}/done`, {
          method: 'POST',
          body: { kind: item.kind, id: item.id, dueOn: item.dueOn },
        }),
      );
      if (!live.current) return;
      setData(
        (current) =>
          current && {
            ...current,
            reminders: current.reminders.filter((other) => reminderKey(other) !== key),
          },
      );
      status(`${reminderTitle(item)} 알림을 완료로 표시했습니다.`);
      setMoveFocus((count) => count + 1);
    } catch (cause) {
      if (!live.current) return;
      error(cause);
      // Moved to another day or deleted on another screen: the list on screen is out of date.
      if (cause instanceof RequestError && cause.status === 404) {
        void load();
        setMoveFocus((count) => count + 1);
      }
    } finally {
      if (live.current) setMarking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">다가오는 일정</CardTitle>
        </div>
        {data ? (
          <CardDescription>
            병원 예약과 약 복용 종료를 {data.leadDays}일 전부터 알려 줍니다(
            {formatDate(data.until)}까지).
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice?.kind === 'error' && data === undefined ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              clear();
              void load();
              // Trying again removes this button, which would drop keyboard focus to the page (#65).
              setMoveFocus((count) => count + 1);
            }}
          >
            다시 시도
          </Button>
        ) : null}
        {!notice && data === undefined ? (
          <div role="status" aria-busy="true" aria-label="다가오는 일정 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {data?.reminders.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            {data.leadDays}일 안에 다가오는 병원 예약이나 약 복용 종료가 없습니다.
          </p>
        ) : null}
        {data?.reminders.length ? (
          <ul aria-label="다가오는 일정" className="flex flex-col gap-3">
            {data.reminders.map((item) => {
              const key = reminderKey(item);
              const title = reminderTitle(item);
              const detail = reminderDetail(item);
              const page = reminderPage(item);
              const busy = marking === key;
              return (
                <li
                  key={key}
                  className="flex flex-col gap-2 rounded-lg border p-3 text-body-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          item.daysLeft === 0
                            ? 'rounded-md bg-primary px-2 py-0.5 text-caption font-medium text-primary-foreground'
                            : 'rounded-md bg-muted px-2 py-0.5 text-caption font-medium'
                        }
                      >
                        {whenText(item.daysLeft)}
                      </span>
                      <span className="text-muted-foreground">{formatDate(item.dueOn)}</span>
                    </span>
                    <span className="font-medium wrap-anywhere">{title}</span>
                    {detail ? (
                      <span className="wrap-anywhere text-muted-foreground">{detail}</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={page.to}>{page.label}</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${title} 완료`}
                      // aria-disabled, not disabled: a disabled button drops keyboard focus (#98).
                      aria-disabled={marking !== null || undefined}
                      aria-busy={busy || undefined}
                      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                      onClick={() => void markDone(item)}
                    >
                      <Check aria-hidden />
                      {busy ? '처리 중…' : '완료'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
