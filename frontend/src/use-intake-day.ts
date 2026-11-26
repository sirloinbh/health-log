import { useQueryClient } from '@tanstack/react-query';

import { toast } from './components/ui/sonner';
import { type IntakeDay, type IntakeKind } from './intake-text';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { asRequest, putAnswer, useReadAfterWrites } from './writes';

const pathOf = (date: string) => `/api/intake/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

/** One day's water and caffeine counters, shared by the daily card and the quick entry page (#329). */
export function useIntakeDay(date: string) {
  const client = useQueryClient();
  // A tap from before leaving this day may still be on its way; read after it lands.
  const ready = useReadAfterWrites(pathOf(date));
  const query = useApiQuery<IntakeDay>(keyOf(date), pathOf(date), { enabled: ready });
  const day = ready ? query.data : undefined;
  // Each answer is the day as the server now holds it, and goes straight into the cache, even after the card is gone.
  const write = useApiMutation<IntakeDay, ApiRequest>(asRequest, {
    onSuccess: (answer) => putAnswer<IntakeDay>(client, keyOf(date), answer),
    onError: (error) => toast.error(errorText(error)),
  });

  const change = (kind: IntakeKind, direction: 'add' | 'remove') =>
    write.mutate(
      direction === 'add'
        ? { path: pathOf(date), method: 'POST', body: { kind } }
        : { path: `${pathOf(date)}/${kind}`, method: 'DELETE' },
    );

  return { query, day, change };
}
