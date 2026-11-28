import { isCancelledError } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';

import { type Combo, comboSummary } from './combo-text';
import { BusyButton } from './components/busy-button/busy-button';
import { addDays } from './components/period-nav/periods';
import { Button } from './components/ui/button';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { formatDate, isValidDate } from './daily-date';
import { FoodChoices } from './food-choices';
import { resultText, useFoodSearch } from './food-search';
import { RequestError } from './lib/api';
import { apiKey, useApiQuery } from './lib/query';
import {
  type FoodList,
  type FoodOption,
  type MealKey,
  meals,
  waitingCombo,
  waitingFood,
} from './meal-entry';
import { MoreFoodsButton } from './more-foods-button';
import { parseAmount, unreadableAmount } from './number-input';
import { type AddEntryState, type OnAdd, useAddEntry } from './use-add-entry';

type FormProps = { entry: AddEntryState; adding: boolean };
type OnAddFood = (food: FoodOption) => void;

function MealPicker({ meal, onChange }: { meal: MealKey; onChange: (meal: MealKey) => void }) {
  return (
    <div role="group" aria-label="Meal" className="flex flex-wrap gap-2">
      {meals.map(({ key, label }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={meal === key ? 'default' : 'outline'}
          aria-pressed={meal === key}
          onClick={() => onChange(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function ServingsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="meal-servings">Quantity (in servings)</Label>
      <Input
        id="meal-servings"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Shown only once there is something to offer, or a reason it could not be read. */
function RecentFoods({ entry, adding, onAddFood }: FormProps & { onAddFood: OnAddFood }) {
  const { recent, recentFailure } = entry;
  if (!recent?.length && !recentFailure) return null;
  return (
    <section aria-label="Recently eaten foods" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p
          ref={entry.recentHeading}
          tabIndex={-1}
          className="text-body-sm font-medium outline-none"
        >
          Recently eaten foods
        </p>
        {recentFailure ? (
          <Button type="button" variant="outline" size="sm" onClick={entry.retryRecent}>
            Reload
          </Button>
        ) : null}
      </div>
      <Notice
        notice={
          recentFailure
            ? { kind: 'error', text: `Could not load recently eaten foods: ${recentFailure}` }
            : undefined
        }
      />
      {recent?.length ? (
        <FoodChoices
          label="Recently eaten foods list"
          foods={recent}
          adding={adding}
          waiting={waitingFood(entry.pending, 'recent')}
          onAdd={onAddFood}
        />
      ) : null}
      <Notice notice={entry.notices.recent.notice} />
    </section>
  );
}

function FoodSearch({ entry, adding, onAddFood }: FormProps & { onAddFood: OnAddFood }) {
  const [query, setQuery] = useState('');
  const shown = useRef<HTMLParagraphElement>(null);
  const { list, page } = entry.notices;
  // A search clears every message, like the other forms; a next page only its own.
  const { foods, more, searching, loadingMore, search, loadMore } = useFoodSearch<FoodOption>({
    onStart: () => entry.clear(),
    onError: list.error,
    onMoreStart: page.clear,
    onMoreError: page.error,
  });

  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
        className="flex gap-2"
      >
        <Input
          ref={entry.searchInput}
          type="search"
          aria-label="Search foods"
          placeholder="Name or brand"
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
      <Notice notice={list.notice} />
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p
        ref={shown}
        role="status"
        tabIndex={-1}
        className="rounded-sm text-body-sm break-keep text-muted-foreground outline-none empty:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {foods === null
          ? null
          : foods.length === 0
            ? 'No matching foods. You can type a name and calories below.'
            : resultText(foods.length, more)}
      </p>
      {foods?.length ? (
        <FoodChoices
          label="Search results"
          foods={foods}
          adding={adding}
          waiting={waitingFood(entry.pending, 'search')}
          onAdd={onAddFood}
        />
      ) : null}
      {foods?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={page.notice} />
    </>
  );
}

const combosKey = apiKey('/api/combos');

function ComboPicker({ entry, adding }: FormProps) {
  // Combos are read only when asked for, so a day opens with no extra request. The list is the
  // combos page's cache entry (#302): combo and food saves mark it stale, a newer read replaces one
  // still on its way, and leaving the day aborts the read instead of only ignoring its answer.
  const [asked, setAsked] = useState(false);
  const list = useApiQuery<{ combos: Combo[] }>(combosKey, '/api/combos', { enabled: asked });
  // A failed reload keeps the combos already shown.
  const combos = asked ? (list.data?.combos ?? null) : null;
  const loading = asked && list.isFetching;
  const { combo: notice } = entry.notices;

  const loadCombos = async () => {
    entry.clear();
    setAsked(true);
    try {
      // Read even when the cache is fresh: the person asked for the list now.
      await list.refetch({ throwOnError: true });
    } catch (cause) {
      // Cancelled by leaving the day: nothing is left to tell.
      if (isCancelledError(cause)) return;
      notice.error(cause);
    }
  };

  const addCombo = async (combo: Combo) => {
    if (adding) return;
    entry.clear();
    await entry.record(
      { kind: 'combo', comboId: combo.id },
      { meal: entry.meal },
      {
        path: `/combos/${combo.id}`,
        onRecorded: () => void entry.loadRecent(),
        onError: notice.error,
      },
    );
  };

  return (
    <section aria-label="Combos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm font-medium">Combos</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          aria-busy={loading || undefined}
          onClick={() => void loadCombos()}
        >
          {loading ? <Spinner size="sm" label="Loading" /> : null}
          {combos === null ? 'Choose from combos' : 'Reload combos'}
        </Button>
      </div>
      {combos === null ? null : combos.length === 0 ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          No saved combos. You can create them on the Combos page in the menu.
        </p>
      ) : (
        <>
          <p className="text-caption break-keep text-muted-foreground">
            Records the chosen meal with the quantities saved in the combo.
          </p>
          <ul aria-label="Combo list" className="flex max-h-80 flex-col divide-y overflow-y-auto">
            {combos.map((combo) => (
              <li key={combo.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="wrap-anywhere">{combo.name}</span>
                  <span className="text-caption text-muted-foreground">{comboSummary(combo)}</span>
                </div>
                <BusyButton
                  variant="outline"
                  size="sm"
                  disabled={combo.items.length === 0}
                  busy={adding}
                  aria-busy={waitingCombo(entry.pending, combo.id) || undefined}
                  aria-label={`Record ${combo.name}`}
                  onClick={() => void addCombo(combo)}
                >
                  {waitingCombo(entry.pending, combo.id) ? (
                    <Spinner size="sm" label="Recording" />
                  ) : null}
                  Record
                </BusyButton>
              </li>
            ))}
          </ul>
        </>
      )}
      <Notice notice={notice.notice} />
    </section>
  );
}

function CopyMealForm({ date, entry, adding }: FormProps & { date: string }) {
  // "The same as yesterday" is the usual copy.
  const [copyFrom, setCopyFrom] = useState(() => addDays(date, -1));
  const { copy: notice } = entry.notices;
  const meal = entry.mealLabel.toLowerCase();

  const copyMeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The add buttons stay pressable while adding (#126), and Enter in a field submits too.
    if (adding) return;
    entry.clear();
    if (!isValidDate(copyFrom)) {
      notice.error('Choose a date to copy from');
      return;
    }
    if (copyFrom === date) {
      notice.error('Choose a different date');
      return;
    }
    await entry.record(
      { kind: 'copy' },
      { from: copyFrom, meal: entry.meal },
      {
        path: '/copy',
        onRecorded: () => void entry.loadRecent(),
        // Say which meal of which day was empty, not just that nothing was found.
        onError: (cause) =>
          notice.error(
            cause instanceof RequestError && cause.status === 404
              ? `No ${meal} records to copy from ${formatDate(copyFrom)}`
              : cause,
          ),
      },
    );
  };

  return (
    <form
      aria-label="Copy from another day"
      onSubmit={(event) => void copyMeal(event)}
      noValidate
      className="flex flex-col gap-3"
    >
      <p className="text-body-sm font-medium">Copy from another day</p>
      <p id="meal-copy-help" className="text-caption break-keep text-muted-foreground">
        Adds the chosen day's {meal} records to this day's {meal} as they are. Nutrition values stay
        as recorded that day.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="meal-copy-from">Date to copy from</Label>
          <Input
            id="meal-copy-from"
            type="date"
            className="w-auto"
            value={copyFrom}
            onChange={(event) => setCopyFrom(event.target.value)}
          />
        </div>
        <BusyButton
          type="submit"
          variant="outline"
          busy={adding}
          aria-busy={entry.pending?.kind === 'copy' || undefined}
          aria-describedby="meal-copy-help"
        >
          {entry.pending?.kind === 'copy' ? <Spinner size="sm" label="Copying" /> : null}
          Copy {meal}
        </BusyButton>
      </div>
      <Notice notice={notice.notice} />
    </form>
  );
}

function TypedFoodForm({ entry, adding }: FormProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [isJunk, setIsJunk] = useState(false);
  const { typed: notice } = entry.notices;

  const addTyped = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (adding) return;
    const value = entry.readServings(notice.error);
    if (value === null) return;
    if (!name.trim()) {
      notice.error('Enter a food name');
      return;
    }
    const kcal = parseAmount(calories);
    if (kcal === undefined) {
      notice.error(unreadableAmount('Calories per serving'));
      return;
    }
    if (kcal === null) {
      notice.error('Calories must be a number');
      return;
    }
    await entry.record(
      { kind: 'typed' },
      { meal: entry.meal, servings: value, name, calories: kcal, isJunk },
      {
        // Anything typed while waiting is the next entry, not this one.
        onRecorded: () => {
          setName((current) => (current === name ? '' : current));
          setCalories((current) => (current === calories ? '' : current));
          setIsJunk((current) => (current === isJunk ? false : current));
        },
        onError: notice.error,
      },
    );
  };

  return (
    <form onSubmit={(event) => void addTyped(event)} noValidate className="flex flex-col gap-3">
      <p className="text-body-sm font-medium">Foods not in the library</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="meal-name">Food name</Label>
          <Input id="meal-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meal-calories">Calories per serving (kcal)</Label>
          <Input
            id="meal-calories"
            inputMode="decimal"
            autoComplete="off"
            value={calories}
            onChange={(event) => setCalories(event.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="meal-typed-junk"
          checked={isJunk}
          aria-describedby="meal-typed-junk-help"
          onCheckedChange={(checked) => setIsJunk(checked === true)}
        />
        <Label htmlFor="meal-typed-junk">Junk food</Label>
      </div>
      <p id="meal-typed-junk-help" className="-mt-2 text-caption break-keep text-muted-foreground">
        Counts toward the junk food times for this week and this month above.
      </p>
      <Notice notice={notice.notice} />
      <BusyButton
        type="submit"
        variant="outline"
        className="self-start"
        busy={adding}
        aria-busy={entry.pending?.kind === 'typed' || undefined}
      >
        {entry.pending?.kind === 'typed' ? <Spinner size="sm" label="Recording" /> : null}
        Record now
      </BusyButton>
    </form>
  );
}

/** The ways to add to a day's meals: a stored food (recent or searched), a combo, a copy, or typed. */
export function AddEntry({ date, adding, onAdd }: { date: string; adding: boolean; onAdd: OnAdd }) {
  const entry = useAddEntry({ onAdd });

  /** `list` says which list was used, so the error and the spinner show next to that list. */
  const addFood = async (food: FoodOption, list: FoodList) => {
    if (adding) return;
    const showError = list === 'recent' ? entry.notices.recent.error : entry.notices.list.error;
    const value = entry.readServings(showError);
    if (value === null) return;
    await entry.record(
      { kind: 'food', list, foodId: food.id },
      { meal: entry.meal, servings: value, foodId: food.id },
      // The food just eaten moves to the top of the recent list.
      { onRecorded: () => void entry.loadRecent(), onError: showError },
    );
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <MealPicker meal={entry.meal} onChange={entry.setMeal} />
      <ServingsField value={entry.servings} onChange={entry.setServings} />
      <RecentFoods
        entry={entry}
        adding={adding}
        onAddFood={(food) => void addFood(food, 'recent')}
      />
      <FoodSearch
        entry={entry}
        adding={adding}
        onAddFood={(food) => void addFood(food, 'search')}
      />
      <ComboPicker entry={entry} adding={adding} />
      <CopyMealForm date={date} entry={entry} adding={adding} />
      <TypedFoodForm entry={entry} adding={adding} />
    </div>
  );
}
