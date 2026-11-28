import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { calorieText } from './calorie-text';
import { type Combo, type ComboItem, comboSummary, fullName } from './combo-text';
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
import { Spinner } from './components/ui/spinner';
import { resultText, useFoodSearch } from './food-search';
import { RequestError, requestJson } from './lib/api';
import { plural } from './lib/format';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import { MoreFoodsButton } from './more-foods-button';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';
import { useReturnFocus } from './return-focus';
import { asRequest } from './writes';

const combosKey = apiKey('/api/combos');

/** The most foods one combo holds; the server and database refuse more. */
const maxItems = 20;
/** The largest quantity of one food, as for a single meal entry. */
const maxServings = 999;

type FoodOption = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
};

type DraftItem = Omit<ComboItem, 'servings' | 'calories'> & { servings: string };

/** The request body, or the message to show instead of sending. */
function readDraft(name: string, items: DraftItem[]) {
  if (!name.trim()) return 'Enter a combo name';
  if (items.length === 0) return 'Add at least one food to the combo';
  const read = [];
  for (const item of items) {
    const label = `${fullName(item)} quantity`;
    const servings = parseAmount(item.servings);
    if (servings === undefined) return unreadableAmount(label);
    if (servings === null || !(servings > 0)) return `${label} must be a number greater than 0`;
    // The server says only "The quantity is too large"; here the message can name the food.
    if (servings > maxServings) return `${label} must be ${maxServings} or less`;
    if (!hasTwoDecimalsAtMost(servings)) return `${label} can have at most 2 decimal places`;
    read.push({ foodId: item.foodId, servings });
  }
  return { name, items: read };
}

