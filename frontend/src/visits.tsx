import { Pencil, Pill, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

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
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import {
  dailyRangeText,
  earliestDate,
  formatDate,
  inDailyRange,
  isValidDate,
  latestDate,
} from './daily-date';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { cn } from './lib/utils';
import { medicationsPagePath } from './med-text';
import { MoreFoodsButton } from './more-foods-button';
import { trackWrite } from './pending-writes';
import { useReturnFocus } from './return-focus';
import {
  clinicText,
  maxProcedures,
  parseWon,
  type Procedure,
  procedureText,
  type Visit,
  visitsPath,
  wonText,
} from './visit-text';

type ProcedureDraft = {
  key: number;
  name: string;
  area: string;
  amount: string;
  cost: string;
  note: string;
};
type Draft = {
  date: string;
  clinic: string;
  department: string;
  note: string;
  cost: string;
  nextVisitOn: string;
  procedures: ProcedureDraft[];
};

let nextKey = 1;
const procedureDraft = (item?: Procedure): ProcedureDraft => ({
  key: nextKey++,
  name: item?.name ?? '',
  area: item?.area ?? '',
  amount: item?.amount ?? '',
  cost: item?.cost?.toString() ?? '',
  note: item?.note ?? '',
});

const draftOf = (visit: Visit | null, date: string): Draft => ({
  date: visit?.date ?? date,
  clinic: visit?.clinic ?? '',
  department: visit?.department ?? '',
  note: visit?.note ?? '',
  cost: visit?.cost?.toString() ?? '',
  nextVisitOn: visit?.nextVisitOn ?? '',
  procedures: visit?.procedures.map(procedureDraft) ?? [],
});

const maxCost = 100_000_000;

/** The first field longer than the server takes, counted in characters as it counts them (#92). */
const tooLong = (fields: [string, string, number][]) => {
  const found = fields.find(([, value, max]) => charCount(value.trim()) > max);
  return found ? `${found[0]} must be ${found[2]} characters or fewer` : null;
};

/** A cost in won, or the reason it cannot be read. */
const readCost = (label: string, text: string) => {
  const value = parseWon(text);
  if (value === undefined) {
    return `${label}: enter whole won, for example 12000 or 12,000`;
  }
  if (value !== null && value > maxCost) return `${label} must be 100 million won or less`;
  return value;
};

/** The request body, or the first reason it cannot be sent. */
function readDraft(draft: Draft) {
  if (!isValidDate(draft.date)) return 'Choose a visit date';
  // The daily page opens only these days (#50); a visit outside them could never be seen there.
  if (!inDailyRange(draft.date)) return `Visit date: ${dailyRangeText}`;
  if (!draft.clinic.trim()) return 'Enter the clinic name';
  const long = tooLong([
    ['Clinic name', draft.clinic, 100],
    ['Department', draft.department, 50],
    ['Symptoms and diagnosis note', draft.note, 1000],
  ]);
  if (long) return long;
  const cost = readCost('Visit cost', draft.cost);
  if (typeof cost === 'string') return cost;
  if (draft.nextVisitOn && !isValidDate(draft.nextVisitOn))
    return 'The next appointment date is not valid';
  if (draft.nextVisitOn && !inDailyRange(draft.nextVisitOn))
    return `Next appointment: ${dailyRangeText}`;
  if (draft.nextVisitOn && draft.nextVisitOn < draft.date) {
    return 'The next appointment date cannot be before the visit date';
  }
  const procedures = [];
  for (const [index, item] of draft.procedures.entries()) {
    const label = `Procedure ${index + 1}`;
    if (!item.name.trim()) return `${label}: enter a name`;
    const itemLong = tooLong([
      [`${label} name`, item.name, 100],
      [`${label} area`, item.area, 50],
      [`${label} dose or count`, item.amount, 50],
      [`${label} note`, item.note, 500],
    ]);
    if (itemLong) return itemLong;
    const itemCost = readCost(`${label} cost`, item.cost);
    if (typeof itemCost === 'string') return itemCost;
    procedures.push({
      name: item.name,
      area: item.area,
      amount: item.amount,
      cost: itemCost,
      note: item.note,
    });
  }
  return {
    date: draft.date,
    clinic: draft.clinic,
    department: draft.department,
    note: draft.note,
    cost,
    nextVisitOn: draft.nextVisitOn || null,
    procedures,
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

// The same look as Input, for text that runs over a line.
const textareaClass =
  'min-h-20 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-body-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function VisitDialog({
  visit,
  date,
  onClose,
  onSaved,
}: {
  visit: Visit | null;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(visit, date));
  const [saving, setSaving] = useState(false);
  const { notice, error, clear } = useNotice();
  const set = (key: Exclude<keyof Draft, 'procedures'>) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  const setProcedure =
    (procedureKey: number, key: Exclude<keyof ProcedureDraft, 'key'>) =>
    (event: { target: { value: string } }) =>
      setDraft((current) => ({
        ...current,
        procedures: current.procedures.map((item) =>
          item.key === procedureKey ? { ...item, [key]: event.target.value } : item,
        ),
      }));
  const full = draft.procedures.length >= maxProcedures;
  // Where focus goes after the rows change: the new row's name, or the add button when the
  // pressed remove button has gone with its row.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

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
      const path = visit ? `${visitsPath}/${visit.id}` : visitsPath;
      await trackWrite(
        `${visitsPath}/`,
        requestJson<Visit>(path, { method: visit ? 'PUT' : 'POST', body }),
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
          <DialogTitle>{visit ? 'Edit clinic visit' : 'Record clinic visit'}</DialogTitle>
          <DialogDescription>Costs are in won. Leave unknown values blank.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="visit-date" label="Visit date">
              <Input
                id="visit-date"
                type="date"
                min={earliestDate}
                max={latestDate}
                value={draft.date}
                onChange={set('date')}
              />
            </Field>
            <Field id="visit-next" label="Next appointment">
              <Input
                id="visit-next"
                type="date"
                min={draft.date || earliestDate}
                max={latestDate}
                value={draft.nextVisitOn}
                onChange={set('nextVisitOn')}
              />
            </Field>
            <Field id="visit-clinic" label="Clinic name">
              <Input
                id="visit-clinic"
                autoComplete="off"
                value={draft.clinic}
                onChange={set('clinic')}
              />
            </Field>
            <Field id="visit-department" label="Department">
              <Input
                id="visit-department"
                autoComplete="off"
                value={draft.department}
                onChange={set('department')}
              />
            </Field>
            <Field id="visit-cost" label="Visit cost (₩)">
              <Input
                id="visit-cost"
                inputMode="numeric"
                autoComplete="off"
                value={draft.cost}
                onChange={set('cost')}
              />
            </Field>
          </div>
          <Field id="visit-note" label="Symptoms and diagnosis note">
            <textarea
              id="visit-note"
              className={textareaClass}
              value={draft.note}
              onChange={set('note')}
            />
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-2 text-body-sm font-medium">Procedures</legend>
            {draft.procedures.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">No procedures recorded.</p>
            ) : null}
            <ol aria-label="Procedure list" className="flex flex-col gap-3">
              {draft.procedures.map((item, index) => {
                const id = (field: string) => `procedure-${item.key}-${field}`;
                const label = `Procedure ${index + 1}`;
                return (
                  <li key={item.key} className="flex flex-col gap-3 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-sm font-medium">{label}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${label}`}
                        onClick={() => {
                          focusNext.current = 'procedure-add';
                          setDraft((current) => ({
                            ...current,
                            procedures: current.procedures.filter(
                              (other) => other.key !== item.key,
                            ),
                          }));
                        }}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id={id('name')} label={`${label} name`}>
                        <Input
                          id={id('name')}
                          autoComplete="off"
                          value={item.name}
                          onChange={setProcedure(item.key, 'name')}
                        />
                      </Field>
                      <Field id={id('area')} label={`${label} area`}>
                        <Input
                          id={id('area')}
                          autoComplete="off"
                          value={item.area}
                          onChange={setProcedure(item.key, 'area')}
                        />
                      </Field>
                      <Field id={id('amount')} label={`${label} dose or count`}>
                        <Input
                          id={id('amount')}
                          autoComplete="off"
                          value={item.amount}
                          onChange={setProcedure(item.key, 'amount')}
                        />
                      </Field>
                      <Field id={id('cost')} label={`${label} cost (₩)`}>
                        <Input
                          id={id('cost')}
                          inputMode="numeric"
                          autoComplete="off"
                          value={item.cost}
                          onChange={setProcedure(item.key, 'cost')}
                        />
                      </Field>
                    </div>
                    <Field id={id('note')} label={`${label} note`}>
                      <Input
                        id={id('note')}
                        autoComplete="off"
                        value={item.note}
                        onChange={setProcedure(item.key, 'note')}
                      />
                    </Field>
                  </li>
                );
              })}
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="procedure-add"
              className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              // aria-disabled, not disabled: adding the tenth row must not drop focus to the page.
              aria-disabled={full || undefined}
              onClick={() => {
                if (full) return;
                const added = procedureDraft();
                focusNext.current = `procedure-${added.key}-name`;
                setDraft((current) => ({ ...current, procedures: [...current.procedures, added] }));
              }}
            >
              <Plus aria-hidden />
              Add procedure
            </Button>
            {full ? (
              <p className="text-body-sm text-muted-foreground">
                You can record up to {maxProcedures} procedures per visit.
              </p>
            ) : null}
          </fieldset>
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
              Cancel
            </Button>
            <Button
              type="submit"
              // aria-disabled, not disabled: a disabled button drops keyboard focus to the page (#98).
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

function VisitCard({
  visit,
  onEdit,
  onDelete,
}: {
  visit: Visit;
  onEdit: (opener: HTMLElement) => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="wrap-anywhere">
          {clinicText(visit)}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{formatDate(visit.date)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {visit.cost !== null ? (
            <>
              <dt className="text-muted-foreground">Visit cost</dt>
              <dd>{wonText(visit.cost)}</dd>
            </>
          ) : null}
          {visit.nextVisitOn ? (
            <>
              <dt className="text-muted-foreground">Next appointment</dt>
              <dd>{formatDate(visit.nextVisitOn)}</dd>
            </>
          ) : null}
          {visit.note ? (
            <>
              <dt className="text-muted-foreground">Note</dt>
              <dd className="wrap-anywhere whitespace-pre-line">{visit.note}</dd>
            </>
          ) : null}
        </dl>
        {visit.procedures.length ? (
          <ul aria-label="Procedures" className="flex flex-col gap-1">
            {visit.procedures.map((item, index) => (
              <li key={index} className="wrap-anywhere">
                {procedureText(item)}
                {item.note ? (
                  <span className="block text-muted-foreground">{item.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="Delete this clinic visit?"
            description="The procedures of this visit are deleted with it. This cannot be undone."
            onConfirm={onDelete}
            trigger={
              <Button
                variant="outline"
                size="sm"
                aria-label={`Delete ${visit.date} ${visit.clinic}`}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            }
          />
          <Button asChild variant="outline" size="sm">
            {/* Records what was prescribed here, linked to this visit (#40). */}
            <Link
              to={`${medicationsPagePath}?visit=${visit.id}&date=${visit.date}`}
              aria-label={`${visit.date} ${visit.clinic} prescribed medication records`}
            >
              <Pill aria-hidden />
              Prescribed medication
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${visit.date} ${visit.clinic}`}
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

type Page = { visits: Visit[]; more: boolean };

/** `today` is undefined while the server is still being asked, and null if it could not say. */
export function VisitsPage({ today }: { today: string | null | undefined }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const applied = useRef('');
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // While a search or a reload runs, the next page would be read for the list being replaced.
  const [searching, setSearching] = useState(false);
  // null: closed. Otherwise the visit being edited (null for a new one) and the date it starts on.
  const [editing, setEditing] = useState<{ visit: Visit | null; date: string } | null>(null);
  const { notice, error, clear } = useNotice();
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const latest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<HTMLParagraphElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const [moveFocus, setMoveFocus] = useState(0);

  // A deleted visit takes its buttons with it, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  const load = useCallback(
    async (words: string) => {
      // A slow older answer must not overwrite a newer one.
      const request = ++latest.current;
      clearPage();
      setSearching(true);
      try {
        const page = await requestJson<Page>(`${visitsPath}?q=${encodeURIComponent(words)}`);
        if (request !== latest.current) return;
        applied.current = words;
        clear();
        setVisits(page.visits);
        setMore(page.more);
      } catch (cause) {
        if (request === latest.current) error(cause);
      } finally {
        if (request === latest.current) setSearching(false);
      }
    },
    [clear, clearPage, error],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  // The daily page links here with ?new=<date> to record a visit on that day.
  const asked = params.get('new');
  useEffect(() => {
    if (asked === null) return;
    const inRange = isValidDate(asked) && inDailyRange(asked);
    // Without a usable date, wait for the server's today rather than open on a blank one.
    // If the server cannot say, open anyway and let the date be picked.
    if (!inRange && today === undefined) return;
    setParams({}, { replace: true });
    setEditing({ visit: null, date: inRange ? asked : (today ?? '') });
  }, [asked, setParams, today]);

  const loadMore = async () => {
    const request = latest.current;
    setLoadingMore(true);
    clearPage();
    try {
      const page = await requestJson<Page>(
        `${visitsPath}?q=${encodeURIComponent(applied.current)}&offset=${visits?.length ?? 0}`,
      );
      if (request !== latest.current) return false;
      setVisits((current) => [...(current ?? []), ...page.visits]);
      setMore(page.more);
      return !page.more;
    } catch (cause) {
      if (request === latest.current) pageError(cause);
      return false;
    } finally {
      setLoadingMore(false);
    }
  };

  const openDialog = (opener: HTMLElement | null, visit: Visit | null) => {
    if (opener) remember(opener);
    setEditing({ visit, date: visit?.date ?? today ?? '' });
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  const remove = async (visit: Visit) => {
    try {
      await trackWrite(
        `${visitsPath}/`,
        requestJson(`${visitsPath}/${visit.id}`, { method: 'DELETE' }),
      );
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
    // Dropped now, so its delete button is not what the closing dialog hands focus back to.
    setVisits((list) => list?.filter((item) => item.id !== visit.id) ?? list);
    setMoveFocus((count) => count + 1);
    void load(applied.current);
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
          Clinic
        </h1>
        <p className="text-body text-muted-foreground">
          Record clinic visits and the procedures you had, and look them up again.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          // A row of its own on a phone: beside the add button the field cut its hint short (#131).
          className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query.trim());
          }}
        >
          <Input
            type="search"
            aria-label="Search clinic records"
            placeholder="Clinic or procedure name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={(event) => openDialog(event.currentTarget, null)}>
          <Plus aria-hidden />
          Visit records
        </Button>
      </div>
      <Notice notice={notice} />
      {visits === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {visits?.length === 0 ? (
        <EmptyState
          title={applied.current ? 'No matching records' : 'No clinic records'}
          description={
            applied.current ? 'Try a different search term.' : 'Record your first clinic visit.'
          }
        />
      ) : null}
      {visits?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {visits.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              onEdit={(opener) => openDialog(opener, visit)}
              onDelete={() => remove(visit)}
            />
          ))}
        </div>
      ) : null}
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p
        ref={shown}
        role="status"
        tabIndex={-1}
        className={cn(
          'rounded-sm text-body-sm text-muted-foreground outline-none empty:hidden',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        {visits?.length
          ? more
            ? `Showing ${visits.length} visits. There are more.`
            : `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}`
          : null}
      </p>
      {visits?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={pageNotice} />
      {editing ? (
        <VisitDialog
          visit={editing.visit}
          date={editing.date}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('Saved');
            void load(applied.current);
          }}
        />
      ) : null}
    </section>
  );
}
