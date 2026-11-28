import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AddEntry } from './add-entry';
import { calorieText, kcalText } from './calorie-text';
import { fullName } from './combo-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { JunkBadge } from './food-choices';
import { spanText } from './habit-text';
import { type JunkPeriod, junkText } from './junk-text';
import { RequestError } from './lib/api';
import { plural } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import { errorText, type NoticeValue } from './lib/use-notice';
import { type MealKey, meals } from './meal-entry';
import { useMealAdd } from './use-meal-add';
import { useReadAfterWrites } from './writes';

const nutrients = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
] as const;

type NutrientKey = (typeof nutrients)[number]['key'];

type Entry = Record<NutrientKey, number | null> & {
  id: number;
  meal: MealKey;
  name: string;
  brand: string | null;
  servings: number;
  servingSize: number | null;
  servingUnit: string | null;
  /** The mark when it was recorded; changing the food later leaves it as it was. */
  isJunk: boolean;
};

export type MealDay = {
  entries: Entry[];
  /** When each meal slot was eaten, "HH:MM" (Asia/Seoul); null when not recorded. */
  times: Record<MealKey, string | null>;
  totals: Record<NutrientKey, { value: number | null; missing: number }>;
  junk: { week: JunkPeriod; month: JunkPeriod };
};

const pathOf = (date: string) => `/api/meals/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

// Calories read like every other calorie amount, rounded and grouped (#281); the gram and
// milligram totals keep the API's value.
const totalText = (key: (typeof nutrients)[number]['key'], value: number | null, unit: string) =>
  value === null ? 'No value' : key === 'calories' ? kcalText(value) : `${value}${unit}`;

function Totals({ totals }: { totals: MealDay['totals'] }) {
  const incomplete = nutrients.filter(({ key }) => totals[key].missing > 0);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
        {nutrients.map(({ key, label, unit }) => (
          <div key={key}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{totalText(key, totals[key].value, unit)}</dd>
          </div>
        ))}
      </dl>
      {incomplete.length > 0 ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          Some foods have unknown values, so these totals leave them out:{' '}
          {incomplete
            .map(({ key, label }) => `${label} ${plural(totals[key].missing, 'food')}`)
            .join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function JunkSummary({ junk }: { junk: MealDay['junk'] }) {
  return (
    <section aria-labelledby="meal-junk-heading" className="flex flex-col gap-1 text-body-sm">
      <h3 id="meal-junk-heading" className="font-semibold">
        Junk food
      </h3>
      {(
        [
          ['This week', junk.week],
          ['This month', junk.month],
        ] as const
      ).map(([title, period]) => (
        <p key={title} className="break-keep">
          {title} <span className="text-muted-foreground">{spanText(period)}</span>:{' '}
          {junkText(period)}
        </p>
      ))}
    </section>
  );
}

/** The time the slot was eaten. Saved when the field loses focus; empty clears it. */
function SlotTime({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  /** Resolves false when the save failed. */
  onSave: (time: string | null) => Promise<boolean>;
}) {
  return (
    <Input
      // A new answer replaces what was typed.
      key={value ?? ''}
      type="time"
      aria-label={`${label} time`}
      className="w-32"
      defaultValue={value ?? ''}
      disabled={disabled}
      onBlur={(event) => {
        const field = event.target;
        const time = field.value || null;
        if (time === value) return;
        // A failed save puts the saved time back, so the field never shows what was not saved.
        void onSave(time).then((saved) => {
          if (!saved) field.value = value ?? '';
        });
      }}
    />
  );
}

function EntryRow({
  entry,
  disabled,
  onDelete,
}: {
  entry: Entry;
  disabled: boolean;
  onDelete: () => Promise<unknown>;
}) {
  const serving =
    entry.servingSize === null ? null : ` · Serving ${entry.servingSize}${entry.servingUnit ?? ''}`;
  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <span className="wrap-anywhere">{fullName(entry)}</span>
          {entry.isJunk ? <JunkBadge /> : null}
        </span>
        <span className="text-caption text-muted-foreground">
          {plural(entry.servings, 'serving')}
          {serving} · {calorieText(entry.calories)}
        </span>
      </div>
      <ConfirmDialog
        title="Delete this meal record?"
        description={
          <span className="wrap-anywhere">{`'${fullName(entry)}' will be deleted.`}</span>
        }
        onConfirm={onDelete}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Delete ${fullName(entry)}`}
          >
            <Trash2 aria-hidden />
          </Button>
        }
      />
    </li>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function MealCard({ date }: { date: string }) {
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const { write, adding, add, live } = useMealAdd(date);
  // A meal added before leaving this day may still be on its way; read after it lands.
  const ready = useReadAfterWrites(pathOf(date));
  const query = useApiQuery<MealDay>(keyOf(date), pathOf(date), { enabled: ready });
  const day = ready ? query.data : undefined;
  // A failed read keeps the day on screen if there is one, and can be tried again. A change's answer replaces the
  // failure, as it is the newer day.
  const notice: NoticeValue | undefined = query.isError
    ? { kind: 'error', text: errorText(query.error) }
    : undefined;
  /** One read at a time: pressing again while it is on its way does not start another. Resolves to whether it read. */
  const load = async () => !(await query.refetch({ cancelRefetch: false })).isError;

  // The delete button is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const remove = async (id: number) => {
    try {
      await write.mutateAsync({ path: `${pathOf(date)}/entries/${id}`, method: 'DELETE' });
    } catch (cause) {
      if (!(cause instanceof RequestError && cause.status === 404)) {
        // Keeps the dialog open with the reason.
        toast.error(errorText(cause));
        throw cause;
      }
      // Already gone counts as deleted, but the list and totals are out of date.
      if (live.current && !(await load())) return;
    }
    toast.success('Deleted');
    setMoveFocus((count) => count + 1);
  };

  const saveTime = async (meal: MealKey, time: string | null) => {
    try {
      await write.mutateAsync({
        path: `${pathOf(date)}/times/${meal}`,
        method: 'PUT',
        body: { time },
      });
      return true;
    } catch (cause) {
      toast.error(`Could not save the time: ${errorText(cause)}`);
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">Diet</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice ? (
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
        {!notice && !day ? (
          <div role="status" aria-busy="true" aria-label="Loading meal records">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day ? (
          <>
            <Totals totals={day.totals} />
            <JunkSummary junk={day.junk} />
            {day.entries.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">No meals recorded yet.</p>
            ) : (
              meals
                .filter(({ key }) => day.entries.some((entry) => entry.meal === key))
                .map(({ key, label }) => (
                  <section key={key} aria-label={label} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-body-sm font-semibold">{label}</h3>
                      <SlotTime
                        label={label}
                        value={day.times[key]}
                        disabled={adding}
                        onSave={(time) => saveTime(key, time)}
                      />
                    </div>
                    <ul className="flex flex-col divide-y">
                      {day.entries
                        .filter((entry) => entry.meal === key)
                        .map((entry) => (
                          <EntryRow
                            key={entry.id}
                            entry={entry}
                            disabled={adding}
                            onDelete={() => remove(entry.id)}
                          />
                        ))}
                    </ul>
                  </section>
                ))
            )}
            <AddEntry date={date} adding={adding} onAdd={add} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
