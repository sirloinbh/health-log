import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { charCount } from './check-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Combobox } from './components/ui/combobox';
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
import {
  type LabResult,
  labsPath,
  parseLabNumber,
  rangeStatus,
  rangeText,
  valueText,
} from './lab-text';
import { LabTrendCard } from './lab-trend-card';
import { RequestError, requestJson } from './lib/api';
import { serviceToday } from './lib/format';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { usedValues } from './lib/used-values';
import { useReturnFocus } from './return-focus';
import { type Visit, visitsPath } from './visit-text';
import { asRequest } from './writes';

type Page = { results: LabResult[]; more: boolean };

const recentVisitsKey = apiKey(visitsPath, 'recent');

type Draft = {
  date: string;
  name: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
  note: string;
  /** '' for none. */
  visitId: string;
};

const draftOf = (item: LabResult | null): Draft => ({
  date: item?.date ?? serviceToday(),
  name: item?.name ?? '',
  value: item ? String(item.value) : '',
  unit: item?.unit ?? '',
  refLow: item?.refLow == null ? '' : String(item.refLow),
  refHigh: item?.refHigh == null ? '' : String(item.refHigh),
  note: item?.note ?? '',
  visitId: item?.visit ? String(item.visit.id) : '',
});

/** The request body, or the first reason it cannot be sent. */
function readDraft(draft: Draft) {
  if (!isValidDate(draft.date)) return 'Choose a test date';
  if (!inDailyRange(draft.date)) return `Test date: ${dailyRangeText}`;
  if (!draft.name.trim()) return 'Enter the test name';
  const long = (
    [
      ['Test name', draft.name, 100],
      ['Unit', draft.unit, 20],
      ['Note', draft.note, 500],
    ] as const
  ).find(([, value, max]) => charCount(value.trim()) > max);
  if (long) return `${long[0]} must be ${long[2]} characters or fewer`;
  const value = parseLabNumber(draft.value);
  if (value === null) return 'Enter the result';
  if (value === undefined)
    return 'Result: enter digits only, 0 or more, with a period for decimals (at most 4 decimals)';
  const refLow = parseLabNumber(draft.refLow);
  if (refLow === undefined) return 'Reference minimum: enter digits only (at most 4 decimals)';
  const refHigh = parseLabNumber(draft.refHigh);
  if (refHigh === undefined) return 'Reference maximum: enter digits only (at most 4 decimals)';
  if (refLow !== null && refHigh !== null && refLow > refHigh)
    return 'The reference minimum cannot be above the maximum';
  return {
    date: draft.date,
    name: draft.name,
    value,
    unit: draft.unit,
    refLow,
    refHigh,
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

function LabDialog({
  item,
  visits,
  units,
  onClose,
  onSaved,
}: {
  item: LabResult | null;
  visits: Visit[];
  /** Units already used, to pick from. */
  units: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const [saving, setSaving] = useState(false);
  const write = useApiMutation<unknown, ApiRequest>(asRequest);
  const { notice, error, clear } = useNotice();
  // The test names used before, so a repeat test is picked, not typed again.
  const names = useApiQuery<{ names: { name: string }[] }>(
    apiKey(labsPath, 'names'),
    `${labsPath}/names`,
  );
  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  // The linked visit may be older than the recent ones offered.
  const options = visits.map((visit) => ({ id: visit.id, date: visit.date, clinic: visit.clinic }));
  if (item?.visit && !options.some((option) => option.id === item.visit!.id))
    options.unshift(item.visit);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter in a field submits too, while a save may already be on its way.
    if (saving) return;
    const body = readDraft(draft);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    clear();
    setSaving(true);
    try {
      const path = item ? `${labsPath}/${item.id}` : labsPath;
      await write.mutateAsync({ path, method: item ? 'PUT' : 'POST', body });
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
          <DialogTitle>{item ? 'Edit test result' : 'Add test result'}</DialogTitle>
          <DialogDescription>
            One value per result, for example total cholesterol. Leave the unit and the reference
            range blank if you do not know them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="lab-date" label="Test date">
              <Input
                id="lab-date"
                type="date"
                min={earliestDate}
                max={latestDate}
                value={draft.date}
                onChange={set('date')}
              />
            </Field>
            <Field id="lab-name" label="Test name">
              <Combobox
                id="lab-name"
                autoComplete="off"
                value={draft.name}
                onValueChange={(name) => setDraft((current) => ({ ...current, name }))}
                options={usedValues(names.data?.names.map((entry) => entry.name) ?? [])}
                listLabel="Tests already recorded"
              />
            </Field>
            <Field id="lab-value" label="Result">
              <Input
                id="lab-value"
                inputMode="decimal"
                autoComplete="off"
                value={draft.value}
                onChange={set('value')}
              />
            </Field>
            <Field id="lab-unit" label="Unit">
              <Combobox
                id="lab-unit"
                autoComplete="off"
                value={draft.unit}
                onValueChange={(unit) => setDraft((current) => ({ ...current, unit }))}
                options={units}
                listLabel="Units already used"
              />
            </Field>
            <Field id="lab-low" label="Reference minimum">
              <Input
                id="lab-low"
                inputMode="decimal"
                autoComplete="off"
                value={draft.refLow}
                onChange={set('refLow')}
              />
            </Field>
            <Field id="lab-high" label="Reference maximum">
              <Input
                id="lab-high"
                inputMode="decimal"
                autoComplete="off"
                value={draft.refHigh}
                onChange={set('refHigh')}
              />
            </Field>
          </div>
          <Field id="lab-visit" label="Clinic visit">
            <select
              id="lab-visit"
              className={`${fieldClass} h-9 pointer-coarse:min-h-11`}
              value={draft.visitId}
              onChange={set('visitId')}
            >
              <option value="">Not linked</option>
              {options.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {[option.date, option.clinic].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field id="lab-note" label="Note">
            <textarea
              id="lab-note"
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
              aria-disabled={saving || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (!saving) onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              // aria-disabled, not disabled: a disabled button drops keyboard focus to the page.
              aria-disabled={saving || undefined}
              aria-busy={saving || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const statusText = { low: 'Below range', normal: 'In range', high: 'Above range' } as const;

function LabCard({
  item,
  onEdit,
  onDelete,
}: {
  item: LabResult;
  onEdit: (opener: HTMLElement) => void;
  onDelete: () => Promise<unknown>;
}) {
  const range = rangeText(item);
  const status = rangeStatus(item);
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h3" className="wrap-anywhere">
          {item.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{item.date}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        <p className="wrap-anywhere">
          <strong>{valueText(item)}</strong>
          {status ? <span className="ml-2 text-muted-foreground">{statusText[status]}</span> : null}
        </p>
        {range ? <p className="text-muted-foreground">{range}</p> : null}
        {item.visit ? (
          <p className="wrap-anywhere text-muted-foreground">
            {item.visit.date} {item.visit.clinic}
          </p>
        ) : null}
        {item.note ? <p className="wrap-anywhere whitespace-pre-line">{item.note}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="Delete this test result?"
            description="This cannot be undone. The linked clinic visit stays."
            onConfirm={onDelete}
            trigger={
              <Button variant="outline" size="sm" aria-label={`Delete ${item.name} ${item.date}`}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${item.name} ${item.date}`}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LabsPage() {
  const remover = useApiMutation<unknown, ApiRequest>(asRequest);
  const client = useQueryClient();
  const [words, setWords] = useState('');
  const [search, setSearch] = useState('');
  // Under apiKey(labsPath), so one invalidation after a write refreshes the list.
  const query = useInfiniteQuery<Page, RequestError, { pages: Page[] }, readonly unknown[], number>(
    {
      queryKey: apiKey(labsPath, 'list', search),
      initialPageParam: 0,
      queryFn: ({ pageParam, signal }) =>
        requestJson<Page>(`${labsPath}?q=${encodeURIComponent(search)}&offset=${pageParam}`, {
          signal,
        }),
      getNextPageParam: (last, pages) =>
        last.more ? pages.reduce((count, page) => count + page.results.length, 0) : undefined,
    },
  );
  const results = query.data?.pages.flatMap((page) => page.results) ?? null;
  const recent = useApiQuery<{ visits: Visit[] }>(recentVisitsKey, visitsPath);
  const visits = recent.data?.visits ?? [];
  // null: closed. Otherwise the result being edited (null for a new one).
  const [editing, setEditing] = useState<{ item: LabResult | null } | null>(null);
  const { notice: said, clear } = useNotice();
  const failed =
    query.isError && !query.isFetching
      ? ({ kind: 'error', text: errorText(query.error) } as const)
      : undefined;
  const notice = failed ?? said;
  const heading = useRef<HTMLHeadingElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const [moveFocus, setMoveFocus] = useState(0);

  // A deleted result takes its buttons with it, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const reload = () => {
    clear();
    void client.invalidateQueries({ queryKey: apiKey(labsPath) });
  };

  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  const remove = async (item: LabResult) => {
    try {
      await remover.mutateAsync({ path: `${labsPath}/${item.id}`, method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
    setMoveFocus((count) => count + 1);
    reload();
  };

  const more = query.hasNextPage;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          id="page-title"
          ref={heading}
          tabIndex={-1}
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Lab results
        </h1>
        <p className="text-body text-muted-foreground">
          Keep checkup and blood test values with their unit and reference range, newest first.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <Button
          onClick={(event) => {
            remember(event.currentTarget);
            setEditing({ item: null });
          }}
        >
          <Plus aria-hidden />
          Add test result
        </Button>
        <form
          role="search"
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(words.trim());
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="lab-search">Search by test name</Label>
            <Input
              id="lab-search"
              autoComplete="off"
              maxLength={100}
              value={words}
              onChange={(event) => setWords(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>
      <LabTrendCard />
      <Notice notice={notice} />
      {notice?.kind === 'error' ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            void query.refetch();
            setMoveFocus((count) => count + 1);
          }}
        >
          Try again
        </Button>
      ) : null}
      {results === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {results && !results.length ? (
        <p className="text-body-sm text-muted-foreground">
          {search ? 'No test result matches this search.' : 'No test results recorded yet.'}
        </p>
      ) : null}
      {results?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((item) => (
            <LabCard
              key={item.id}
              item={item}
              onEdit={(opener) => {
                remember(opener);
                setEditing({ item });
              }}
              onDelete={() => remove(item)}
            />
          ))}
        </div>
      ) : null}
      {results?.length && more ? (
        <Button
          variant="outline"
          className="self-start"
          aria-disabled={query.isFetchingNextPage || undefined}
          onClick={() => {
            if (!query.isFetchingNextPage) void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      ) : null}
      {editing ? (
        <LabDialog
          item={editing.item}
          visits={visits}
          units={usedValues(results?.map((result) => result.unit) ?? [], [
            'mg/dL',
            'mmol/L',
            'g/dL',
            'U/L',
            '%',
          ])}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('Saved');
            reload();
          }}
        />
      ) : null}
    </section>
  );
}
