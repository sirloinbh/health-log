import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { BusyButton } from './components/busy-button/busy-button';
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
import { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';
import { asRequest, putAnswer, useReadAfterWrites } from './writes';

const pathOf = (date: string) => `/api/habits/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));
const maxDrinks = 20;

type DrinkMode = 'unrecorded' | 'none' | 'some';
const drinkModes: { mode: DrinkMode; label: string }[] = [
  { mode: 'unrecorded', label: 'Not recorded' },
  { mode: 'none', label: 'No drinking' },
  { mode: 'some', label: 'Drank' },
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
  if (cigarettes === undefined) return unreadableAmount('Cigarettes');
  if (cigarettes !== null && !Number.isInteger(cigarettes)) {
    return 'Cigarettes must be a whole number';
  }
  if (cigarettes !== null && cigarettes > 200) return 'Cigarettes must be 200 or fewer';
  let drinks: Drink[] | null = null;
  if (form.mode === 'none') drinks = [];
  if (form.mode === 'some') {
    if (form.drinks.length === 0) return 'Enter at least one drink';
    drinks = [];
    for (const [index, draft] of form.drinks.entries()) {
      const label = `Drink ${index + 1} amount`;
      const amount = parseAmount(draft.amount);
      if (amount === undefined) return unreadableAmount(label);
      if (amount === null || amount <= 0) return `${label} must be a number greater than 0`;
      if (amount > 99) return `${label} must be 99 or less`;
      if (!hasTwoDecimalsAtMost(amount)) return `${label} can have at most 2 decimal places`;
      if (drinks.some((drink) => drink.kind === draft.kind && drink.unit === draft.unit)) {
        return `${drinkKinds[draft.kind]} (${drinkUnits[draft.unit]}) appears twice. Combine them into one line`;
      }
      drinks.push({ kind: draft.kind, unit: draft.unit, amount });
    }
  }
  if (cigarettes === null && drinks === null) return 'Record at least one drink or cigarette count';
  return { cigarettes, drinks };
};

function DrinkRow({
  index,
  drink,
  removeId,
  onChange,
  onRemove,
}: {
  index: number;
  drink: DraftDrink;
  removeId: string;
  onChange: (next: DraftDrink) => void;
  onRemove: () => void;
}) {
  const name = `Drink ${index + 1}`;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <Select
        value={drink.kind}
        onValueChange={(kind) => onChange({ ...drink, kind: kind as DrinkKind })}
      >
        <SelectTrigger aria-label={`${name} type`} className="w-28">
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
          aria-label={`${name} amount`}
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
          <SelectTrigger aria-label={`${name} unit`} className="w-20">
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
          id={removeId}
          aria-label={`Remove drink ${index + 1}`}
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
  const client = useQueryClient();
  // The answer is the whole day with its new totals; it goes into the cache even after the card is gone.
  const save = useApiMutation<HabitDay, ApiRequest>(asRequest, {
    onSuccess: (saved) => putAnswer(client, keyOf(date), saved),
  });
  const saving = save.isPending;
  const { notice, error, clear } = useNotice();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setDrinks = (update: (drinks: DraftDrink[]) => DraftDrink[]) =>
    setForm((current) => ({ ...current, drinks: update(current.drinks) }));
  const full = form.drinks.length >= maxDrinks;

  // A removed row takes its focused remove button with it (#203). Focus then goes to the remove
  // button of the row that takes its place, the row before it, or the add button.
  const idPrefix = useId();
  const removeIdOf = (key: number) => `${idPrefix}-drink-${key}-remove`;
  const addId = `${idPrefix}-drink-add`;
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  const remove = (key: number) => {
    const at = form.drinks.findIndex((drink) => drink.key === key);
    const next = form.drinks[at + 1] ?? form.drinks[at - 1];
    focusNext.current = next ? removeIdOf(next.key) : addId;
    setDrinks((drinks) => drinks.filter((other) => other.key !== key));
  };

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
      onSaved(await save.mutateAsync({ path: pathOf(date), method: 'PUT', body }));
    } catch (cause) {
      // Moving to another day removes this form, and the record still was not saved.
      if (!mounted.current) {
        toast.error(
          `Could not save the alcohol and tobacco record for ${date}: ${errorText(cause)}`,
        );
        return;
      }
      error(cause);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="habit-cigarettes">Cigarettes</Label>
        <Input
          id="habit-cigarettes"
          className="w-28"
          inputMode="numeric"
          autoComplete="off"
          value={form.cigarettes}
          onChange={(event) =>
            setForm((current) => ({ ...current, cigarettes: event.target.value }))
          }
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body-sm font-medium">Drinks</legend>
        <div role="group" aria-label="Drink record" className="flex flex-wrap gap-2">
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
            <ul aria-label="Drinks had" className="flex flex-col gap-2">
              {form.drinks.map((drink, index) => (
                <DrinkRow
                  key={drink.key}
                  index={index}
                  drink={drink}
                  removeId={removeIdOf(drink.key)}
                  onChange={(next) =>
                    setDrinks((drinks) =>
                      drinks.map((other) => (other.key === drink.key ? next : other)),
                    )
                  }
                  onRemove={() => remove(drink.key)}
                />
              ))}
            </ul>
            {/* aria-disabled, not disabled: adding the last allowed row must not drop focus to
                the page (#98, #203). */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              id={addId}
              className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-disabled={full || undefined}
              aria-describedby={full ? `${addId}-limit` : undefined}
              onClick={() => {
                if (full) return;
                setDrinks((drinks) => [...drinks, newDraft(drinks)]);
              }}
            >
              <Plus aria-hidden />
              Add drink
            </Button>
            {full ? (
              <p id={`${addId}-limit`} className="text-body-sm text-muted-foreground">
                You can record up to {maxDrinks} drinks per day.
              </p>
            ) : null}
          </>
        ) : null}
      </fieldset>
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
          <dt className="text-muted-foreground">Cigarettes</dt>
          <dd>{smokingText(record.cigarettes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Drinks</dt>
          <dd className="break-keep">{drinkingText(record.drinks)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <ConfirmDialog
          title="Delete this alcohol and tobacco record?"
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

function PeriodSummary({ title, summary }: { title: string; summary: HabitSummary }) {
  const lines = summaryLines(summary);
  return (
    <section aria-label={title} className="flex flex-col gap-1 text-body-sm">
      <p className="font-medium">
        {title} <span className="font-normal text-muted-foreground">{spanText(summary)}</span>
      </p>
      <p className="break-keep">Cigarettes: {lines.smoking}</p>
      <p className="break-keep">Drinks: {lines.drinking}</p>
    </section>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function HabitsCard({ date }: { date: string }) {
  const [editing, setEditing] = useState(false);
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const remover = useApiMutation<unknown, ApiRequest>(asRequest);
  // A save from before leaving this day may still be on its way; read after it lands.
  const ready = useReadAfterWrites(pathOf(date));
  const query = useApiQuery<HabitDay>(keyOf(date), pathOf(date), { enabled: ready });
  const day = ready ? query.data : undefined;
  // A failed read with nothing to show; a failed refresh keeps the day on screen.
  const notice: NoticeValue | undefined =
    query.isError && day === undefined
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
    }
    toast.success('Deleted');
    setEditing(false);
    setMoveFocus((count) => count + 1);
    // The totals changed too; until they arrive the old ones would be wrong.
    void client.resetQueries({ queryKey: keyOf(date) });
  };

  const record = day?.record;

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">Alcohol and tobacco</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && day === undefined ? (
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
        {!notice && day === undefined ? (
          <div role="status" aria-busy="true" aria-label="Loading alcohol and tobacco records">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day && (record === null || editing) ? (
          <HabitForm
            date={date}
            record={record ?? null}
            onSaved={() => {
              toast.success('Saved');
              finish();
            }}
            onCancel={record ? finish : undefined}
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
            <PeriodSummary title="This week" summary={day.week} />
            <PeriodSummary title="This month" summary={day.month} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
