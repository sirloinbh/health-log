import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { BusyButton } from './busy-button';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { trackWrite, writesSettled } from './pending-writes';
import {
  clockOf,
  dayOf,
  formatMinutes,
  isOvernight,
  minutesBetween,
  toInstants,
} from './sleep-time';

type SleepRecord = {
  date: string;
  bedAt: string;
  wakeAt: string;
  durationMinutes: number;
  source: 'manual' | 'garmin';
};

const sourceLabels = { manual: 'Manual', garmin: 'Garmin' } as const;

const pathOf = (date: string) => `/api/sleep/${date}`;

function SleepForm({
  date,
  record,
  onSaved,
  onCancel,
}: {
  date: string;
  record: SleepRecord | null;
  onSaved: (record: SleepRecord) => void;
  onCancel?: () => void;
}) {
  const [bed, setBed] = useState(record ? clockOf(record.bedAt) : '');
  const [wake, setWake] = useState(record ? clockOf(record.wakeAt) : '');
  const [saving, setSaving] = useState(false);
  const { notice, error, clear } = useNotice();
  const length = bed && wake ? minutesBetween(bed, wake) : 0;
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
    if (!bed || !wake) {
      error('Enter a bedtime and a wake-up time');
      return;
    }
    // Nothing to save: a PUT would still turn an imported record into a manual one.
    if (record && bed === clockOf(record.bedAt) && wake === clockOf(record.wakeAt)) {
      onCancel?.();
      return;
    }
    // A repeated failure then appears anew and is announced again (as in #98).
    clear();
    setSaving(true);
    try {
      onSaved(
        await trackWrite(
          pathOf(date),
          requestJson<SleepRecord>(pathOf(date), {
            method: 'PUT',
            body: toInstants(date, bed, wake),
          }),
        ),
      );
    } catch (cause) {
      // Moving to another day removes this form, and the night still was not saved.
      if (!mounted.current) {
        toast.error(`Could not save the sleep record for ${date}: ${errorText(cause)}`);
        return;
      }
      error(cause);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sleep-bed">Bedtime</Label>
          <Input
            id="sleep-bed"
            type="time"
            value={bed}
            onChange={(event) => setBed(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sleep-wake">Wake-up time</Label>
          <Input
            id="sleep-wake"
            type="time"
            value={wake}
            onChange={(event) => setWake(event.target.value)}
          />
        </div>
      </div>
      {/* Stays mounted: a live region announces changes only if it was already there. */}
      <p aria-live="polite" className="min-h-5 text-body-sm text-muted-foreground">
        {length > 0
          ? `Asleep at ${bed} ${isOvernight(bed, wake) ? 'the day before' : 'this day'} for ${formatMinutes(length)}`
          : null}
      </p>
      {record?.source === 'garmin' ? (
        <p className="text-body-sm text-muted-foreground">
          Saving with changed times erases the sleep stages and score imported from Garmin.
        </p>
      ) : null}
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

function SleepSummary({
  record,
  onEdit,
  onDelete,
}: {
  record: SleepRecord;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const before = dayOf(record.bedAt) === record.date ? '' : 'Day before ';
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-semibold">{formatMinutes(record.durationMinutes)}</p>
      <dl className="grid grid-cols-2 gap-4 text-body-sm">
        <div>
          <dt className="text-muted-foreground">Bedtime</dt>
          <dd>
            {before}
            {clockOf(record.bedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Wake-up</dt>
          <dd>{clockOf(record.wakeAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{sourceLabels[record.source]}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <ConfirmDialog
            title="Delete this sleep record?"
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
    </div>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function SleepCard({ date }: { date: string }) {
  const [record, setRecord] = useState<SleepRecord | null | undefined>(undefined);
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
      const data = await requestJson<{ record: SleepRecord | null }>(pathOf(date));
      if (live.current) setRecord(data.record);
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

  const finish = (next: SleepRecord | null) => {
    setRecord(next);
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
    finish(null);
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">Sleep</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && record === undefined ? (
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
        {!notice && record === undefined ? (
          <div role="status" aria-busy="true" aria-label="Loading sleep record">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {record === null || (record && editing) ? (
          <SleepForm
            date={date}
            record={record}
            onSaved={(saved) => {
              toast.success('Saved');
              finish(saved);
            }}
            onCancel={record ? () => finish(record) : undefined}
          />
        ) : null}
        {record && !editing ? (
          <SleepSummary
            record={record}
            onEdit={() => {
              setEditing(true);
              setMoveFocus((count) => count + 1);
            }}
            onDelete={remove}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
