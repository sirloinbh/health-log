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
import {
  dailyRangeText,
  earliestDate,
  inDailyRange,
  isValidDate,
  latestDate,
  serviceToday,
} from './daily-date';
import { RequestError, requestJson } from './lib/api';
import { type ApiRequest, useApiMutation } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import {
  howText,
  type Medication,
  type MedicationLists,
  medicationsPath,
  periodText,
} from './med-text';
import { useReturnFocus } from './return-focus';
import { type Visit, visitsPath } from './visit-text';
import { asRequest } from './writes';

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
  if (!draft.name.trim()) return 'Enter the medication name';
  const long = (
    [
      ['Medication name', draft.name, 100],
      ['Dose', draft.dose, 50],
      ['Directions', draft.directions, 100],
      ['Note', draft.note, 500],
    ] as const
  ).find(([, value, max]) => charCount(value.trim()) > max);
  if (long) return `${long[0]} must be ${long[2]} characters or fewer`;
  if (!isValidDate(draft.startOn)) return 'Choose a start date';
  // The daily page opens only these days (#50).
  if (!inDailyRange(draft.startOn)) return `Start date: ${dailyRangeText}`;
  if (draft.endOn && !isValidDate(draft.endOn)) return 'The end date is not valid';
  if (draft.endOn && !inDailyRange(draft.endOn)) return `End date: ${dailyRangeText}`;
  if (draft.endOn && draft.endOn < draft.startOn)
    return 'The end date cannot be before the start date';
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

/** Where a new medicine starts. `fromDevice`: the date is this device's, as the server could not say. */
type Start = { date: string; visitId: string; visitDate?: string; fromDevice?: boolean };

// The server's today, or this device's when the server could not say.
const startDate = (today: string | null | undefined): Pick<Start, 'date' | 'fromDevice'> =>
  today ? { date: today } : { date: serviceToday(), fromDevice: true };