function ComboDialog({
  combo,
  onClose,
  onSaved,
}: {
  combo: Combo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(combo?.name ?? '');
  const [items, setItems] = useState<DraftItem[]>(
    () => combo?.items.map((item) => ({ ...item, servings: String(item.servings) })) ?? [],
  );
  const [query, setQuery] = useState('');
  const client = useQueryClient();
  // The combos list (this page's and the meal card's picker) reads again on every answer, even one
  // that lands after the dialog is gone. Not awaited, so the dialog closes at once. Closing runs only
  // for the latest save while the dialog is still there (#302).
  const write = useApiMutation<Combo, ApiRequest>(asRequest, {
    onSuccess: () => void client.invalidateQueries({ queryKey: combosKey }),
  });
  const saving = write.isPending;
  const { notice, error, clear } = useNotice();
  const { notice: searchNotice, error: searchError, clear: clearSearch } = useNotice();
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const shown = useRef<HTMLParagraphElement>(null);
  const {
    foods,
    more,
    searching,
    loadingMore,
    search: searchFoods,
    loadMore,
  } = useFoodSearch<FoodOption>({
    onStart: () => {
      clearSearch();
      clearPage();
    },
    onError: searchError,
    onMoreStart: clearPage,
    onMoreError: pageError,
  });

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchFoods(query);
  };

  const addFood = (food: FoodOption) =>
    setItems((current) =>
      saving || current.some((item) => item.foodId === food.id) || current.length >= maxItems
        ? current
        : [
            ...current,
            {
              foodId: food.id,
              name: food.name,
              brand: food.brand,
              servingSize: food.servingSize,
              servingUnit: food.servingUnit,
              servings: '1',
            },
          ],
    );

  const save = () => {
    // The button stays pressable while saving.
    if (saving) return;
    const body = readDraft(name, items);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    // Cleared first, so the same failure twice is announced again.
    clear();
    write.mutate(
      {
        path: combo ? `/api/combos/${combo.id}` : '/api/combos',
        method: combo ? 'PUT' : 'POST',
        body,
      },
      { onSuccess: () => onSaved(), onError: (cause) => error(cause) },
    );
  };

  const full = items.length >= maxItems;

  return (
    // Closing during a save would not cancel it, and its late reply would close whatever opened next.
    <Dialog open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{combo ? 'Edit combo' : 'Add combo'}</DialogTitle>
          <DialogDescription>
            Set the foods and quantities you eat together, and the diet card records them in one
            step.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="combo-name">Combo name</Label>
            {/* Read-only while saving: a change after Save would not be in the save on its way. */}
            <Input
              id="combo-name"
              readOnly={saving}
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <section aria-label="Foods in the combo" className="flex flex-col gap-2">
            <p className="text-body-sm font-medium">
              Foods added {items.length}/{maxItems}
            </p>
            {items.length === 0 ? null : (
              <ul className="flex flex-col divide-y">
                {items.map((item) => (
                  <li key={item.foodId} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 text-body-sm wrap-anywhere">
                      {fullName(item)}
                    </span>
                    <Input
                      aria-label={`${fullName(item)} quantity`}
                      className="w-20"
                      inputMode="decimal"
                      autoComplete="off"
                      readOnly={saving}
                      value={item.servings}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((other) =>
                            other.foodId === item.foodId
                              ? { ...other, servings: event.target.value }
                              : other,
                          ),
                        )
                      }
                    />
                    <span className="text-body-sm text-muted-foreground">servings</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${fullName(item)}`}
                      disabled={saving}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((other) => other.foodId !== item.foodId),
                        )
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form role="search" onSubmit={search} className="flex gap-2">
            <Input
              type="search"
              aria-label="Search foods to add"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={searching}
              aria-busy={searching || undefined}
            >
              {searching ? <Spinner size="sm" label="Searching" /> : null}
              Search
            </Button>
          </form>
          <Notice notice={searchNotice} />
          <p
            ref={shown}
            role="status"
            tabIndex={-1}
            className="rounded-sm text-body-sm break-keep text-muted-foreground outline-none empty:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {foods === null
              ? null
              : foods.length === 0
                ? 'No matching foods. Add them on the Foods page first.'
                : full
                  ? `${resultText(foods.length, more)}. A combo can have up to ${maxItems} foods.`
                  : resultText(foods.length, more)}
          </p>
          {foods?.length ? (
            <ul
              aria-label="Search results"
              className="flex max-h-60 flex-col divide-y overflow-y-auto"
            >
              {foods.map((food) => {
                const added = items.some((item) => item.foodId === food.id);
                return (
                  <li key={food.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="wrap-anywhere">{fullName(food)}</span>
                      <span className="text-caption text-muted-foreground">
                        Serving {food.servingSize}
                        {food.servingUnit} · {calorieText(food.calories)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={added || full || saving}
                      aria-label={`${fullName(food)} ${added ? 'added' : 'add'}`}
                      onClick={() => addFood(food)}
                    >
                      {added ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {foods?.length && more ? (
            <MoreFoodsButton
              loading={loadingMore || searching}
              onLoad={loadMore}
              afterLast={shown}
            />
          ) : null}
          <Notice notice={pageNotice} />
          <Notice notice={notice} />
        </div>
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
            type="button"
            // aria-disabled, not disabled: a disabled button drops keyboard focus to the page, and a
            // failed save would leave it there, outside the dialog (#98). The handler ignores presses.
            aria-disabled={saving || undefined}
            aria-busy={saving || undefined}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComboCard({
  combo,
  onEdit,
  onDelete,
}: {
  combo: Combo;
  onEdit: (opener: HTMLElement) => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="break-words">
          {combo.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{comboSummary(combo)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {combo.items.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            All foods were removed. Edit the combo to add foods.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {combo.items.map((item) => (
              <li key={item.foodId} className="wrap-anywhere">
                {fullName(item)} · {plural(item.servings, 'serving')} · {calorieText(item.calories)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="Delete this combo?"
            description={
              <span className="wrap-anywhere">{`'${combo.name}' will be deleted. Meals already recorded stay as they are.`}</span>
            }
            onConfirm={onDelete}
            trigger={
              <Button variant="outline" size="sm" aria-label={`Delete ${combo.name}`}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${combo.name}`}
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

export function CombosPage() {
  const client = useQueryClient();
  const query = useApiQuery<{ combos: Combo[] }>(combosKey, '/api/combos');
  // A failed read keeps the combos already shown.
  const combos = query.data?.combos ?? null;
  // null: closed, 'new': adding, a combo: editing it.
  const [editing, setEditing] = useState<Combo | 'new' | null>(null);
  // The words about a read the person asked for. A failed read shows over them, hidden while
  // reading again, so the same failure twice is announced again.
  const { notice: said, status, clear } = useNotice();
  const failed: NoticeValue | undefined =
    query.isError && !query.isFetching
      ? { kind: 'error', text: errorText(query.error) }
      : undefined;
  const notice = failed ?? said;
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const openDialog = (opener: HTMLElement, target: Combo | 'new') => {
    remember(opener);
    setEditing(target);
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  // A deleted combo takes its buttons with it, and a closing dialog restores focus on a timer first.
  // The delete dialog has its own trigger; the add and edit dialogs return focus through useReturnFocus.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  /** After a save or a delete: the list reads again, with the add form's combos. */
  const reload = () => {
    clear();
    void client.invalidateQueries({ queryKey: combosKey });
  };

  const retry = async () => {
    // A word in its place: a list already on screen does not look fixed while the new one is on
    // its way.
    status('Reloading the list…');
    const result = await query.refetch({ cancelRefetch: false });
    if (result.isError) clear();
    else status('The list was reloaded.');
  };

  const remove = async (combo: Combo) => {
    try {
      await requestJson(`/api/combos/${combo.id}`, { method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        // Keeps the dialog open with the reason.
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
    // Drop the card now: if it stayed until the reload, the closing dialog would hand focus back
    // to its delete button, and focus would fall to the body when the reload removes it.
    client.setQueryData<{ combos: Combo[] }>(
      combosKey,
      (current) => current && { combos: current.combos.filter((item) => item.id !== combo.id) },
    );
    setMoveFocus((count) => count + 1);
    reload();
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
          Combos
        </h1>
      </header>
      <div>
        <Button onClick={(event) => openDialog(event.currentTarget, 'new')}>
          <Plus aria-hidden />
          Add combo
        </Button>
      </div>
      <Notice notice={notice} />
      {notice?.kind === 'error' ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            // A word in its place: the same failure twice is announced again, and a list already
            // on screen does not look fixed while the new one is on its way.
            void retry();
            // Trying again removes this button, which would drop keyboard focus to the page (#65, #127).
            setMoveFocus((count) => count + 1);
          }}
        >
          Try again
        </Button>
      ) : null}
      {combos === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {combos?.length === 0 ? (
        <EmptyState
          title="No combos"
          description="Group foods you eat together to make your first combo."
        />
      ) : null}
      {combos?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {combos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              onEdit={(opener) => openDialog(opener, combo)}
              onDelete={() => remove(combo)}
            />
          ))}
        </div>
      ) : null}
      {editing ? (
        <ComboDialog
          combo={editing === 'new' ? null : editing}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('Saved');
            // The save already asked for the list again.
            clear();
          }}
        />
      ) : null}
    </section>
  );
}
