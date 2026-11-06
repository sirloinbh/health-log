import { Plus, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import {
  type Drink,
  drinkingText,
  type DrinkKind,
  drinkKinds,
  type DrinkUnit,
  drinkUnits,
  type HabitDay,
  type HabitRecord,
  type HabitSummary,
  smokingText,
  spanText,
  summaryLines,
} from './habit-text';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';
import { trackWrite, writesSettled } from './pending-writes';

const pathOf = (date: string) => `/api/habits/${date}`;
const maxDrinks = 20;

type DrinkMode = 'unrecorded' | 'none' | 'some';
const drinkModes: { mode: DrinkMode; label: string }[] = [
  { mode: 'unrecorded', label: '기록 안 함' },
  { mode: 'none', label: '안 마심' },
  { mode: 'some', label: '마심' },
];

type DraftDrink = { key: number; kind: DrinkKind; unit: DrinkUnit; amount: string };
type Form = { cigarettes: string; mode: DrinkMode; drinks: DraftDrink[] };

let nextKey = 0;
const draftOf = (drink: Drink): DraftDrink => ({
  key: ++nextKey,
  kind: drink.kind,
  unit: drink.unit,
  amount: String(drink.amount),
});

// A new row starts on a kind and unit not listed yet: a kind not used at all first, by the bottle.
// There are 18 pairs and at most 20 rows, so only the last rows can repeat one, which the save
// check then points out.
const newDraft = (drinks: DraftDrink[]) => {
  const kinds = Object.keys(drinkKinds) as DrinkKind[];
  const units = Object.keys(drinkUnits) as DrinkUnit[];
  const used = (kind: DrinkKind, unit?: DrinkUnit) =>
    drinks.some((drink) => drink.kind === kind && (unit === undefined || drink.unit === unit));
  const kind = kinds.find((each) => !used(each));
  if (kind) return draftOf({ kind, unit: 'bottle', amount: 1 });
  const free = kinds.flatMap((each) => units.map((unit) => ({ kind: each, unit })));
  const pair = free.find(({ kind: each, unit }) => !used(each, unit)) ?? free[0];
  return draftOf({ ...pair, amount: 1 });
};

const formOf = (record: HabitRecord | null): Form => ({
  cigarettes: record?.cigarettes?.toString() ?? '',
  mode: record?.drinks == null ? 'unrecorded' : record.drinks.length ? 'some' : 'none',
  drinks: record?.drinks?.length ? record.drinks.map(draftOf) : [newDraft([])],
});

/** The request body, or the message that says why there is none. */
const readForm = (form: Form) => {
  const cigarettes = parseAmount(form.cigarettes);
  if (cigarettes === undefined) return unreadableAmount('담배 (개비)');
  if (cigarettes !== null && !Number.isInteger(cigarettes)) {
    return '담배는 개비 수를 정수로 입력해 주세요';
  }
  if (cigarettes !== null && cigarettes > 200) return '담배는 200개비 이하로 입력해 주세요';
  let drinks: Drink[] | null = null;
  if (form.mode === 'none') drinks = [];
  if (form.mode === 'some') {
    if (form.drinks.length === 0) return '마신 술을 하나 이상 입력해 주세요';
    drinks = [];
    for (const [index, draft] of form.drinks.entries()) {
      const label = `${index + 1}번째 술의 양`;
      const amount = parseAmount(draft.amount);
      if (amount === undefined) return unreadableAmount(label);
      if (amount === null || amount <= 0) return `${label}을 0보다 큰 숫자로 입력해 주세요`;
      if (amount > 99) return `${label}은 99 이하로 입력해 주세요`;
      if (!hasTwoDecimalsAtMost(amount)) return `${label}은 소수 둘째 자리까지 입력해 주세요`;
      if (drinks.some((drink) => drink.kind === draft.kind && drink.unit === draft.unit)) {
        return `${drinkKinds[draft.kind]} ${drinkUnits[draft.unit]}이(가) 두 번 있습니다. 한 줄로 합쳐 주세요`;
      }
      drinks.push({ kind: draft.kind, unit: draft.unit, amount });
    }
  }
  if (cigarettes === null && drinks === null) return '술이나 담배 중 하나 이상 기록해 주세요';
  return { cigarettes, drinks };
};

function DrinkRow({
  index,
  drink,
  onChange,
  onRemove,
}: {
  index: number;
  drink: DraftDrink;
  onChange: (next: DraftDrink) => void;
  onRemove: () => void;
}) {
  const name = `${index + 1}번째 술`;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <Select
        value={drink.kind}
        onValueChange={(kind) => onChange({ ...drink, kind: kind as DrinkKind })}
      >
        <SelectTrigger aria-label={`${name} 종류`} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(drinkKinds).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Amount, unit and its remove button wrap together on a narrow screen. */}
      <div className="flex items-center gap-2">
        <Input
          aria-label={`${name} 양`}
          className="w-20"
          inputMode="decimal"
          autoComplete="off"
          value={drink.amount}
          onChange={(event) => onChange({ ...drink, amount: event.target.value })}
        />
        <Select
          value={drink.unit}
          onValueChange={(unit) => onChange({ ...drink, unit: unit as DrinkUnit })}
        >
          <SelectTrigger aria-label={`${name} 단위`} className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(drinkUnits).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${name} 빼기`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function HabitForm({
  date,
  record,
  onSaved,
  onCancel,
}: {
  date: string;
  record: HabitRecord | null;
  onSaved: (day: HabitDay) => void;
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

  const setDrinks = (update: (drinks: DraftDrink[]) => DraftDrink[]) =>
    setForm((current) => ({ ...current, drinks: update(current.drinks) }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = readForm(form);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    setSaving(true);
    try {
      onSaved(
        await trackWrite(
          pathOf(date),
          requestJson<HabitDay>(pathOf(date), { method: 'PUT', body }),
        ),
      );
    } catch (cause) {
      // Moving to another day removes this form, and the record still was not saved.
      if (!mounted.current) {
        toast.error(`${date} 술·담배 기록을 저장하지 못했습니다: ${errorText(cause)}`);
        return;
      }
      error(cause);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="habit-cigarettes">담배 (개비)</Label>
        <Input
          id="habit-cigarettes"
          className="w-28"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="habit-cigarettes-hint"
          value={form.cigarettes}
          onChange={(event) =>
            setForm((current) => ({ ...current, cigarettes: event.target.value }))
          }
        />
        <p id="habit-cigarettes-hint" className="text-caption break-keep text-muted-foreground">
          피우지 않았으면 0, 비워 두면 기록하지 않습니다.
        </p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body-sm font-medium">술</legend>
        <div role="group" aria-label="술 기록" className="flex flex-wrap gap-2">
          {drinkModes.map(({ mode, label }) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={form.mode === mode ? 'default' : 'outline'}
              aria-pressed={form.mode === mode}
              onClick={() => setForm((current) => ({ ...current, mode }))}
            >
              {label}
            </Button>
          ))}
        </div>
        {form.mode === 'some' ? (
          <>
            <ul aria-label="마신 술" className="flex flex-col gap-2">
              {form.drinks.map((drink, index) => (
                <DrinkRow
                  key={drink.key}
                  index={index}
                  drink={drink}
                  onChange={(next) =>
                    setDrinks((drinks) =>
                      drinks.map((other) => (other.key === drink.key ? next : other)),
                    )
                  }
                  onRemove={() =>
                    setDrinks((drinks) => drinks.filter((other) => other.key !== drink.key))
                  }
                />
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={form.drinks.length >= maxDrinks}
              onClick={() => setDrinks((drinks) => [...drinks, newDraft(drinks)])}
            >
              <Plus aria-hidden />술 추가
            </Button>
          </>
        ) : null}
      </fieldset>
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

function HabitView({
  record,
  onEdit,
  onDelete,
}: {
  record: HabitRecord;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">담배</dt>
          <dd>{smokingText(record.cigarettes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">술</dt>
          <dd className="break-keep">{drinkingText(record.drinks)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          수정
        </Button>
        <ConfirmDialog
          title="술·담배 기록을 삭제할까요?"
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

function PeriodSummary({ title, summary }: { title: string; summary: HabitSummary }) {
  const lines = summaryLines(summary);
  return (
    <section aria-label={title} className="flex flex-col gap-1 text-body-sm">
      <p className="font-medium">
        {title} <span className="font-normal text-muted-foreground">{spanText(summary)}</span>
      </p>
      <p className="break-keep">담배: {lines.smoking}</p>
      <p className="break-keep">술: {lines.drinking}</p>
    </section>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function HabitsCard({ date }: { date: string }) {
  const [day, setDay] = useState<HabitDay | undefined>(undefined);
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
      const data = await requestJson<HabitDay>(pathOf(date));
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

  const finish = (next: HabitDay) => {
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
    toast.success('삭제했습니다');
    setEditing(false);
    setMoveFocus((count) => count + 1);
    // The totals changed too; until they arrive the old ones would be wrong.
    setDay(undefined);
    void load();
  };

  const record = day?.record;

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">술·담배</CardTitle>
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
          <div role="status" aria-busy="true" aria-label="술·담배 기록 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day && (record === null || editing) ? (
          <HabitForm
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
          <HabitView
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
            <PeriodSummary title="이 주" summary={day.week} />
            <PeriodSummary title="이 달" summary={day.month} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