function MedicationDialog({
  item,
  start,
  visits,
  onClose,
  onSaved,
}: {
  item: Medication | null;
  start: Start;
  visits: Visit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item, start));
  const [saving, setSaving] = useState(false);
  const write = useApiMutation<unknown, ApiRequest>(asRequest);
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
      clinic: 'Selected visit',
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
          <DialogTitle>{item ? 'Edit medication record' : 'Add medication'}</DialogTitle>
          <DialogDescription>
            Leave the end date blank to count it as a medication you still take. Leave unknown
            values blank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <Field id="med-name" label="Medication name">
            <Input id="med-name" autoComplete="off" value={draft.name} onChange={set('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="med-dose" label="Dose">
              <Input id="med-dose" autoComplete="off" value={draft.dose} onChange={set('dose')} />
            </Field>
            <Field id="med-directions" label="Directions">
              <Input
                id="med-directions"
                autoComplete="off"
                value={draft.directions}
                onChange={set('directions')}
              />
            </Field>
            <Field id="med-start" label="Start date">
              <Input
                id="med-start"
                type="date"
                min={earliestDate}
                max={latestDate}
                aria-describedby={!item && start.fromDevice ? 'med-start-note' : undefined}
                value={draft.startOn}
                onChange={set('startOn')}
              />
              {!item && start.fromDevice ? (
                <p id="med-start-note" className="text-caption text-muted-foreground">
                  The server's date could not be checked, so this is today on this device. Check it
                  before saving.
                </p>
              ) : null}
            </Field>
            <Field id="med-end" label="End date">
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
          <Field id="med-visit" label="Prescribing clinic visit">
            <select
              id="med-visit"
              className={`${fieldClass} h-9 pointer-coarse:min-h-11`}
              value={draft.visitId}
              onChange={set('visitId')}
            >
              <option value="">Not linked (bought without a prescription)</option>
              {options.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {[option.date, option.clinic].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field id="med-note" label="Note">
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
            {item.visit.date} {item.visit.clinic} prescription
          </p>
        ) : null}
        {item.note ? <p className="wrap-anywhere whitespace-pre-line">{item.note}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="Delete this medication record?"
            description="This cannot be undone. The linked clinic visit stays."
            onConfirm={onDelete}
            trigger={
              <Button variant="outline" size="sm" aria-label={`Delete ${item.name}`}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${item.name}`}
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

const sections = [
  { key: 'current', title: 'Taking now', empty: 'No medication is being taken now.' },
  { key: 'upcoming', title: 'Starting soon', empty: null },
  { key: 'past', title: 'Past medication', empty: 'No finished medication.' },
] as const;

/** `today` is undefined while the server is still being asked, and null if it could not say. */
export function MedicationsPage({ today }: { today: string | null | undefined }) {
  const remover = useApiMutation<unknown, ApiRequest>(asRequest);
  const [params, setParams] = useSearchParams();
  const [lists, setLists] = useState<MedicationLists | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  // null: closed. Otherwise the medicine being edited (null for a new one) and where it starts.
  const [editing, setEditing] = useState<{ item: Medication | null; start: Start } | null>(null);
  const { notice, status, error, clear } = useNotice();
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

  /** `done`: what to say once the list is in, for a load the person asked for. */
  const load = useCallback(
    async (done?: string) => {
      // A slow older answer must not overwrite a newer one.
      const request = ++latest.current;
      try {
        const data = await requestJson<MedicationLists>(medicationsPath);
        if (request !== latest.current) return;
        if (done) status(done);
        else clear();
        setLists(data);
      } catch (cause) {
        if (request === latest.current) error(cause);
      }
    },
    [clear, error, status],
  );

  // The recent visits offered as where a medicine was prescribed; without them it can still be saved.
  const loadVisits = useCallback(() => {
    requestJson<{ visits: Visit[] }>(visitsPath)
      .then((data) => setVisits(data.visits))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
    loadVisits();
  }, [load, loadVisits]);

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
        ...(inRange ? { date: askedDate } : startDate(today)),
        visitId: /^[1-9]\d*$/.test(askedVisit) ? askedVisit : '',
        visitDate: inRange ? askedDate : undefined,
      },
    });
  }, [askedDate, askedVisit, setParams, today]);

  // A new medicine starts on the server's today, so adding waits until it is known (#204).
  const waitingForToday = today === undefined;
  const openDialog = (opener: HTMLElement, item: Medication | null) => {
    if (!item && waitingForToday) return;
    remember(opener);
    setEditing({ item, start: { ...startDate(today), visitId: '' } });
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  const remove = async (item: Medication) => {
    try {
      await remover.mutateAsync({ path: `${medicationsPath}/${item.id}`, method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
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
          Medication
        </h1>
        <p className="text-body text-muted-foreground">
          Record medications you were prescribed or bought and how long you take them. Current and
          past medications are split as of today
          {lists ? ` (${lists.today})` : ''}.
        </p>
      </header>
      <div>
        <Button
          // aria-disabled, not disabled: the button keeps focus while the date is on its way (#98).
          aria-disabled={waitingForToday || undefined}
          aria-describedby={waitingForToday ? 'med-add-wait' : undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onClick={(event) => openDialog(event.currentTarget, null)}
        >
          <Plus aria-hidden />
          Add medication
        </Button>
        {/* Read out only: a line that shows for a moment on every visit would shift the lists. */}
        {waitingForToday ? (
          <span id="med-add-wait" className="sr-only">
            Checking today's date…
          </span>
        ) : null}
      </div>
      <Notice notice={notice} />
      {notice?.kind === 'error' ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            // A word in its place: the same failure twice is announced again, and a list already
            // on screen does not look fixed while the new one is on its way.
            status('Reloading the list…');
            void load('The list was reloaded.');
            loadVisits();
            // Trying again removes this button, which would drop keyboard focus to the page (#65, #127).
            setMoveFocus((count) => count + 1);
          }}
        >
          Try again
        </Button>
      ) : null}
      {lists === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
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
            toast.success('Saved');
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
