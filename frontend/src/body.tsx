import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  type BodyRecord,
  changeOver,
  changeWindows,
  formatChange,
  formatSpan,
} from './body-change';
import { BusyButton } from './busy-button';
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
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { parseAmount, unreadableAmount } from './number-input';
import { trackWrite, writesSettled } from './pending-writes';

const pathOf = (date: string) => `/api/body/${date}`;

const numberFields = [
  { key: 'weightKg', id: 'body-weight', label: 'Weight (kg)' },
  { key: 'bodyFatPercent', id: 'body-fat', label: 'Body fat (%)' },
  { key: 'waistCm', id: 'body-waist', label: 'Waist (cm)' },
  { key: 'systolicMmhg', id: 'body-systolic', label: 'Systolic blood pressure (mmHg)' },
  { key: 'diastolicMmhg', id: 'body-diastolic', label: 'Diastolic blood pressure (mmHg)' },
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

const bodyOf = (form: Form) => ({
  weightKg: parseAmount(form.weightKg),
  bodyFatPercent: parseAmount(form.bodyFatPercent),
  waistCm: parseAmount(form.waistCm),
  systolicMmhg: parseAmount(form.systolicMmhg),
  diastolicMmhg: parseAmount(form.diastolicMmhg),
  memo: form.memo.trim() || null,
});

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
    const unreadable = numberFields.find(({ key }) => parseAmount(form[key]) === undefined);
    if (unreadable) {
      error(unreadableAmount(unreadable.label));
      return;
    }
    // A repeated failure then appears anew and is announced again (as in #98).
    clear();
    setSaving(true);
    try {
      onSaved(
        await trackWrite(
          pathOf(date),
          requestJson<BodyRecord>(pathOf(date), { method: 'PUT', body: bodyOf(form) }),
        ),
      );
    } catch (cause) {
      // Moving to another day removes this form, and the record still was not saved.
      if (!mounted.current) {
        toast.error(`Could not save the body record for ${date}: ${errorText(cause)}`);
        return;
      }
      error(cause);
      setSaving(false);
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
        {record.systolicMmhg !== null ? (
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
  const [record, setRecord] = useState<BodyRecord | null | undefined>(undefined);
  const [history, setHistory] = useState<BodyRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const { notice, error, clear } = useNotice();
  const { notice: changesNotice, error: changesError, clear: changesClear } = useNotice();
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const latestHistory = useRef(0);
  const [retryingChanges, setRetryingChanges] = useState(false);

  const load = useCallback(async () => {
    clear();
    try {
      // A save from before leaving this day may still be on its way; read after it lands.
      await writesSettled(pathOf(date));
      // Left again while waiting: nothing would show the answer.
      if (!live.current) return;
      const data = await requestJson<{ record: BodyRecord | null }>(pathOf(date));
      if (live.current) setRecord(data.record);
    } catch (cause) {
      if (live.current) error(cause);
    }
  }, [clear, date, error]);

  // Kept apart from the record: failing to load the trend must not hide today's form.
  const loadHistory = useCallback(async () => {
    // A slow older answer must not overwrite the one that includes the latest save.
    const request = ++latestHistory.current;
    const from = shiftDate(date, 1 - Math.max(...changeWindows));
    try {
      // A save to a day in the window changes the trend; waiting for every body write is simplest.
      await writesSettled(pathOf(''));
      // Left again while waiting: nothing would show the answer.
      if (!live.current) return;
      const data = await requestJson<{ records?: BodyRecord[] }>(
        `/api/body?from=${from}&to=${date}`,
      );
      if (!live.current || request !== latestHistory.current) return;
      changesClear();
      setHistory(data.records ?? []);
    } catch {
      // Says which part failed: the record above has its own message for the same outage.
      if (live.current && request === latestHistory.current) {
        changesError('Could not load the changes over time');
      }
    }
  }, [changesClear, changesError, date]);

  useEffect(() => {
    live.current = true;
    void load();
    void loadHistory();
    return () => {
      live.current = false;
    };
  }, [load, loadHistory]);

  // The button that was pressed is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const retryChanges = async () => {
    // Clearing first means a repeated failure appears anew and is announced again.
    changesClear();
    setRetryingChanges(true);
    await loadHistory();
    setRetryingChanges(false);
    // The pressed button was disabled and may be gone, which would drop keyboard focus.
    setMoveFocus((count) => count + 1);
  };

  const finish = (next: BodyRecord | null) => {
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
    void loadHistory();
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
              void load();
              void loadHistory();
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
            onSaved={(saved) => {
              toast.success('Saved');
              finish(saved);
              void loadHistory();
            }}
            onCancel={record ? () => finish(record) : undefined}
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
