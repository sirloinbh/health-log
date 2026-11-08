import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { charCount } from './check-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import { dailyRangeText, earliestDate, inDailyRange, isValidDate, latestDate } from './daily-date';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import {
  howText,
  type Medication,
  type MedicationLists,
  medicationsPath,
  periodText,
} from './med-text';
import { trackWrite } from './pending-writes';
import { useReturnFocus } from './return-focus';
import { type Visit, visitsPath, withTopic } from './visit-text';

type Draft = {
  name: string;
  dose: string;
  directions: string;
  startOn: string;
  endOn: string;
  note: string;
  /** '' for none. */
  visitId: string;
};

const draftOf = (item: Medication | null, start: { date: string; visitId: string }): Draft => ({
  name: item?.name ?? '',
  dose: item?.dose ?? '',
  directions: item?.directions ?? '',
  startOn: item?.startOn ?? start.date,
  endOn: item?.endOn ?? '',
  note: item?.note ?? '',
  visitId: item ? (item.visit ? String(item.visit.id) : '') : start.visitId,
});

/** The request body, or the first reason it cannot be sent. */
function readDraft(draft: Draft) {
  if (!draft.name.trim()) return '약 이름을 입력해 주세요';
  const long = (
    [
      ['약 이름', draft.name, 100],
      ['용량', draft.dose, 50],
      ['복용법', draft.directions, 100],
      ['메모', draft.note, 500],
    ] as const
  ).find(([, value, max]) => charCount(value.trim()) > max);
  if (long) return `${withTopic(long[0])} ${long[2]}자 이하로 입력해 주세요`;
  if (!isValidDate(draft.startOn)) return '시작일을 골라 주세요';
  // The daily page opens only these days (#50).
  if (!inDailyRange(draft.startOn)) return `시작일: ${dailyRangeText}`;
  if (draft.endOn && !isValidDate(draft.endOn)) return '종료일이 올바르지 않습니다';
  if (draft.endOn && !inDailyRange(draft.endOn)) return `종료일: ${dailyRangeText}`;
  if (draft.endOn && draft.endOn < draft.startOn) return '종료일은 시작일보다 빠를 수 없습니다';
  return {
    name: draft.name,
    dose: draft.dose,
    directions: draft.directions,
    startOn: draft.startOn,
    endOn: draft.endOn || null,
    note: draft.note,
    visitId: draft.visitId ? Number(draft.visitId) : null,
  };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// The same look as Input, for the native select and the longer note.
const fieldClass =
  'w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none md:text-body-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function MedicationDialog({
  item,
  start,
  visits,
  onClose,
  onSaved,
}: {
  item: Medication | null;
  start: { date: string; visitId: string; visitDate?: string };
  visits: Visit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item, start));
  const [saving, setSaving] = useState(false);
  const { notice, error, clear } = useNotice();
  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  // The linked visit may be older than the recent ones offered, or already deleted.
  const linked = item?.visit ?? null;
  const options = [
    ...visits.map((visit) => ({ id: visit.id, date: visit.date, clinic: visit.clinic })),
  ];
  if (linked && !options.some((option) => option.id === linked.id)) options.unshift(linked);
  if (draft.visitId && !options.some((option) => String(option.id) === draft.visitId)) {
    // Its date is known only when the visit's own link gave it.
    options.unshift({
      id: Number(draft.visitId),
      date: start.visitDate ?? '',
      clinic: '선택한 방문',
    });
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button stays pressable while saving, and Enter in a field submits too (#98).
    if (saving) return;
    const body = readDraft(draft);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    // Cleared first, so the same failure twice is announced again.
    clear();
    setSaving(true);
    try {
      const path = item ? `${medicationsPath}/${item.id}` : medicationsPath;
      await trackWrite(
        `${medicationsPath}/`,
        requestJson<Medication>(path, { method: item ? 'PUT' : 'POST', body }),
      );
      onSaved();
    } catch (cause) {
      error(cause);
      setSaving(false);
    }
  };

  return (
    // Closing during a save would not cancel it, and its late reply would close whatever opened next.
    <Dialog open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? '약 기록 수정' : '약 기록'}</DialogTitle>
          <DialogDescription>
            종료일을 비워 두면 지금도 먹는 약으로 셉니다. 모르는 값은 비워 두세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <Field id="med-name" label="약 이름">
            <Input id="med-name" autoComplete="off" value={draft.name} onChange={set('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="med-dose" label="용량">
              <Input id="med-dose" autoComplete="off" value={draft.dose} onChange={set('dose')} />
            </Field>
            <Field id="med-directions" label="복용법">
              <Input
                id="med-directions"
                autoComplete="off"
                value={draft.directions}
                onChange={set('directions')}
              />
            </Field>
            <Field id="med-start" label="시작일">
              <Input
                id="med-start"
                type="date"
                min={earliestDate}
                max={latestDate}
                value={draft.startOn}
                onChange={set('startOn')}
              />
            </Field>
            <Field id="med-end" label="종료일">
              <Input
                id="med-end"
                type="date"
                min={draft.startOn || earliestDate}
                max={latestDate}
                value={draft.endOn}
                onChange={set('endOn')}
              />
            </Field>
          </div>
          <Field id="med-visit" label="처방받은 병원 방문">
            <select
              id="med-visit"
              className={`${fieldClass} h-9 pointer-coarse:min-h-11`}
              value={draft.visitId}
              onChange={set('visitId')}
            >
              <option value="">연결 안 함 (처방 없이 산 약)</option>
              {options.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {[option.date, option.clinic].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field id="med-note" label="메모">
            <textarea
              id="med-note"
              className={`${fieldClass} min-h-20 py-2`}
              value={draft.note}
              onChange={set('note')}
            />
          </Field>
          <Notice notice={notice} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              // Keeps focus while busy, like Save (#98).
              aria-disabled={saving || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (!saving) onClose();
              }}
            >
              취소
            </Button>
            <Button
              type="submit"
              // aria-disabled, not disabled: a disabled button drops keyboard focus to the page (#98).
              aria-disabled={saving || undefined}
              aria-busy={saving || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MedicationCard({
  item,
  onEdit,
  onDelete,
}: {
  item: Medication;
  onEdit: (opener: HTMLElement) => void;
  onDelete: () => Promise<unknown>;
}) {
  const how = howText(item);
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h3" className="wrap-anywhere">
          {item.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{periodText(item)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        {how ? <p className="wrap-anywhere">{how}</p> : null}
        {item.visit ? (
          <p className="wrap-anywhere text-muted-foreground">
            {item.visit.date} {item.visit.clinic} 처방
          </p>
        ) : null}
        {item.note ? <p className="wrap-anywhere whitespace-pre-line">{item.note}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="약 기록을 삭제할까요?"
            description="삭제하면 되돌릴 수 없습니다. 연결된 병원 방문은 그대로 남습니다."
            onConfirm={onDelete}
            trigger={
              <Button variant="outline" size="sm" aria-label={`${item.name} 삭제`}>
                <Trash2 aria-hidden />
                삭제
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={`${item.name} 수정`}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            <Pencil aria-hidden />
            수정
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const sections = [
  { key: 'current', title: '복용 중', empty: '지금 먹는 약이 없습니다.' },
  { key: 'upcoming', title: '시작 예정', empty: null },
  { key: 'past', title: '지난 약', empty: '끝난 약이 없습니다.' },
] as const;

/** `today` is undefined while the server is still being asked, and null if it could not say. */
export function MedicationsPage({ today }: { today: string | null | undefined }) {
  const [params, setParams] = useSearchParams();
  const [lists, setLists] = useState<MedicationLists | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  // null: closed. Otherwise the medicine being edited (null for a new one) and where it starts.
  const [editing, setEditing] = useState<{
    item: Medication | null;
    start: { date: string; visitId: string; visitDate?: string };
  } | null>(null);
  const { notice, error, clear } = useNotice();
  const latest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const [moveFocus, setMoveFocus] = useState(0);

  // A deleted medicine takes its buttons with it, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const load = useCallback(async () => {
    // A slow older answer must not overwrite a newer one.
    const request = ++latest.current;
    try {
      const data = await requestJson<MedicationLists>(medicationsPath);
      if (request !== latest.current) return;
      clear();
      setLists(data);
    } catch (cause) {
      if (request === latest.current) error(cause);
    }
  }, [clear, error]);

  useEffect(() => {
    void load();
    // The recent visits offered as where a medicine was prescribed; without them it can still be saved.
    requestJson<{ visits: Visit[] }>(visitsPath)
      .then((data) => setVisits(data.visits))
      .catch(() => undefined);
  }, [load]);

  // A visit links here with ?visit=<id>&date=<its date> to record what was prescribed there.
  const askedVisit = params.get('visit');
  const askedDate = params.get('date');
  useEffect(() => {
    if (askedVisit === null) return;
    const inRange = askedDate !== null && isValidDate(askedDate) && inDailyRange(askedDate);
    // Without a usable date, wait for the server's today; if it cannot say, open anyway.
    if (!inRange && today === undefined) return;
    setParams({}, { replace: true });
    setEditing({
      item: null,
      start: {
        date: inRange ? askedDate : (today ?? ''),
        visitId: /^[1-9]\d*$/.test(askedVisit) ? askedVisit : '',
        visitDate: inRange ? askedDate : undefined,
      },
    });
  }, [askedDate, askedVisit, setParams, today]);

  const openDialog = (opener: HTMLElement, item: Medication | null) => {
    remember(opener);
    setEditing({ item, start: { date: today ?? '', visitId: '' } });
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  const remove = async (item: Medication) => {
    try {
      await trackWrite(
        `${medicationsPath}/`,
        requestJson(`${medicationsPath}/${item.id}`, { method: 'DELETE' }),
      );
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('삭제했습니다');
    // Dropped now, so its delete button is not what the closing dialog hands focus back to.
    setLists((current) =>
      current
        ? {
            ...current,
            current: current.current.filter((other) => other.id !== item.id),
            upcoming: current.upcoming.filter((other) => other.id !== item.id),
            past: current.past.filter((other) => other.id !== item.id),
          }
        : current,
    );
    setMoveFocus((count) => count + 1);
    void load();
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          id="page-title"
          ref={heading}
          tabIndex={-1}
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          약
        </h1>
        <p className="text-body text-muted-foreground">
          처방받거나 산 약과 먹는 기간을 기록합니다. 오늘
          {lists ? `(${lists.today})` : ''} 기준으로 지금 먹는 약과 지난 약을 나눕니다.
        </p>
      </header>
      <div>
        <Button onClick={(event) => openDialog(event.currentTarget, null)}>
          <Plus aria-hidden />약 기록
        </Button>
      </div>
      <Notice notice={notice} />
      {notice?.kind === 'error' ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            // Cleared first, so the same failure twice is announced again.
            clear();
            void load();
            // Trying again removes this button, which would drop keyboard focus to the page (#65, #127).
            setMoveFocus((count) => count + 1);
          }}
        >
          다시 시도
        </Button>
      ) : null}
      {lists === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          불러오는 중…
        </p>
      ) : null}
      {lists
        ? sections.map(({ key, title, empty }) => {
            const items = lists[key];
            if (!items.length && empty === null) return null;
            return (
              <section key={key} aria-labelledby={`med-${key}`} className="flex flex-col gap-3">
                <h2 id={`med-${key}`}>
                  {title} <span className="text-muted-foreground">{items.length}</span>
                </h2>
                {items.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {items.map((item) => (
                      <MedicationCard
                        key={item.id}
                        item={item}
                        onEdit={(opener) => openDialog(opener, item)}
                        onDelete={() => remove(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-muted-foreground">{empty}</p>
                )}
              </section>
            );
          })
        : null}
      {editing ? (
        <MedicationDialog
          item={editing.item}
          start={editing.start}
          visits={visits}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('저장했습니다');
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
