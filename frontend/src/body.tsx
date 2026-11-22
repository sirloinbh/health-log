import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  type BodyRecord,
  changeOver,
  changeWindows,
  formatChange,
  formatSpan,
} from './body-change';
import { BusyButton } from './busy-button';
import { charCount } from './check-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { shiftDate } from './daily-date';
import { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';
import { trackWrite } from './pending-writes';
import { asRequest, useReadAfterWrites } from './writes';

const pathOf = (date: string) => `/api/body/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));
// Every trend read starts with this key, whatever its window.
const historyKey = apiKey('/api/body');

type BodyDay = { record: BodyRecord | null };

/**
 * Reads every trend again after a write. A trend read still on its way may have left before the write landed, and
 * React Query would join it instead of starting a new one, so it is cancelled first: the answer that includes the
 * write is the one that stays. Not awaited by the write, so a save does not wait for the trend.
 */
const refreshHistory = (client: QueryClient) =>
  void client
    .cancelQueries({ queryKey: historyKey })
    .then(() => client.invalidateQueries({ queryKey: historyKey }));

/**
 * A write to one day's body record. Its answer goes into that day's cached record, and every trend is read again,
 * even after the card is gone.
 */
function useBodyWrite(date: string, recordAfter: (data: unknown) => BodyRecord | null) {
  const client = useQueryClient();
  return useApiMutation<unknown, ApiRequest>(asRequest, {
    onSuccess: (data) => {
      client.setQueryData<BodyDay>(keyOf(date), { record: recordAfter(data) });
      refreshHistory(client);
    },
  });
}

// `name`, `min` and `max` follow the server's checks in `backend/src/body.ts`, so its messages
// appear before anything is sent (#205). Measures are above 0 with up to 2 decimals; blood
// pressure is a whole number from `min`.
const numberFields = [
  { key: 'weightKg', id: 'body-weight', label: 'Weight (kg)', name: 'Weight', max: 500 },
  { key: 'bodyFatPercent', id: 'body-fat', label: 'Body fat (%)', name: 'Body fat', max: 100 },
  { key: 'waistCm', id: 'body-waist', label: 'Waist (cm)', name: 'Waist', max: 300 },
  {
    key: 'systolicMmhg',
    id: 'body-systolic',
    label: 'Systolic blood pressure (mmHg)',
    name: 'Systolic blood pressure',
    min: 50,
    max: 300,
  },
  {
    key: 'diastolicMmhg',
    id: 'body-diastolic',
    label: 'Diastolic blood pressure (mmHg)',
    name: 'Diastolic blood pressure',
    min: 20,
    max: 200,
  },
] as const;

const changeRows = [
  { key: 'weightKg', label: 'Weight', unit: 'kg' },
  { key: 'bodyFatPercent', label: 'Body fat', unit: '%' },
  { key: 'waistCm', label: 'Waist', unit: 'cm' },
] as const;

type NumberKey = (typeof numberFields)[number]['key'];
type Form = Record<NumberKey, string> & { memo: string };

const formOf = (record: BodyRecord | null): Form => ({
  weightKg: record?.weightKg?.toString() ?? '',
  bodyFatPercent: record?.bodyFatPercent?.toString() ?? '',
  waistCm: record?.waistCm?.toString() ?? '',
  systolicMmhg: record?.systolicMmhg?.toString() ?? '',
  diastolicMmhg: record?.diastolicMmhg?.toString() ?? '',
  memo: record?.memo ?? '',
});

/** The request body, or the first reason the server would refuse it. */
const readForm = (form: Form) => {
  const values: Partial<Record<NumberKey, number | null>> = {};
  for (const field of numberFields) {
    const value = parseAmount(form[field.key]);
    if (value === undefined) return unreadableAmount(field.label);
    if (value !== null) {
      if ('min' in field) {
        if (!Number.isInteger(value)) return `${field.name} must be a whole number`;
        if (value < field.min) return `${field.name} must be ${field.min} or more`;
      } else if (value <= 0) {
        return `${field.name} must be greater than 0`;
      }
      if (value > field.max) return `${field.name} must be ${field.max} or less`;
      if (!('min' in field) && !hasTwoDecimalsAtMost(value)) {
        return `${field.name} can have at most 2 decimal places`;
      }
    }
    values[field.key] = value;
  }
  const memo = form.memo.trim() || null;
  if (memo !== null && charCount(memo) > 500) return 'The note must be 500 characters or fewer';
  const body = { ...(values as Record<NumberKey, number | null>), memo };
  const { systolicMmhg: systolic, diastolicMmhg: diastolic } = body;
  if ((systolic === null) !== (diastolic === null)) {
    return 'Enter both systolic and diastolic blood pressure';
  }
  if (systolic !== null && diastolic !== null && systolic <= diastolic) {
    return 'Systolic blood pressure must be higher than diastolic';
  }
  if (Object.values(body).every((value) => value === null))
    return 'Enter at least one value to save';
  return body;
};

function BodyForm({
  date,
  record,
  onSaved,
  onCancel,
}: {
  date: string;
  record: BodyRecord | null;
  onSaved: (record: BodyRecord) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => formOf(record));
  const save = useBodyWrite(date, (data) => data as BodyRecord);
  const saving = save.isPending;
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
    const body = readForm(form);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    // A repeated failure then appears anew and is announced again (as in #98).
    clear();
    try {
      // trackWrite until every card reads through React Query (#220).
      const saved = await trackWrite(
        pathOf(date),
        save.mutateAsync({ path: pathOf(date), method: 'PUT', body }),
      );
      onSaved(saved as BodyRecord);
    } catch (cause) {
      // Moving to another day removes this form, and the record still was not saved.
      if (!mounted.current) {
        toast.error(`Could not save the body record for ${date}: ${errorText(cause)}`);
        return;
      }
      error(cause);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {numberFields.map(({ key, id, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              inputMode={key === 'systolicMmhg' || key === 'diastolicMmhg' ? 'numeric' : 'decimal'}
              autoComplete="off"
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="body-memo">Note</Label>
        <Input
          id="body-memo"
          value={form.memo}
          onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
        />
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

function BodySummary({
  record,
  onEdit,
  onDelete,
}: {
  record: BodyRecord;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const shown = [
    { label: 'Weight', value: record.weightKg, unit: 'kg' },
    { label: 'Body fat', value: record.bodyFatPercent, unit: '%' },
    { label: 'Waist', value: record.waistCm, unit: 'cm' },
  ].filter((item) => item.value !== null);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 text-body-sm">
        {shown.map(({ label, value, unit }) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              {value}
              {unit}
            </dd>
          </div>
        ))}
        {/* Both halves, so a row saved before the pair rule never reads "120/nullmmHg". */}
        {record.systolicMmhg !== null && record.diastolicMmhg !== null ? (
          <div>
            <dt className="text-muted-foreground">Blood pressure</dt>
            <dd>
              {record.systolicMmhg}/{record.diastolicMmhg}mmHg
            </dd>
          </div>
        ) : null}
        {record.memo ? (
          <div className="col-span-2">
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
          title="Delete this body record?"
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

function BodyChanges({ date, records }: { date: string; records: BodyRecord[] }) {
  const rows = changeRows.filter(({ key }) => records.some((record) => record[key] !== null));
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <caption className="pb-2 text-left font-medium">Change over time</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-2 font-normal">
              Measurement
            </th>
            {changeWindows.map((days) => (
              <th key={days} scope="col" className="px-2 py-1 font-normal">
                {days} days
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, unit }) => (
            <tr key={key}>
              <th scope="row" className="py-1 pr-2 font-normal">
                {label}
              </th>
              {changeWindows.map((days) => {
                const change = changeOver(records, key, date, days);
                return (
                  <td key={days} className="px-2 py-1 align-top whitespace-nowrap">
                    {change ? (
                      <>
                        {formatChange(change, unit)}
                        {/* Without its dates, one day's change would read as this whole period's. */}
                        <span className="block text-caption text-muted-foreground">
                          {formatSpan(change)}
                        </span>
                      </>
                    ) : (
                      'Not enough records'
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function BodyCard({ date }: { date: string }) {
  const [editing, setEditing] = useState(false);
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const [retryingChanges, setRetryingChanges] = useState(false);
  const client = useQueryClient();
  const remover = useBodyWrite(date, () => null);

  // A save from before leaving this day may still be on its way; read after it lands.
  const ready = useReadAfterWrites(pathOf(date));
  const query = useApiQuery<BodyDay>(keyOf(date), pathOf(date), { enabled: ready });
  const record = ready ? query.data?.record : undefined;
  const notice: NoticeValue | undefined =
    query.isError && record === undefined
      ? { kind: 'error', text: errorText(query.error) }
      : undefined;

  // Kept apart from the record: failing to load the trend must not hide today's form. A save to a day in the window
  // changes the trend; waiting for every body write is simplest.
  const historyReady = useReadAfterWrites(pathOf(''));
  const from = shiftDate(date, 1 - Math.max(...changeWindows));
  const historyQuery = useApiQuery<{ records?: BodyRecord[] }>(
    apiKey('/api/body', from, date),
    `/api/body?from=${from}&to=${date}`,
    { enabled: historyReady },
  );
  const history = (historyReady ? historyQuery.data?.records : undefined) ?? [];
  // Says which part failed: the record above has its own message for the same outage. Hidden while a retry is on
  // its way, so a repeated failure appears anew and is announced again.
  const changesNotice: NoticeValue | undefined =
    historyQuery.isError && !retryingChanges
      ? { kind: 'error', text: 'Could not load the changes over time' }
      : undefined;

  // One read at a time: pressing again while it is on its way does not start another.
  const load = () => {
    void query.refetch({ cancelRefetch: false });
    void historyQuery.refetch({ cancelRefetch: false });
  };

  // The button that was pressed is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const retryChanges = async () => {
    setRetryingChanges(true);
    await historyQuery.refetch({ cancelRefetch: false });
    setRetryingChanges(false);
    // The pressed button was disabled and may be gone, which would drop keyboard focus.
    setMoveFocus((count) => count + 1);
  };

  const finish = () => {
    setEditing(false);
    setMoveFocus((count) => count + 1);
  };

  const remove = async () => {
    try {
      await trackWrite(pathOf(date), remover.mutateAsync({ path: pathOf(date), method: 'DELETE' }));
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
      client.setQueryData<BodyDay>(keyOf(date), { record: null });
      refreshHistory(client);
    }
    toast.success('Deleted');
    finish();
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">Body</CardTitle>
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
          <div role="status" aria-busy="true" aria-label="Loading body records">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {record === null || (record && editing) ? (
          <BodyForm
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
          <BodySummary
            record={record}
            onEdit={() => {
              setEditing(true);
              setMoveFocus((count) => count + 1);
            }}
            onDelete={remove}
          />
        ) : null}
        <Notice notice={changesNotice} />
        {/* While the record has failed too, its own button retries both. */}
        {(changesNotice || retryingChanges) && record !== undefined ? (
          <Button
            variant="outline"
            className="self-start"
            disabled={retryingChanges}
            aria-busy={retryingChanges || undefined}
            onClick={() => void retryChanges()}
          >
            {retryingChanges ? <Spinner size="sm" label="Loading" /> : null}
            Reload changes
          </Button>
        ) : null}
        {/* Numbers from before a failed reload may be wrong, so they do not stay on screen. */}
        {changesNotice || retryingChanges ? null : <BodyChanges date={date} records={history} />}
      </CardContent>
    </Card>
  );
}
