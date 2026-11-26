import { Plus, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from './components/ui/button';
import { Combobox } from './components/ui/combobox';
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
import { earliestDate, latestDate } from './daily-date';
import { type ApiRequest, useApiMutation } from './lib/query';
import { useNotice } from './lib/use-notice';
import { type Draft, draftOf, type ProcedureDraft, procedureDraft, readDraft } from './visit-form';
import { maxProcedures, type Visit, visitsPath } from './visit-text';
import { asRequest } from './writes';

/** Reads a typed value; one per field, so every input shares the same change handler shape. */
type OnText = (event: { target: { value: string } }) => void;
type DraftField = Exclude<keyof Draft, 'procedures'>;
type ProcedureField = Exclude<keyof ProcedureDraft, 'key'>;

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

/** The visit's own fields: dates, clinic, department, cost and the note. */
/** Clinics and departments already used, to pick from. */
export type VisitChoices = { clinics: string[]; departments: string[] };

function VisitFields({
  draft,
  set,
  setValue,
  used,
}: {
  draft: Draft;
  set: (key: DraftField) => OnText;
  setValue: (key: DraftField, value: string) => void;
  used: VisitChoices;
}) {
  return (
    <>
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
          <Combobox
            id="visit-clinic"
            autoComplete="off"
            value={draft.clinic}
            onValueChange={(value) => setValue('clinic', value)}
            options={used.clinics}
            listLabel="Clinics already used"
          />
        </Field>
        <Field id="visit-department" label="Department">
          <Combobox
            id="visit-department"
            autoComplete="off"
            value={draft.department}
            onValueChange={(value) => setValue('department', value)}
            options={used.departments}
            listLabel="Departments already used"
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
    </>
  );
}

/** One procedure row with its remove button. */
function ProcedureRow({
  item,
  label,
  set,
  onRemove,
}: {
  item: ProcedureDraft;
  label: string;
  set: (key: ProcedureField) => OnText;
  onRemove: () => void;
}) {
  const id = (field: string) => `procedure-${item.key}-${field}`;
  return (
    <li className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-medium">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id('name')} label={`${label} name`}>
          <Input id={id('name')} autoComplete="off" value={item.name} onChange={set('name')} />
        </Field>
        <Field id={id('area')} label={`${label} area`}>
          <Input id={id('area')} autoComplete="off" value={item.area} onChange={set('area')} />
        </Field>
        <Field id={id('amount')} label={`${label} dose or count`}>
          <Input
            id={id('amount')}
            autoComplete="off"
            value={item.amount}
            onChange={set('amount')}
          />
        </Field>
        <Field id={id('cost')} label={`${label} cost (₩)`}>
          <Input
            id={id('cost')}
            inputMode="numeric"
            autoComplete="off"
            value={item.cost}
            onChange={set('cost')}
          />
        </Field>
      </div>
      <Field id={id('note')} label={`${label} note`}>
        <Input id={id('note')} autoComplete="off" value={item.note} onChange={set('note')} />
      </Field>
    </li>
  );
}

/** The procedure rows, with adding and removing that keep keyboard focus in the dialog. */
function ProcedureList({
  procedures,
  onChange,
}: {
  procedures: ProcedureDraft[];
  onChange: (update: (current: ProcedureDraft[]) => ProcedureDraft[]) => void;
}) {
  const full = procedures.length >= maxProcedures;
  // Where focus goes after the rows change: the new row's name, or the add button when the
  // pressed remove button has gone with its row.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  const setProcedure =
    (procedureKey: number) =>
    (key: ProcedureField): OnText =>
    (event) =>
      onChange((current) =>
        current.map((item) =>
          item.key === procedureKey ? { ...item, [key]: event.target.value } : item,
        ),
      );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-2 text-body-sm font-medium">Procedures</legend>
      {procedures.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">No procedures recorded.</p>
      ) : null}
      <ol aria-label="Procedure list" className="flex flex-col gap-3">
        {procedures.map((item, index) => (
          <ProcedureRow
            key={item.key}
            item={item}
            label={`Procedure ${index + 1}`}
            set={setProcedure(item.key)}
            onRemove={() => {
              focusNext.current = 'procedure-add';
              onChange((current) => current.filter((other) => other.key !== item.key));
            }}
          />
        ))}
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
          onChange((current) => [...current, added]);
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
  );
}

/** Cancel and Save; both keep focus while a save is on its way (#98). */
function DialogActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        // Keeps focus while busy, like Save (#98).
        aria-disabled={saving || undefined}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => {
          if (!saving) onCancel();
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
  );
}

/** Records a new clinic visit (`visit` null) or edits one, and saves it. */
export function VisitDialog({
  visit,
  date,
  used,
  onClose,
  onSaved,
}: {
  visit: Visit | null;
  date: string;
  used: VisitChoices;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(visit, date));
  const [saving, setSaving] = useState(false);
  const write = useApiMutation<unknown, ApiRequest>(asRequest);
  const { notice, error, clear } = useNotice();
  const set =
    (key: DraftField): OnText =>
    (event) =>
      setDraft((current) => ({ ...current, [key]: event.target.value }));

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
      await write.mutateAsync({ path, method: visit ? 'PUT' : 'POST', body });
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
          <VisitFields
            draft={draft}
            set={set}
            setValue={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
            used={used}
          />
          <ProcedureList
            procedures={draft.procedures}
            onChange={(update) =>
              setDraft((current) => ({ ...current, procedures: update(current.procedures) }))
            }
          />
          <Notice notice={notice} />
          <DialogActions saving={saving} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
