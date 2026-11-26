import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { toast } from './components/ui/sonner';
import { RequestError } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation } from './lib/query';
import { errorText } from './lib/use-notice';
import type { MealDay } from './meals';
import { createRetryKeys } from './retry-key';
import { asRequest, putAnswer } from './writes';

const pathOf = (date: string) => `/api/meals/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

/**
 * A change to one day's meals. Every change answers with the whole day, which goes into the cache even after the card
 * is gone. The add sends its Idempotency-Key in the request's headers (#196, project-standards#979).
 */
function useMealWrite(date: string) {
  const client = useQueryClient();
  return useApiMutation<MealDay, ApiRequest>(asRequest, {
    onSuccess: (data) => putAnswer(client, keyOf(date), data),
  });
}

/**
 * Adding to one day's meals, shared by the daily meal card and the quick entry page (#329). `live`
 * is false once the page that added is gone; the answer then shows as a toast that names the day.
 */
export function useMealAdd(date: string) {
  const live = useRef(true);
  // An add sent again after no answer reuses its key, so the server does not record it twice (#196).
  const [retryKeys] = useState(() => createRetryKeys());
  const write = useMealWrite(date);
  const adding = write.isPending && write.variables?.method === 'POST';

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  /** Resolves to whether it was added; a failure rejects so the form can show it next to its fields. */
  const add = async (body: object, path = '') => {
    const target = `${pathOf(date)}${path}`;
    const key = retryKeys.keyFor(JSON.stringify([target, body]));
    try {
      await write.mutateAsync({
        path: target,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
      });
      retryKeys.answered();
      if (!live.current) {
        toast.success(`Meal recorded for ${date}`);
        return false;
      }
      toast.success('Recorded');
      return true;
    } catch (cause) {
      // With no answer the server may still have saved it: the same request again keeps its key.
      const unanswered = cause instanceof RequestError && cause.status === undefined;
      if (!unanswered) retryKeys.answered();
      if (live.current) throw cause;
      // Moving to another day removes the form.
      toast.error(
        `Could not ${unanswered ? 'confirm that the meal was recorded' : 'record the meal'} for ${date}: ${errorText(cause)}`,
      );
      return false;
    }
  };

  return { write, adding, add, live };
}
