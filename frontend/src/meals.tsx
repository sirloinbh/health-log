import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AddEntry } from './add-entry';
import { fullName } from './combo-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { JunkBadge } from './food-choices';
import { spanText } from './habit-text';
import { type JunkPeriod, junkText } from './junk-text';
import { RequestError, requestJson } from './lib/api';
import { apiKey, type ApiRequest, useApiQuery } from './lib/query';
import { errorText, type NoticeValue } from './lib/use-notice';
import { type MealKey, meals } from './meal-entry';
import { count } from './plural';
import { createRetryKeys } from './retry-key';
import { putAnswer, useReadAfterWrites } from './writes';

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

type MealDay = {
  entries: Entry[];
  totals: Record<NutrientKey, { value: number | null; missing: number }>;
  junk: { week: JunkPeriod; month: JunkPeriod };
};

const pathOf = (date: string) => `/api/meals/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

type MealRequest = ApiRequest & { headers?: Record<string, string> };

/**
 * A change to one day's meals. Every change answers with the whole day, which goes into the cache even after the card
 * is gone. It is useApiMutation with request headers, which the shared one does not pass yet (project-standards#979; the add sends an
 * Idempotency-Key, #196); the variables are the request, as `asRequest` makes them, so useReadAfterWrites sees it.
 */
function useMealWrite(date: string) {
  const client = useQueryClient();
  return useMutation<MealDay, RequestError, MealRequest>({
    mutationFn: ({ path, method = 'POST', body, headers }) =>
      requestJson<MealDay>(path, { method, body, headers }),
    onSuccess: (data) => putAnswer(client, keyOf(date), data),
  });
}

function Totals({ totals }: { totals: MealDay['totals'] }) {
  const incomplete = nutrients.filter(({ key }) => totals[key].missing > 0);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
        {nutrients.map(({ key, label, unit }) => (
          <div key={key}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{totals[key].value === null ? 'No value' : `${totals[key].value}${unit}`}</dd>
          </div>
        ))}
      </dl>
      {incomplete.length > 0 ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          Some foods have unknown values, so these totals leave them out:{' '}
          {incomplete
            .map(({ key, label }) => `${label} ${count(totals[key].missing, 'food')}`)
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
          {count(entry.servings, 'serving')}
          {serving} · {entry.calories === null ? 'No calorie value' : `${entry.calories}kcal`}
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
  const live = useRef(true);
  // An add sent again after no answer reuses its key, so the server does not record it twice (#196).
  const [retryKeys] = useState(() => createRetryKeys());
  const write = useMealWrite(date);
  const adding = write.isPending && write.variables?.method === 'POST';
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

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The delete button is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  /** Resolves to whether it was added; a failure rejects so the form can show it next to its fields. */
  const add = async (body: object, path = '') => {
    const target = `${pathOf(date)}${path}`;
    const key = retryKeys.keyFor(JSON.stringify([target, body]));
    try {
      await write.mutateAsync({
        path: target,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
      });
      retryKeys.answered();
      if (!live.current) {
        toast.success(`Meal recorded for ${date}`);
        return false;
      }
      toast.success('Recorded');
      return true;
    } catch (cause) {
      // With no answer the server may still have saved it: the same request again keeps its key.
      const unanswered = cause instanceof RequestError && cause.status === undefined;
      if (!unanswered) retryKeys.answered();
      if (live.current) throw cause;
      // Moving to another day removes the form.
      toast.error(
        `Could not ${unanswered ? 'confirm that the meal was recorded' : 'record the meal'} for ${date}: ${errorText(cause)}`,
      );
      return false;
    }
  };

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
                    <h3 className="text-body-sm font-semibold">{label}</h3>
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
