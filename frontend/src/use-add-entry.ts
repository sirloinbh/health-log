import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { apiKey, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { type FoodOption, type MealKey, meals, type Pending } from './meal-entry';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';

/** Records an entry; `path` follows the day's address, e.g. `/combos/3` to record a combo. */
export type OnAdd = (body: object, path?: string) => Promise<boolean>;

/**
 * The state the meal add forms share (#210): the chosen meal and quantity, the waiting button,
 * each form's message, and the recently eaten foods.
 */
export function useAddEntry({
  onAdd,
  initialMeal = 'breakfast',
}: {
  onAdd: OnAdd;
  /** The meal chosen at first; the quick entry page picks it from the time of day (#329). */
  initialMeal?: MealKey;
}) {
  const [meal, setMeal] = useState<MealKey>(initialMeal);
  const [servings, setServings] = useState('1');
  const [pending, setPending] = useState<Pending | null>(null);
  // A long result list sits between the forms, so each shows its errors next to its own buttons.
  // `page` is below a long result list, next to the button that asked for the page.
  const notices = {
    recent: useNotice(),
    list: useNotice(),
    combo: useNotice(),
    copy: useNotice(),
    typed: useNotice(),
    page: useNotice(),
  };
  const mealLabel = meals.find(({ key }) => key === meal)!.label;

  /** Every form's message goes when any form acts. */
  const clear = () => {
    for (const notice of Object.values(notices)) notice.clear();
  };

  const recentFoods = useRecentFoods();

  /** The quantity as a number, or null after showing why it cannot be used. Clears messages first. */
  const readServings = (showError: (message: string) => void) => {
    clear();
    const value = parseAmount(servings);
    if (value === undefined) {
      showError(unreadableAmount('Quantity'));
      return null;
    }
    if (value === null || !(value > 0)) {
      showError('The quantity must be a number greater than 0');
      return null;
    }
    if (!hasTwoDecimalsAtMost(value)) {
      showError('The quantity can have at most 2 decimal places');
      return null;
    }
    return value;
  };

  /**
   * Sends one add with `target` shown as waiting. `onRecorded` runs once the day took it; a failure
   * goes to `onError`, next to the form that sent it.
   */
  const record = async (
    target: Pending,
    body: object,
    {
      path,
      onRecorded,
      onError,
    }: {
      path?: string;
      onRecorded: () => void;
      onError: (cause: unknown) => void;
    },
  ) => {
    setPending(target);
    try {
      if (await onAdd(body, path)) onRecorded();
    } catch (cause) {
      onError(cause);
    } finally {
      setPending(null);
    }
  };

  return {
    meal,
    setMeal,
    mealLabel,
    servings,
    setServings,
    pending,
    notices,
    clear,
    readServings,
    record,
    ...recentFoods,
  };
}

export type AddEntryState = ReturnType<typeof useAddEntry>;

const recentKey = apiKey('/api/foods/recent');

/** Stored foods last recorded, so a usual food needs no search. */
function useRecentFoods() {
  const client = useQueryClient();
  const query = useApiQuery<{ foods: FoodOption[] }>(recentKey, '/api/foods/recent');
  // null until read, or if the first read failed.
  const recent = query.data?.foods ?? null;
  // Why the list could not be read. Kept apart from the add errors, which the next action clears:
  // this one stays with its retry button until a read succeeds, also while a retry is on its way
  // (React Query puts a query with no data back to pending while it reads).
  const [recentFailure, setRecentFailure] = useState<string | null>(null);
  if (query.isError && recentFailure !== errorText(query.error)) {
    setRecentFailure(errorText(query.error));
  }
  if (query.isSuccess && recentFailure !== null) setRecentFailure(null);
  const recentHeading = useRef<HTMLParagraphElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [focusAfterRetry, setFocusAfterRetry] = useState(0);
  const focusAfterRead = useRef(false);

  // Whichever read clears the failure removes the retry button, even one started by an add that
  // finished after the retry was pressed.
  useEffect(() => {
    if (recentFailure !== null || !focusAfterRead.current) return;
    focusAfterRead.current = false;
    setFocusAfterRetry((count) => count + 1);
  }, [recentFailure]);
  // A retry that fails again leaves the button, and focus with it.
  useEffect(() => {
    focusAfterRead.current = false;
  }, [query.errorUpdatedAt]);

  // The retry button goes away once the read works. Focus moves to the list's heading, or to the
  // search when there is still nothing to offer, instead of falling to the page.
  useEffect(() => {
    if (!focusAfterRetry) return;
    const timer = setTimeout(() => (recentHeading.current ?? searchInput.current)?.focus(), 0);
    return () => clearTimeout(timer);
  }, [focusAfterRetry]);

  /**
   * After a food is recorded: its order changed. A newer read replaces one still on its way; with
   * no list yet React Query would join that read instead, so it is cancelled first.
   */
  const loadRecent = async () => {
    await client.cancelQueries({ queryKey: recentKey, exact: true });
    await client.invalidateQueries({ queryKey: recentKey, exact: true });
  };

  const retryRecent = () => {
    focusAfterRead.current = true;
    void query.refetch({ cancelRefetch: false });
  };

  return { recent, recentFailure, loadRecent, retryRecent, recentHeading, searchInput };
}
