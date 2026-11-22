import { type QueryClient, type QueryKey, useIsMutating } from '@tanstack/react-query';
import { useState } from 'react';

import type { ApiRequest } from './lib/query';

/**
 * Pass as useApiMutation's `request`: each write's variables are then its request, so the mutation cache knows which
 * path every write on its way changes (#71, #220).
 */
export const asRequest = (request: ApiRequest) => request;

const pathOf = (variables: unknown) =>
  typeof variables === 'object' && variables !== null && 'path' in variables
    ? variables.path
    : undefined;

/** How many writes made with `asRequest` to a path that starts with one of `prefixes` are on their way. */
function usePendingWrites(prefixes: readonly string[]) {
  return useIsMutating({
    predicate: (mutation) => {
      const path = pathOf(mutation.state.variables);
      return typeof path === 'string' && prefixes.some((prefix) => path.startsWith(prefix));
    },
  });
}

/**
 * Whether a card may read yet. Each day's cards mount anew, so a save started before leaving a day may still be on its
 * way when the person comes back; reading then would show the old record, and a blank form saved over it would erase
 * it (#71). This is false until no such write is pending, then stays true, so the card's own saves do not hide it.
 */
export function useReadAfterWrites(...prefixes: string[]) {
  const pending = usePendingWrites(prefixes) > 0;
  const [ready, setReady] = useState(!pending);
  if (!ready && !pending) setReady(true);
  return ready;
}

/**
 * Puts a write's answer into the cache as the key's data. A read of the same key still on its way (a refetch on
 * returning to the tab, or "Try again") left before the write landed, so it is cancelled first and cannot put the
 * older answer back. React Query restores the state from before a cancelled read at once, and a manual set becomes
 * that state, so the order of the two calls cannot lose the answer.
 */
export function putAnswer<T>(client: QueryClient, key: QueryKey, data: T) {
  void client.cancelQueries({ queryKey: key, exact: true });
  client.setQueryData<T>(key, data);
}
