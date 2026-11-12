import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { BusyButton } from './busy-button';
import {
  answerText,
  charCount,
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
import { trackWrite, writesSettled } from './pending-writes';

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
  const { notice, error, clear } = useNotice();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The save button stays pressable while saving (#126), and Enter in a field submits too.
    if (saving) return;
    const memo = form.memo.trim() || null;
    if (form.dietKept === null && form.sleepGood === null && memo === null) {
      error('Enter at least one check or a note');
      return;
    }
    if (memo && charCount(memo) > maxMemo) {
      error(`The note must be ${maxMemo} characters or fewer`);
      return;
    }
    // A repeated failure then appears anew and is announced again (as in #98).
    clear();
    setSaving(true);
    try {
      onSaved(
        await trackWrite(
          pathOf(date),
          requestJson<CheckDay>(pathOf(date), {
            method: 'PUT',
            body: { dietKept: form.dietKept, sleepGood: form.sleepGood, memo },
          }),
        ),
      );
    } catch (cause) {
      // Moving to another day removes this form, and the check still was not saved.
      if (!mounted.current) {
        toast.error(`Could not save the daily check for ${date}: ${errorText(cause)}`);
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
        <Label htmlFor="check-memo">Note</Label>
        <Input
          id="check-memo"
          autoComplete="off"
          // No maxLength: it counts UTF-16 units and would stop at 100 emoji, half of what is allowed.
          aria-describedby="check-memo-hint"
          // Read-only, not disabled: a disabled field drops the focus of someone who pressed Enter in it.
          readOnly={saving}
          value={form.memo}
          onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
        />
        <p id="check-memo-hint" className="text-caption text-muted-foreground">
          Up to {maxMemo} characters.
        </p>
      </div>
      <Notice notice={notice} />
      <div className="flex flex-wrap gap-2">
        <BusyButton type="submit" busy={saving} aria-busy={saving || undefined}>
          {saving ? <Spinner size="sm" label="Saving" /> : null}
          Save
        </BusyButton>
        {onCancel ? (
          <BusyButton type="button" variant="outline" busy={saving} onClick={onCancel}>
            Cancel
          </BusyButton>
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
            <dt className="text-muted-foreground">Note</dt>
            <dd className="break-words">{record.memo}</dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <ConfirmDialog
          title="Delete this daily check?"
          description="This cannot be undone."
          onConfirm={onDelete}
          trigger={
            <Button variant="outline" size="sm">
              Delete
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
      <p className="break-keep">Diet: {rateText(summary.diet, 'Kept')}</p>
      <p className="break-keep">Sleep: {rateText(summary.sleep, 'Slept well')}</p>
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
      // A save from before leaving this day may still be on its way; read after it lands.
      await writesSettled(pathOf(date));
      // Left again while waiting: nothing would show the answer.
      if (!live.current) return;
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
      await trackWrite(pathOf(date), requestJson(pathOf(date), { method: 'DELETE' }));
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
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
          <CardTitle asHeading="h2">Daily check</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && day === undefined ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void load();
              // Trying again removes this button, which would drop keyboard focus to the page.
              setMoveFocus((count) => count + 1);
            }}
          >
            Try again
          </Button>
        ) : null}
        {!notice && day === undefined ? (
          <div role="status" aria-busy="true" aria-label="Loading daily check">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day && (record === null || editing) ? (
          <CheckForm
            date={date}
            record={record ?? null}
            onSaved={(saved) => {
              toast.success('Saved');
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
            <PeriodRates title="This week" summary={day.week} />
            <PeriodRates title="This month" summary={day.month} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
