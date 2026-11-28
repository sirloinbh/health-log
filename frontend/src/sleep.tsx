import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { BusyButton } from './components/busy-button/busy-button';
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
import { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import {
  clockOf,
  dayOf,
  formatMinutes,
  isOvernight,
  minutesBetween,
  toInstants,
} from './sleep-time';
import { asRequest, putAnswer, useReadAfterWrites } from './writes';

type SleepRecord = {
  date: string;
  bedAt: string;
  wakeAt: string;
  durationMinutes: number;
  source: 'manual' | 'garmin';
};

const sourceLabels = { manual: 'Manual', garmin: 'Garmin' } as const;

type SleepDay = { record: SleepRecord | null };

const pathOf = (date: string) => `/api/sleep/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

/** A write to one day's sleep. Its answer goes into that day's cached record, even after the card is gone. */
function useSleepWrite(date: string, recordAfter: (data: unknown) => SleepRecord | null) {
  const client = useQueryClient();
  return useApiMutation<unknown, ApiRequest>(asRequest, {
    onSuccess: (data) => putAnswer<SleepDay>(client, keyOf(date), { record: recordAfter(data) }),
  });
}

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
  const save = useSleepWrite(date, (data) => data as SleepRecord);
  const saving = save.isPending;
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
    try {
      const saved = await save.mutateAsync({
        path: pathOf(date),
        method: 'PUT',
        body: toInstants(date, bed, wake),
      });
      onSaved(saved as SleepRecord);
    } catch (cause) {
      // Moving to another day removes this form, and the night still was not saved.
      if (!mounted.current) {
        toast.error(`Could not save the sleep record for ${date}: ${errorText(cause)}`);
        return;
      }
      error(cause);
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
  const [editing, setEditing] = useState(false);
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const remover = useSleepWrite(date, () => null);
  // A save from before leaving this day may still be on its way; read after it lands.
  const ready = useReadAfterWrites(pathOf(date));
  const query = useApiQuery<SleepDay>(keyOf(date), pathOf(date), { enabled: ready });
  const record = ready ? query.data?.record : undefined;
  // A failed read with nothing to show; a failed refresh keeps the record on screen.
  const notice: NoticeValue | undefined =
    query.isError && record === undefined
      ? { kind: 'error', text: errorText(query.error) }
      : undefined;
  // One read at a time: pressing again while it is on its way does not start another.
  const load = () => void query.refetch({ cancelRefetch: false });

  // The button that was pressed is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const finish = () => {
    setEditing(false);
    setMoveFocus((count) => count + 1);
  };

  const remove = async () => {
    try {
      await remover.mutateAsync({ path: pathOf(date), method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
      putAnswer<SleepDay>(client, keyOf(date), { record: null });
    }
    toast.success('Deleted');
    finish();
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
              load();
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
            onSaved={() => {
              toast.success('Saved');
              finish();
            }}
            onCancel={record ? finish : undefined}
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
