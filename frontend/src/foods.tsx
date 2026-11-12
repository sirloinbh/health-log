import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { toast } from './components/ui/sonner';
import { useFoodSearch } from './food-search';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { MoreFoodsButton } from './more-foods-button';
import { parseAmount, unreadableAmount } from './number-input';
import { isCoupangUrl, packageText, readNutritionLabel } from './nutrition-label';
import { useReturnFocus } from './return-focus';

const nutrients = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
] as const;

const sourceLabels = {
  official: 'Official data',
  public: 'Public data',
  label: 'Product label',
  estimate: 'Estimate',
  manual: 'Manual entry',
} as const;

type NutrientKey = (typeof nutrients)[number]['key'];
type SourceType = keyof typeof sourceLabels;

type Food = Record<NutrientKey, number | null> & {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  servingSize: number;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  checkedOn: string | null;
  isJunk: boolean;
};

type Form = Record<NutrientKey, string> & {
  name: string;
  brand: string;
  category: string;
  servingSize: string;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string;
  checkedOn: string;
  isJunk: boolean;
};

const emptyForm: Form = {
  name: '',
  brand: '',
  category: '',
  servingSize: '',
  servingUnit: 'g',
  calories: '',
  carbs: '',
  protein: '',
  fat: '',
  sugars: '',
  sodium: '',
  sourceType: 'manual',
  sourceUrl: '',
  checkedOn: '',
  isJunk: false,
};

const formOf = (food: Food): Form => ({
  name: food.name,
  brand: food.brand ?? '',
  category: food.category ?? '',
  servingSize: String(food.servingSize),
  servingUnit: food.servingUnit,
  calories: food.calories?.toString() ?? '',
  carbs: food.carbs?.toString() ?? '',
  protein: food.protein?.toString() ?? '',
  fat: food.fat?.toString() ?? '',
  sugars: food.sugars?.toString() ?? '',
  sodium: food.sodium?.toString() ?? '',
  sourceType: food.sourceType,
  sourceUrl: food.sourceUrl ?? '',
  checkedOn: food.checkedOn ?? '',
  isJunk: food.isJunk,
});

const textOrNull = (value: string) => value.trim() || null;

const numberFields = [
  { key: 'servingSize', label: 'Serving size' },
  ...nutrients.map(({ key, label, unit }) => ({ key, label: `${label} (${unit})` })),
] as const;

const bodyOf = (form: Form) => ({
  name: form.name,
  brand: textOrNull(form.brand),
  category: textOrNull(form.category),
  servingSize: parseAmount(form.servingSize),
  servingUnit: form.servingUnit,
  calories: parseAmount(form.calories),
  carbs: parseAmount(form.carbs),
  protein: parseAmount(form.protein),
  fat: parseAmount(form.fat),
  sugars: parseAmount(form.sugars),
  sodium: parseAmount(form.sodium),
  sourceType: form.sourceType,
  sourceUrl: textOrNull(form.sourceUrl),
  checkedOn: textOrNull(form.checkedOn),
  isJunk: form.isJunk,
});

// The checked date of a label read now, as a day in the service time zone.
const serviceToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

