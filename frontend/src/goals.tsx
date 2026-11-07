import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { answerText, questions } from './check-text';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { isValidDate } from './daily-date';
import {
  actualText,
  changeText,
  type Goal,
  type GoalDay,
  type GoalDayItem,
  goalFields,
  type GoalItem,
  goalItems,
  type Goals,
  goalSettingsPath,
  type Status,
  statusText,
  targetText,
  toTarget,
  toTyped,
  unknownReason,
} from './goal-text';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { parseAmount, unreadableAmount } from './number-input';

const goalsPath = '/api/goals';
const earliestDate = '2000-01-01';
const latestDate = '9999-12-31';

const badgeVariant = {
  met: 'success',
  missed: 'warning',
  unknown: 'secondary',
  none: 'outline',
} as const satisfies Record<Status, string>;

function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={badgeVariant[status]}>{statusText[status]}</Badge>;
}

const sinceText = (from: string) => `${from}부터`;

function GoalForm({
  item,
  goal,
  today,
  onSaved,
}: {
  item: GoalItem;
  goal: Goal;
  today: string;
  onSaved: (goals: Goals) => void;
}) {
  const field = goalFields[item];
  const [value, setValue] = useState(() => (goal ? toTyped(item, goal.target) : ''));
  const [from, setFrom] = useState(today);
  const [saving, setSaving] = useState(false);
  const { notice, error } = useNotice();
  const id = `goal-${item}`;

  const save = async (target: number | null) => {
    if (!isValidDate(from) || from < earliestDate) {
      error('적용 시작일을 골라 주세요');
      return;
    }
    setSaving(true);
    try {
      const goals = await requestJson<Goals>(`${goalsPath}/${item}`, {
        method: 'PUT',
        body: { from, target },
      });
      toast.success(target === null ? '목표를 껐습니다' : '목표를 저장했습니다');
      onSaved(goals);
    } catch (cause) {
      error(cause);
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = parseAmount(value);
    if (typed === null) {
      error(`${field.label}을(를) 입력해 주세요`);
      return;
    }
    if (typed === undefined) {
      error(unreadableAmount(field.label));
      return;
    }
    const target = toTarget(item, typed);
    if (typeof target === 'string') {
      error(target);
      return;
    }
    void save(target);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-target`}>
            {field.label} ({field.unit})
          </Label>
          <Input
            id={`${id}-target`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={`예: ${field.example}`}
            readOnly={saving}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-from`}>적용 시작일</Label>
          <Input
            id={`${id}-from`}
            type="date"
            min={earliestDate}
            max={latestDate}
            readOnly={saving}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        시작일 전 날짜는 그때의 목표로 판정합니다.
      </p>
      <Notice notice={notice} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
          {saving ? <Spinner size="sm" label="저장하는 중" /> : null}
          저장
        </Button>
        {goal ? (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save(null)}>
            시작일부터 목표 끄기
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function GoalHistory({
  item,
  goals,
  onRemoved,
}: {
  item: GoalItem;
  goals: Goals;
  onRemoved: () => void;
}) {
  const changes = goals.history.filter((change) => change.item === item);
  if (changes.length === 0) return null;

  const remove = async (from: string) => {
    try {
      await requestJson(`${goalsPath}/${item}/${from}`, { method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as removed; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('변경 기록을 삭제했습니다');
    onRemoved();
  };

  return (
    <section
      aria-label={`${goalFields[item].title} 목표 변경 기록`}
      className="flex flex-col gap-2"
    >
      <p className="text-body-sm font-medium">변경 기록</p>
      <ul className="flex flex-col gap-2 text-body-sm">
        {changes.map((change) => (
          <li key={change.from} className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-keep">
              {sinceText(change.from)} {changeText(item, change.target)}
              {change.from > goals.today ? (
                <span className="text-muted-foreground"> (예정)</span>
              ) : null}
            </span>
            <ConfirmDialog
              title="이 변경을 삭제할까요?"
              description="삭제하면 그 날짜부터 바로 앞의 목표로 판정합니다."
              onConfirm={() => remove(change.from)}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${change.from} ${goalFields[item].title} 목표 변경 삭제`}
                >
                  삭제
                </Button>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GoalsSettings() {
  const [goals, setGoals] = useState<Goals | undefined>(undefined);
  const { notice, error, clear } = useNotice();
  const live = useRef(true);

  const load = useCallback(async () => {
    clear();
    try {
      const data = await requestJson<Goals>(goalsPath);
      if (live.current) setGoals(data);
    } catch (cause) {
      if (live.current) error(cause);
    }
  }, [clear, error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  return (
    <section aria-labelledby="goals-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="goals-title">목표</h2>
        <p className="text-body-sm text-muted-foreground">
          하루 기록에서 목표를 지켰는지 자동으로 판정합니다. 목표를 바꿔도 지난 날짜는 그때의 목표로
          판정합니다.
        </p>
      </div>
      <Notice notice={notice} />
      {notice && goals === undefined ? (
        <Button variant="outline" className="self-start" onClick={() => void load()}>
          다시 시도
        </Button>
      ) : null}
      {!notice && goals === undefined ? (
        <div role="status" aria-busy="true" aria-label="목표 불러오는 중">
          <SkeletonText lines={3} />
        </div>
      ) : null}
      {goals ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {goalItems.map((item) => {
            const goal = goals.current[item];
            return (
              <Card key={item}>
                <CardHeader>
                  <CardTitle asHeading="h3">{goalFields[item].title}</CardTitle>
                  <CardDescription>
                    {goal
                      ? `지금 목표: ${targetText(item, goal.target)} (${sinceText(goal.from)})`
                      : '지금 목표 없음'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* A new key per answer refills the form from what was saved. */}
                  <GoalForm
                    key={`${goal?.from}-${goal?.target}`}
                    item={item}
                    goal={goal}
                    today={goals.today}
                    onSaved={setGoals}
                  />
                  <GoalHistory item={item} goals={goals} onRemoved={() => void load()} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

const groups: { title: string; items: GoalItem[]; check?: (typeof questions)[number] }[] = [
  { title: '식단', items: ['calories', 'protein'], check: questions[0] },
  { title: '수면', items: ['sleep'], check: questions[1] },
  { title: '금주', items: ['sober_days'] },
];

function Verdict({ day }: { day: GoalDayItem }) {
  const { title } = goalFields[day.item];
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        {day.goal && day.status ? (
          <StatusBadge status={day.status} />
        ) : (
          <span className="text-muted-foreground">목표 없음</span>
        )}
      </div>
      <p className="break-keep text-muted-foreground">
        {actualText(day)}
        {day.goal ? ` · 목표 ${targetText(day.item, day.goal.target)}` : null}
      </p>
      {day.status === 'unknown' ? (
        <p className="text-caption text-muted-foreground">{unknownReason(day.item)}</p>
      ) : null}
    </li>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function GoalsCard({ date }: { date: string }) {
  const [day, setDay] = useState<GoalDay | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { notice, error, clear } = useNotice();
  const live = useRef(true);

  const load = useCallback(async () => {
    clear();
    setLoading(true);
    try {
      const data = await requestJson<GoalDay>(`${goalsPath}/days/${date}`);
      if (live.current) setDay(data);
    } catch (cause) {
      if (live.current) error(cause);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [clear, date, error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const byItem = new Map(day?.items.map((entry) => [entry.item, entry]));
  const noGoal = day ? day.items.every((entry) => entry.goal === null) : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">목표 달성</CardTitle>
        <CardDescription>
          자동 판정은 정한 목표로, 직접 체크는 하루 체크에서 고른 답입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {day === undefined && !notice ? (
          <div role="status" aria-busy="true" aria-label="목표 달성 불러오는 중">
            <SkeletonText lines={3} />
          </div>
        ) : null}
        {day ? (
          <>
            {noGoal ? (
              <p className="text-body-sm text-muted-foreground">
                아직 정한 목표가 없습니다.{' '}
                <Link to={goalSettingsPath} className="underline underline-offset-4">
                  설정에서 목표 정하기
                </Link>
              </p>
            ) : null}
            {groups.map((group) => (
              <section
                key={group.title}
                aria-label={group.title}
                className="flex flex-col gap-2 border-t pt-3 text-body-sm first-of-type:border-t-0 first-of-type:pt-0"
              >
                <ul className="flex flex-col gap-3">
                  {group.items.map((item) => {
                    const entry = byItem.get(item);
                    return entry ? <Verdict key={item} day={entry} /> : null;
                  })}
                </ul>
                {group.check ? (
                  <p className="break-keep">
                    <span className="text-muted-foreground">직접 체크: </span>
                    {answerText(
                      day.checks?.[group.check.key] ?? null,
                      group.check.yes,
                      group.check.no,
                    )}
                  </p>
                ) : null}
              </section>
            ))}
          </>
        ) : null}
        {/* Saves in the other cards do not reach this one, so it can be asked again. */}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={loading}
          aria-busy={loading || undefined}
          onClick={() => void load()}
        >
          {loading && day ? <Spinner size="sm" label="다시 판정하는 중" /> : null}
          {day === undefined && notice ? '다시 시도' : '다시 판정'}
        </Button>
      </CardContent>
    </Card>
  );
}
