import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  answerText,
  type CheckDay,
  type CheckSummary,
  type DayCheck,
  questions,
  rateText,
  unchecked,
} from './check-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { spanText } from './habit-text';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';

const pathOf = (date: string) => `/api/checks/${date}`;
const maxMemo = 200;

type Form = { dietKept: boolean | null; sleepGood: boolean | null; memo: string };

function CheckForm({
  date,
  record,
  onSaved,
  onCancel,
}: {
  date: string;
  record: DayCheck | null;
  onSaved: (day: CheckDay) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Form>(() => ({
    dietKept: record?.dietKept ?? null,
    sleepGood: record?.sleepGood ?? null,
    memo: record?.memo ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const { notice, error } = useNotice();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const memo = form.memo.trim() || null;
    if (form.dietKept === null && form.sleepGood === null && memo === null) {
      error('체크나 메모 중 하나 이상 입력해 주세요');
      return;
    }
    if (memo && memo.length > maxMemo) {
      error(`메모는 ${maxMemo}자 이하로 입력해 주세요`);
      return;
    }
    setSaving(true);
    try {
      onSaved(
        await requestJson<CheckDay>(pathOf(date), {
          method: 'PUT',
          body: { dietKept: form.dietKept, sleepGood: form.sleepGood, memo },
        }),
      );
    } catch (cause) {
      // Moving to another day removes this form, and the check still was not saved.
      if (!mounted.current) {
        toast.error(`${date} 하루 체크를 저장하지 못했습니다: ${errorText(cause)}`);
        return;
      }
      error(cause);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {questions.map(({ key, question, yes, no }) => (
        <div key={key} className="flex flex-col gap-2">
          <p id={`check-${key}`} className="text-body-sm font-medium">
            {question}
          </p>
          <div role="group" aria-labelledby={`check-${key}`} className="flex flex-wrap gap-2">
            {[
              { value: null, label: unchecked },
              { value: true, label: yes },
              { value: false, label: no },
            ].map(({ value, label }) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={form[key] === value ? 'default' : 'outline'}
                aria-pressed={form[key] === value}
                // A change after Save would not be in the save already on its way.
                disabled={saving}
                onClick={() => setForm((current) => ({ ...current, [key]: value }))}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Label htmlFor="check-memo">메모</Label>
        <Input
          id="check-memo"
          autoComplete="off"
          maxLength={maxMemo}
          aria-describedby="check-memo-hint"
          disabled={saving}
          value={form.memo}
          onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
        />
        <p id="check-memo-hint" className="text-caption text-muted-foreground">
          {maxMemo}자까지 쓸 수 있습니다.
        </p>
      </div>
      <Notice notice={notice} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
          {saving ? <Spinner size="sm" label="저장하는 중" /> : null}
          저장
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            취소
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CheckView({
  record,
  onEdit,
  onDelete,
}: {
  record: DayCheck;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 text-body-sm sm:grid-cols-2">
        {questions.map(({ key, title, yes, no }) => (
          <div key={key}>
            <dt className="text-muted-foreground">{title}</dt>
            <dd>{answerText(record[key], yes, no)}</dd>
          </div>
        ))}
        {record.memo ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">메모</dt>
            <dd className="break-words">{record.memo}</dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          수정
        </Button>
        <ConfirmDialog
          title="하루 체크를 삭제할까요?"
          description="삭제하면 되돌릴 수 없습니다."
          onConfirm={onDelete}
          trigger={
            <Button variant="outline" size="sm">
              삭제
            </Button>
          }
        />
      </div>
    </div>
  );
}

function PeriodRates({ title, summary }: { title: string; summary: CheckSummary }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1 text-body-sm">
      <p className="font-medium">
        {title} <span className="font-normal text-muted-foreground">{spanText(summary)}</span>
      </p>
      <p className="break-keep">식단: {rateText(summary.diet, '지킴')}</p>
      <p className="break-keep">수면: {rateText(summary.sleep, '잘 잠')}</p>
    </section>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function ChecksCard({ date }: { date: string }) {
  const [day, setDay] = useState<CheckDay | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const { notice, error, clear } = useNotice();
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    clear();
    try {
      const data = await requestJson<CheckDay>(pathOf(date));
      if (live.current) setDay(data);
    } catch (cause) {
      if (live.current) error(cause);
    }
  }, [clear, date, error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  // The button that was pressed is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const finish = (next: CheckDay) => {
    setDay(next);
    setEditing(false);
    setMoveFocus((count) => count + 1);
  };

  const remove = async () => {
    try {
      await requestJson(pathOf(date), { method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('삭제했습니다');
    setEditing(false);
    setMoveFocus((count) => count + 1);
    // The rates changed too; until they arrive the old ones would be wrong.
    setDay(undefined);
    void load();
  };

  const record = day?.record;

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">하루 체크</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && day === undefined ? (
          <Button variant="outline" className="self-start" onClick={() => void load()}>
            다시 시도
          </Button>
        ) : null}
        {!notice && day === undefined ? (
          <div role="status" aria-busy="true" aria-label="하루 체크 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day && (record === null || editing) ? (
          <CheckForm
            date={date}
            record={record ?? null}
            onSaved={(saved) => {
              toast.success('저장했습니다');
              finish(saved);
            }}
            onCancel={record ? () => finish(day) : undefined}
          />
        ) : null}
        {record && !editing ? (
          <CheckView
            record={record}
            onEdit={() => {
              setEditing(true);
              setMoveFocus((count) => count + 1);
            }}
            onDelete={remove}
          />
        ) : null}
        {day ? (
          <div className="flex flex-col gap-3 border-t pt-4">
            <PeriodRates title="이 주" summary={day.week} />
            <PeriodRates title="이 달" summary={day.month} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