// The server and database only store http(s) addresses; a link must never run script regardless.
const isSafeLink = (url: string) => /^https?:\/\//i.test(url);

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function FoodDialog({
  food,
  onClose,
  onSaved,
}: {
  food: Food | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(food ? formOf(food) : emptyForm);
  const [saving, setSaving] = useState(false);
  const { notice, error, clear } = useNotice();
  const [pasted, setPasted] = useState('');
  // `reads` counts presses: a new key remounts the message, so the same result is read out again.
  const [filled, setFilled] = useState<{
    kind: 'status' | 'error';
    lines: string[];
    reads: number;
  } | null>(null);
  const update = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  // Fills the form only; nothing is saved until Save is pressed, so the person checks it first.
  const fill = () => {
    const reading = readNutritionLabel(pasted);
    const reads = (filled?.reads ?? 0) + 1;
    const found = nutrients.filter(({ key }) => reading.values[key] !== undefined);
    // No value read: a basis alone would clear every field for nothing, so nothing changes.
    if (found.length === 0) {
      setFilled({
        kind: 'error',
        reads,
        lines: [
          reading.basis
            ? `Found the basis amount (${reading.basis.size}${reading.basis.unit}) but could not read the nutrition values, so no field was changed.`
            : 'Could not find a nutrition table. Only tables in text can be read.',
          'If the table is only an image or its layout differs, enter the values by hand.',
        ],
      });
      return;
    }
    // Values without the amount they are for would sit next to a serving size from somewhere else,
    // such as an official source's (#120). They are shown so they can be typed in with the size.
    if (!reading.basis) {
      const units = Object.fromEntries(nutrients.map(({ key, unit }) => [key, unit]));
      setFilled({
        kind: 'error',
        reads,
        lines: [
          'Could not find the serving size, so no field was changed. It is not clear what amount the values are for.',
          `Values read: ${found.map(({ key, label }) => `${label} ${reading.values[key]}${units[key]}`).join(', ')}`,
          'Check the serving size and enter it by hand.',
        ],
      });
      return;
    }
    const labelOf = (key: NutrientKey) => nutrients.find((nutrient) => nutrient.key === key)!.label;
    const emptied = [...reading.lessThan, ...reading.outOfRange];
    const { basis } = reading;
    // A new basis makes every old value wrong, so what the table leaves out is cleared too.
    const missing = nutrients.filter(
      ({ key }) => reading.values[key] === undefined && !emptied.includes(key),
    );
    const cleared = [...emptied, ...missing.map(({ key }) => key)];
    const wasPublished = form.sourceType === 'official' || form.sourceType === 'public';
    setForm((current) => ({
      ...current,
      servingSize: String(basis.size),
      servingUnit: basis.unit,
      ...Object.fromEntries(cleared.map((key) => [key, ''])),
      ...Object.fromEntries(found.map(({ key }) => [key, String(reading.values[key])])),
      // Values copied from the product's own table are its label, checked today (#34).
      sourceType: 'label',
      checkedOn: serviceToday(),
    }));
    const total = packageText(reading);
    const basisLine = reading.basisFromTotal
      ? [
          `No serving size was given, so the total amount (${basis.size}${basis.unit}) was used as the basis. Correct it if the table is for another amount.`,
        ]
      : [];
    setFilled({
      kind: 'status',
      reads,
      lines: [
        `Filled in: ${['Serving size', ...found.map(({ label }) => label)].join(', ')}`,
        ...basisLine,
        ...(reading.lessThan.length
          ? [
              `Cleared because the table says "less than": ${reading.lessThan.map(labelOf).join(', ')}`,
            ]
          : []),
        ...(reading.outOfRange.length
          ? [
              `Cleared because the value is too large: ${reading.outOfRange.map(labelOf).join(', ')}`,
            ]
          : []),
        ...(missing.length
          ? [
              `Cleared because the table has no value: ${missing.map(({ label }) => label).join(', ')}`,
            ]
          : []),
        ...(wasPublished
          ? [
              'The source type was changed to "Product label". Check that the source URL points to this product.',
            ]
          : []),
        ...(total ? [total] : []),
        'Check the values, then press Save to save them.',
      ],
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button stays pressable while saving, and Enter in a field submits too.
    if (saving) return;
    // Unreadable text like "49,5" must not be saved as no value or as 495.
    const unreadable = numberFields.find(({ key }) => parseAmount(form[key]) === undefined);
    if (unreadable) {
      error(unreadableAmount(unreadable.label));
      return;
    }
    // Cleared first, so the same failure twice is announced again.
    clear();
    setSaving(true);
    try {
      await requestJson<Food>(food ? `/api/foods/${food.id}` : '/api/foods', {
        method: food ? 'PUT' : 'POST',
        body: bodyOf(form),
      });
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
          <DialogTitle>{food ? 'Edit food' : 'Add food'}</DialogTitle>
          <DialogDescription>
            Nutrition values are per serving. Leave unknown values blank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="food-label-text">Paste a nutrition table</Label>
            <textarea
              id="food-label-text"
              aria-describedby="food-label-text-help"
              rows={4}
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
              Copy the nutrition table text (in Korean, as on the product page) and paste it to fill
              the fields below. The app does not open the product page.
            </p>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={fill}>
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
          <Field id="food-name" label="Food name">
            <Input id="food-name" value={form.name} onChange={update('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="food-brand" label="Brand">
              <Input id="food-brand" value={form.brand} onChange={update('brand')} />
            </Field>
            <Field id="food-category" label="Category">
              <Input id="food-category" value={form.category} onChange={update('category')} />
            </Field>
            <Field id="food-serving-size" label="Serving size">
              <Input
                id="food-serving-size"
                inputMode="decimal"
                autoComplete="off"
                value={form.servingSize}
                onChange={update('servingSize')}
              />
            </Field>
            <Field id="food-serving-unit" label="Unit">
              <Input
                id="food-serving-unit"
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
                  value={form[key]}
                  onChange={update(key)}
                />
              </Field>
            ))}
          </div>
          <Field id="food-source-type" label="Source type">
            <Select
              value={form.sourceType}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, sourceType: value as SourceType }))
              }
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
              aria-describedby={isCoupangUrl(form.sourceUrl) ? 'food-source-url-help' : undefined}
              value={form.sourceUrl}
              onChange={update('sourceUrl')}
            />
            {/* #34: shop pages are never read by the app; the link only says where the values came from. */}
            {isCoupangUrl(form.sourceUrl) ? (
              <p
                id="food-source-url-help"
                className="text-caption break-keep text-muted-foreground"
              >
                Coupang links are saved only as the source. The app does not open the page, so paste
                the nutrition table text above or enter the values by hand. If the table is only an
                image, enter them by hand.
              </p>
            ) : null}
          </Field>
          <Field id="food-checked-on" label="Verified date">
            <Input
              id="food-checked-on"
              type="date"
              value={form.checkedOn}
              onChange={update('checkedOn')}
            />
          </Field>
          {/* #38: counted in the meal card. A recorded meal keeps the mark it was recorded with. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="food-is-junk"
                checked={form.isJunk}
                aria-describedby="food-is-junk-help"
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isJunk: checked === true }))
                }
              />
              <Label htmlFor="food-is-junk">Junk food</Label>
            </div>
            <p id="food-is-junk-help" className="text-caption break-keep text-muted-foreground">
              Counts toward junk food times in the diet. Changing the flag leaves meals already
              recorded as they are.
            </p>
          </div>
          <Notice notice={notice} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              // Like Save, it keeps focus while busy: Safari does not move focus to a clicked button, so
              // focus may still be here when Save is pressed.
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
              // aria-disabled, not disabled: a disabled button drops keyboard focus to the page, and a
              // failed save would leave it there, outside the dialog (#98). The handler ignores presses.
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

function FoodCard({ food, onEdit }: { food: Food; onEdit: (opener: HTMLElement) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="break-words">
          {food.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">
          {[food.brand, food.category, `Serving ${food.servingSize}${food.servingUnit}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
          {nutrients.map(({ key, label, unit }) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{food[key] === null ? 'No value' : `${food[key]}${unit}`}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {food.isJunk ? <Badge variant="warning">Junk food</Badge> : null}
          <Badge variant="secondary">{sourceLabels[food.sourceType]}</Badge>
          {food.checkedOn ? <span>Verified {food.checkedOn}</span> : null}
          {food.sourceUrl && isSafeLink(food.sourceUrl) ? (
            <a
              href={food.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              View source
            </a>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`Edit ${food.name}`}
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

export function FoodsPage() {
  const [query, setQuery] = useState('');
  // null: closed, 'new': adding, a food: editing it.
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const { notice, error, clear } = useNotice();
  // A next page reports apart from the search, whose failure must stay in view: the list below it
  // is still the answer to the earlier words.
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const shown = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const openDialog = (opener: HTMLElement, target: Food | 'new') => {
    remember(opener);
    setEditing(target);
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };
  // A failed search keeps the list on screen, along with the words that found it.
  const {
    foods,
    more,
    searching,
    loadingMore,
    applied,
    search: load,
    loadMore,
  } = useFoodSearch<Food>({
    onStart: clearPage,
    onSuccess: clear,
    onError: error,
    keepOnError: true,
    onMoreStart: clearPage,
    onMoreError: pageError,
  });

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          id="page-title"
          ref={heading}
          tabIndex={-1}
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Foods
        </h1>
        <p className="text-body text-muted-foreground">Manage nutrition values and sources.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <Input
            type="search"
            aria-label="Search foods"
            placeholder="Name or brand"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={(event) => openDialog(event.currentTarget, 'new')}>
          <Plus aria-hidden />
          Add food
        </Button>
      </div>
      <Notice notice={notice} />
      {foods === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {foods?.length === 0 ? (
        <EmptyState title="No foods" description="Change the search term or add a food." />
      ) : null}
      {foods?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {foods.map((food) => (
            <FoodCard key={food.id} food={food} onEdit={(opener) => openDialog(opener, food)} />
          ))}
        </div>
      ) : null}
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p
        ref={shown}
        role="status"
        tabIndex={-1}
        className="rounded-sm text-body-sm break-keep text-muted-foreground outline-none empty:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {foods?.length
          ? more
            ? `Showing ${foods.length} foods. There are more.`
            : `${foods.length} ${foods.length === 1 ? 'food' : 'foods'}`
          : null}
      </p>
      {foods?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={pageNotice} />
      {editing ? (
        <FoodDialog
          food={editing === 'new' ? null : editing}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            // The saved food may not match the current search, so the list alone cannot confirm it.
            toast.success('Saved');
            void load(applied.current);
          }}
        />
      ) : null}
    </section>
  );
}
