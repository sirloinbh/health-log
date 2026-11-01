import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
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

const sourceLabels = { manual: '직접 입력', garmin: '가민' } as const;

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
  const { notice, error } = useNotice();
  const length = bed && wake ? minutesBetween(bed, wake) : 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bed || !wake) {
      error('취침 시각과 기상 시각을 입력해 주세요');
      return;
    }
    setSaving(true);
    try {
      onSaved(
        await requestJson<SleepRecord>(pathOf(date), {
          method: 'PUT',
          body: toInstants(date, bed, wake),
        }),
      );
    } catch (cause) {
      error(cause);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sleep-bed">취침 시각</Label>
          <Input
            id="sleep-bed"
            type="time"
            value={bed}
            onChange={(event) => setBed(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sleep-wake">기상 시각</Label>
          <Input
            id="sleep-wake"
            type="time"
            value={wake}
            onChange={(event) => setWake(event.target.value)}
          />
        </div>
      </div>
      {length > 0 ? (
        <p aria-live="polite" className="text-body-sm text-muted-foreground">
          {isOvernight(bed, wake) ? '전날' : '이날'} {bed}에 잠들어 {formatMinutes(length)}
        </p>
      ) : null}
      <Notice notice={notice} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? '저장 중…' : '저장'}
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

function SleepSummary({
  record,
  onEdit,
  onDelete,
}: {
  record: SleepRecord;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const before = dayOf(record.bedAt) === record.date ? '' : '전날 ';
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-semibold">{formatMinutes(record.durationMinutes)}</p>
      <dl className="grid grid-cols-2 gap-4 text-body-sm">
        <div>
          <dt className="text-muted-foreground">취침</dt>
          <dd>
            {before}
            {clockOf(record.bedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">기상</dt>
          <dd>{clockOf(record.wakeAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{sourceLabels[record.source]}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            수정
          </Button>
          <ConfirmDialog
            title="수면 기록을 삭제할까요?"
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
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">수면</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && record === undefined ? (
          <Button variant="outline" className="self-start" onClick={() => void load()}>
            다시 시도
          </Button>
        ) : null}
        {!notice && record === undefined ? (
          <div role="status" aria-busy="true" aria-label="수면 기록 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {record === null || (record && editing) ? (
          <SleepForm
            date={date}
            record={record}
            onSaved={(saved) => {
              toast.success('저장했습니다');
              finish(saved);
            }}
            onCancel={record ? () => finish(record) : undefined}
          />
        ) : null}
        {record && !editing ? (
          <SleepSummary record={record} onEdit={() => setEditing(true)} onDelete={remove} />
        ) : null}
      </CardContent>
    </Card>
  );
}
