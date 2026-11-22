import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';

import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { serviceToday } from './daily-date';
import {
  bodyOf,
  emptyForm,
  fillFromLabel,
  type Food,
  type Form,
  formOf,
  nutrients,
  sourceLabels,
  type SourceType,
  unreadableField,
} from './food-form';
import { apiKey, type ApiRequest, useApiMutation } from './lib/query';
import { useNotice } from './lib/use-notice';
import { unreadableAmount } from './number-input';
import { isCoupangUrl, readNutritionLabel } from './nutrition-label';
import { asRequest } from './writes';

type Change = (key: keyof Form) => (event: { target: { value: string } }) => void;
type Assign = (change: Partial<Form>) => void;

/**
 * A food's name, brand or values show in the meal cards, the combos and the recent foods, which read
 * through React Query; they read again the next time they are shown (#282).
 */
function foodChanged(client: QueryClient) {
  void client.invalidateQueries({
    predicate: ({ queryKey: [path] }) => typeof path === 'string' && path.startsWith('/api/meals/'),
  });
  void client.invalidateQueries({ queryKey: apiKey('/api/combos') });
  void client.invalidateQueries({ queryKey: apiKey('/api/foods/recent') });
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** The pasted table, the button that reads it, and what the reading did. */
function LabelReader({
  form,
  locked,
  onFill,
}: {
  form: Form;
  locked: boolean;
  onFill: (form: Form) => void;
}) {
  const [pasted, setPasted] = useState('');
  // `reads` counts presses: a new key remounts the message, so the same result is read out again.
  const [filled, setFilled] = useState<{
    kind: 'status' | 'error';
    lines: string[];
    reads: number;
  } | null>(null);

  const fill = () => {
    const result = fillFromLabel(form, readNutritionLabel(pasted), serviceToday());
    if (result.kind === 'status') onFill(result.form);
    setFilled({ kind: result.kind, lines: result.lines, reads: (filled?.reads ?? 0) + 1 });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="food-label-text">Paste a nutrition table</Label>
      <textarea
        id="food-label-text"
        aria-describedby="food-label-text-help"
        rows={4}
        readOnly={locked}
        value={pasted}
        onChange={(event) => {
          setPasted(event.target.value);
          // "Not found" no longer describes the new text.
          setFilled((current) => (current?.kind === 'error' ? null : current));
        }}
        className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-body-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        placeholder={'e.g. 100g당 250kcal\n나트륨 300mg 탄수화물 30g …'}
      />
      <p id="food-label-text-help" className="text-caption break-keep text-muted-foreground">
        Copy the nutrition table text (in Korean, as on the product page) and paste it to fill the
        fields below. The app does not open the product page.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={locked}
        onClick={fill}
      >
        Read the table and fill in
      </Button>
      {filled ? (
        <div
          key={filled.reads}
          role={filled.kind === 'error' ? 'alert' : 'status'}
          className={`flex flex-col gap-1 text-body-sm break-keep ${filled.kind === 'error' ? 'text-destructive' : ''}`}
        >
          {filled.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Name, brand, category, serving and the nutrition values. */
function FoodFields({ form, locked, update }: { form: Form; locked: boolean; update: Change }) {
  return (
    <>
      <Field id="food-name" label="Food name">
        <Input id="food-name" readOnly={locked} value={form.name} onChange={update('name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="food-brand" label="Brand">
          <Input id="food-brand" readOnly={locked} value={form.brand} onChange={update('brand')} />
        </Field>
        <Field id="food-category" label="Category">
          <Input
            id="food-category"
            readOnly={locked}
            value={form.category}
            onChange={update('category')}
          />
        </Field>
        <Field id="food-serving-size" label="Serving size">
          <Input
            id="food-serving-size"
            inputMode="decimal"
            autoComplete="off"
            readOnly={locked}
            value={form.servingSize}
            onChange={update('servingSize')}
          />
        </Field>
        <Field id="food-serving-unit" label="Unit">
          <Input
            id="food-serving-unit"
            readOnly={locked}
            value={form.servingUnit}
            onChange={update('servingUnit')}
          />
        </Field>
        {nutrients.map(({ key, label, unit }) => (
          <Field key={key} id={`food-${key}`} label={`${label} (${unit})`}>
            <Input
              id={`food-${key}`}
              inputMode="decimal"
              autoComplete="off"
              readOnly={locked}
              value={form[key]}
              onChange={update(key)}
            />
          </Field>
        ))}
      </div>
    </>
  );
}

/** Where the values came from, and the junk food mark. */
function SourceFields({
  form,
  locked,
  update,
  set,
}: {
  form: Form;
  locked: boolean;
  update: Change;
  set: Assign;
}) {
  return (
    <>
      <Field id="food-source-type" label="Source type">
        <Select
          disabled={locked}
          value={form.sourceType}
          onValueChange={(value) => set({ sourceType: value as SourceType })}
        >
          <SelectTrigger id="food-source-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sourceLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="food-source-url" label="Source URL">
        <Input
          id="food-source-url"
          type="url"
          readOnly={locked}
          aria-describedby={isCoupangUrl(form.sourceUrl) ? 'food-source-url-help' : undefined}
          value={form.sourceUrl}
          onChange={update('sourceUrl')}
        />
        {/* #34: shop pages are never read by the app; the link only says where the values came from. */}
        {isCoupangUrl(form.sourceUrl) ? (
          <p id="food-source-url-help" className="text-caption break-keep text-muted-foreground">
            Coupang links are saved only as the source. The app does not open the page, so paste the
            nutrition table text above or enter the values by hand. If the table is only an image,
            enter them by hand.
          </p>
        ) : null}
      </Field>
      <Field id="food-checked-on" label="Verified date">
        <Input
          id="food-checked-on"
          type="date"
          readOnly={locked}
          value={form.checkedOn}
          onChange={update('checkedOn')}
        />
      </Field>
      {/* #38: counted in the meal card. A recorded meal keeps the mark it was recorded with. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="food-is-junk"
            disabled={locked}
            checked={form.isJunk}
            aria-describedby="food-is-junk-help"
            onCheckedChange={(checked) => set({ isJunk: checked === true })}
          />
          <Label htmlFor="food-is-junk">Junk food</Label>
        </div>
        <p id="food-is-junk-help" className="text-caption break-keep text-muted-foreground">
          Counts toward junk food times in the diet. Changing the flag leaves meals already recorded
          as they are.
        </p>
      </div>
    </>
  );
}

function Actions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        // Like Save, it keeps focus while busy: Safari does not move focus to a clicked button, so
        // focus may still be here when Save is pressed.
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
        // aria-disabled, not disabled: a disabled button drops keyboard focus to the page, and a
        // failed save would leave it there, outside the dialog (#98). The handler ignores presses.
        aria-disabled={saving || undefined}
        aria-busy={saving || undefined}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </DialogFooter>
  );
}

export function FoodDialog({
  food,
  onClose,
  onSaved,
}: {
  food: Food | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(food ? formOf(food) : emptyForm);
  const client = useQueryClient();
  // The other screens' data is marked stale on every answer, even one that lands after the dialog
  // is gone. Closing, and the page's own reload, run only for the latest save while the dialog is
  // still there (#302).
  const write = useApiMutation<Food, ApiRequest>(asRequest, {
    onSuccess: () => foodChanged(client),
  });
  const saving = write.isPending;
  const { notice, error, clear } = useNotice();
  const update: Change = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const set: Assign = (change) => setForm((current) => ({ ...current, ...change }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button stays pressable while saving, and Enter in a field submits too.
    if (saving) return;
    // Unreadable text like "49,5" must not be saved as no value or as 495.
    const unreadable = unreadableField(form);
    if (unreadable) {
      error(unreadableAmount(unreadable));
      return;
    }
    // Cleared first, so the same failure twice is announced again.
    clear();
    write.mutate(
      {
        path: food ? `/api/foods/${food.id}` : '/api/foods',
        method: food ? 'PUT' : 'POST',
        body: bodyOf(form),
      },
      { onSuccess: () => onSaved(), onError: (cause) => error(cause) },
    );
  };

  return (
    // Closing during a save would not cancel it, and its late reply would close whatever opened next.
    <Dialog open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{food ? 'Edit food' : 'Add food'}</DialogTitle>
          <DialogDescription>
            Nutrition values are per serving. Leave unknown values blank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {/* Read-only while saving: a change after Save would not be in the save on its way. */}
          <LabelReader form={form} locked={saving} onFill={setForm} />
          <FoodFields form={form} locked={saving} update={update} />
          <SourceFields form={form} locked={saving} update={update} set={set} />
          <Notice notice={notice} />
          <Actions saving={saving} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
