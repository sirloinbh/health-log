import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  type BodyRecord,
  changeOver,
  changeWindows,
  formatChange,
  formatSpan,
} from './body-change';
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

const pathOf = (date: string) => `/api/body/${date}`;

const numberFields = [
  { key: 'weightKg', id: 'body-weight', label: '체중 (kg)' },
  { key: 'bodyFatPercent', id: 'body-fat', label: '체지방률 (%)' },
  { key: 'waistCm', id: 'body-waist', label: '허리둘레 (cm)' },
  { key: 'systolicMmhg', id: 'body-systolic', label: '수축기 혈압 (mmHg)' },
  { key: 'diastolicMmhg', id: 'body-diastolic', label: '이완기 혈압 (mmHg)' },
] as const;

const changeRows = [
  { key: 'weightKg', label: '체중', unit: 'kg' },
  { key: 'bodyFatPercent', label: '체지방률', unit: '%' },
  { key: 'waistCm', label: '허리둘레', unit: 'cm' },
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
    const unreadable = numberFields.find(({ key }) => parseAmount(form[key]) === undefined);
    if (unreadable) {
      error(unreadableAmount(unreadable.label));
      return;
    }
    setSaving(true);
    try {
      onSaved(await requestJson<BodyRecord>(pathOf(date), { method: 'PUT', body: bodyOf(form) }));
    } catch (cause) {
      // Moving to another day removes this form, and the record still was not saved.
      if (!mounted.current) {
        toast.error(`${date} 신체 기록을 저장하지 못했습니다: ${errorText(cause)}`);
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
        <Label htmlFor="body-memo">메모</Label>
        <Input
          id="body-memo"
          value={form.memo}
          onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
        />
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
    { label: '체중', value: record.weightKg, unit: 'kg' },
    { label: '체지방률', value: record.bodyFatPercent, unit: '%' },
    { label: '허리둘레', value: record.waistCm, unit: 'cm' },
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
            <dt className="text-muted-foreground">혈압</dt>
            <dd>
              {record.systolicMmhg}/{record.diastolicMmhg}mmHg
            </dd>
          </div>
        ) : null}
        {record.memo ? (
          <div className="col-span-2">
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
          title="신체 기록을 삭제할까요?"
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

function BodyChanges({ date, records }: { date: string; records: BodyRecord[] }) {
  const rows = changeRows.filter(({ key }) => records.some((record) => record[key] !== null));
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <caption className="pb-2 text-left font-medium">기간별 변화</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-2 font-normal">
              항목
            </th>
            {changeWindows.map((days) => (
              <th key={days} scope="col" className="px-2 py-1 font-normal">
                {days}일
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
                      '기록 부족'
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
      const data = await requestJson<{ records?: BodyRecord[] }>(
        `/api/body?from=${from}&to=${date}`,
      );
      if (!live.current || request !== latestHistory.current) return;
      changesClear();
      setHistory(data.records ?? []);
    } catch {
      // Says which part failed: the record above has its own message for the same outage.
      if (live.current && request === latestHistory.current) {
        changesError('기간별 변화를 불러오지 못했습니다');
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
      await requestJson(pathOf(date), { method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('삭제했습니다');
    finish(null);
    void loadHistory();
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">신체</CardTitle>
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
            }}
          >
            다시 시도
          </Button>
        ) : null}
        {!notice && record === undefined ? (
          <div role="status" aria-busy="true" aria-label="신체 기록 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {record === null || (record && editing) ? (
          <BodyForm
            date={date}
            record={record}
            onSaved={(saved) => {
              toast.success('저장했습니다');
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
            {retryingChanges ? <Spinner size="sm" label="불러오는 중" /> : null}
            변화 다시 불러오기
          </Button>
        ) : null}
        {/* Numbers from before a failed reload may be wrong, so they do not stay on screen. */}
        {changesNotice || retryingChanges ? null : <BodyChanges date={date} records={history} />}
      </CardContent>
    </Card>
  );
}
