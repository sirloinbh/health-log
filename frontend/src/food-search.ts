import { useCallback, useEffect, useRef, useState } from 'react';

import { requestJson } from './lib/api';
import { count } from './plural';

/** The status line for a result list; it says when more results are waiting behind the button. */
export const resultText = (n: number, more: boolean) =>
  more ? `Showing ${count(n, 'result')}, more are available` : count(n, 'result');

/** One page of `GET /api/foods`. `nextOffset` is null on the last page. */
type FoodPage<T> = { foods: T[]; nextOffset: number | null };

export const foodsUrl = (query: string, offset = 0) =>
  `/api/foods?q=${encodeURIComponent(query)}${offset ? `&offset=${offset}` : ''}`;

type Options = {
  /** Runs when a search starts, to clear messages from earlier actions. */
  onStart?: () => void;
  /** Runs when a search arrives. */
  onSuccess?: () => void;
  onError: (cause: unknown) => void;
  /** On a failed search, keep the earlier list instead of emptying it. */
  keepOnError?: boolean;
  /**
   * A next page is not a new search: it runs these instead, so it neither clears what other parts
   * of the screen say nor a failed search's message. Without them a page uses `onError` only.
   */
  onMoreStart?: () => void;
  onMoreError?: (cause: unknown) => void;
};

/**
 * Food search with paging: `search` reads the first page, `loadMore` adds the next one.
 * Only the newest request may change the list, so a slow older one cannot overwrite it.
 */
export function useFoodSearch<T extends { id: number }>(options: Options) {
  const [foods, setFoods] = useState<T[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const latest = useRef(0);
  // The query of the list on screen, which can differ from words typed but not yet searched.
  const applied = useRef('');
  // The callbacks change every render; reading them through a ref keeps search and loadMore stable.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const search = useCallback(async (query: string) => {
    const request = ++latest.current;
    const previous = applied.current;
    applied.current = query;
    setSearching(true);
    setLoadingMore(false);
    callbacks.current.onStart?.();
    try {
      const page = await requestJson<FoodPage<T>>(foodsUrl(query));
      if (request !== latest.current) return;
      setFoods(page.foods);
      setNextOffset(page.nextOffset ?? null);
      callbacks.current.onSuccess?.();
    } catch (cause) {
      if (request !== latest.current) return;
      if (callbacks.current.keepOnError) {
        // The list still shows the previous search.
        applied.current = previous;
      } else {
        // Earlier results would read as the answer to this search.
        setFoods(null);
        setNextOffset(null);
      }
      callbacks.current.onError(cause);
    } finally {
      if (request === latest.current) setSearching(false);
    }
  }, []);

  /** Resolves true once the last page is on screen, so the caller can move focus off the button. */
  const loadMore = useCallback(async () => {
    // During a search the next page would belong to the old list, and taking the newest request
    // from the search would leave it waiting forever. A second press would read the same page.
    if (nextOffset === null || searching || loadingMore) return false;
    const request = ++latest.current;
    setLoadingMore(true);
    callbacks.current.onMoreStart?.();
    try {
      const page = await requestJson<FoodPage<T>>(foodsUrl(applied.current, nextOffset));
      if (request !== latest.current) return false;
      // A food added since the first page pushes the rest down by one, so the next page can
      // start with one already shown.
      setFoods((current) => {
        const shown = new Set(current?.map((food) => food.id));
        return [...(current ?? []), ...page.foods.filter((food) => !shown.has(food.id))];
      });
      const next = page.nextOffset ?? null;
      setNextOffset(next);
      return next === null;
    } catch (cause) {
      // The pages already shown are still right; the button stays to try again.
      if (request === latest.current) {
        (callbacks.current.onMoreError ?? callbacks.current.onError)(cause);
      }
      return false;
    } finally {
      if (request === latest.current) setLoadingMore(false);
    }
  }, [nextOffset, searching, loadingMore]);

  return {
    foods,
    more: nextOffset !== null,
    searching,
    loadingMore,
    /** The query of the list on screen. */
    applied,
    search,
    loadMore,
  };
}
