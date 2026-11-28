import { isCancelledError, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { requestJson } from './lib/api';
import { plural } from './lib/format';
import { apiKey } from './lib/query';

/** The status line for a result list; it says when more results are waiting behind the button. */
export const resultText = (n: number, more: boolean) =>
  more ? `Showing ${plural(n, 'result')}, more are available` : plural(n, 'result');

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
 * Only the newest request may change the list: a search cancels this search's reads still on their
 * way, so a slow older one cannot overwrite it.
 */
export function useFoodSearch<T extends { id: number }>(options: Options) {
  const client = useQueryClient();
  // This search's own reads, so a new search cancels only them, not another screen's.
  const ownId = useId();
  const [foods, setFoods] = useState<T[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The query of the list on screen, which can differ from words typed but not yet searched.
  const applied = useRef('');
  // The callbacks change every render; reading them through a ref keeps search and loadMore stable.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  /** One page, read fresh. A newer search cancels it, and it then rejects with a CancelledError. */
  const read = useCallback(
    (query: string, offset = 0) =>
      client.fetchQuery({
        queryKey: apiKey('/api/foods', 'search', ownId, query, offset),
        queryFn: ({ signal }) => requestJson<FoodPage<T>>(foodsUrl(query, offset), { signal }),
        staleTime: 0,
      }),
    [client, ownId],
  );

  const search = useCallback(
    async (query: string) => {
      // The search before, or a next page of the list it showed, would now answer the wrong words.
      void client.cancelQueries({ queryKey: apiKey('/api/foods', 'search', ownId) });
      const previous = applied.current;
      applied.current = query;
      setSearching(true);
      setLoadingMore(false);
      callbacks.current.onStart?.();
      try {
        const page = await read(query);
        setFoods(page.foods);
        setNextOffset(page.nextOffset ?? null);
        setSearching(false);
        callbacks.current.onSuccess?.();
      } catch (cause) {
        // A newer search took over, and owns the list and the waiting state now.
        if (isCancelledError(cause)) return;
        if (callbacks.current.keepOnError) {
          // The list still shows the previous search.
          applied.current = previous;
        } else {
          // Earlier results would read as the answer to this search.
          setFoods(null);
          setNextOffset(null);
        }
        setSearching(false);
        callbacks.current.onError(cause);
      }
    },
    [client, ownId, read],
  );

  /** Resolves true once the last page is on screen, so the caller can move focus off the button. */
  const loadMore = useCallback(async () => {
    // During a search the next page would belong to the old list. A second press would read the
    // same page.
    if (nextOffset === null || searching || loadingMore) return false;
    setLoadingMore(true);
    callbacks.current.onMoreStart?.();
    try {
      const page = await read(applied.current, nextOffset);
      // A food added since the first page pushes the rest down by one, so the next page can
      // start with one already shown.
      setFoods((current) => {
        const shown = new Set(current?.map((food) => food.id));
        return [...(current ?? []), ...page.foods.filter((food) => !shown.has(food.id))];
      });
      const next = page.nextOffset ?? null;
      setNextOffset(next);
      setLoadingMore(false);
      return next === null;
    } catch (cause) {
      // A search took over; the list is its now.
      if (isCancelledError(cause)) return false;
      // The pages already shown are still right; the button stays to try again.
      (callbacks.current.onMoreError ?? callbacks.current.onError)(cause);
      setLoadingMore(false);
      return false;
    }
  }, [nextOffset, searching, loadingMore, read]);

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
