import { useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import {
  amountText,
  type IntakeDay,
  type IntakeKind,
  intakeKinds,
  intakeLabels,
  intakeSummary,
} from './intake-text';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { asRequest, putAnswer, useReadAfterWrites } from './writes';

const pathOf = (date: string) => `/api/intake/${date}`;
const keyOf = (date: string) => apiKey(pathOf(date));

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function IntakeCard({ date }: { date: string }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Water and caffeine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {query.isError && !day ? (
          <>
            <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
            <Button
              variant="outline"
              className="self-start"
              onClick={() => void query.refetch({ cancelRefetch: false })}
            >
              Try again
            </Button>
          </>
        ) : null}
        {!query.isError && !day ? (
          <div role="status" aria-busy="true" aria-label="Loading water and caffeine">
            <SkeletonText lines={3} />
          </div>
        ) : null}
        {day ? (
          <>
            <ul className="flex flex-col gap-2">
              {intakeKinds.map((kind) => {
                const { count, amount } = day.kinds[kind];
                const label = intakeLabels[kind];
                return (
                  <li key={kind} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block">{label}</span>
                      <span className="block text-body-sm text-muted-foreground">
                        {count} {count === 1 ? 'drink' : 'drinks'} · {amountText(kind, amount)}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Remove one ${label.toLowerCase()}`}
                      disabled={count === 0}
                      onClick={() => change(kind, 'remove')}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <span className="w-8 text-center font-semibold" aria-hidden>
                      {count}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Add one ${label.toLowerCase()}`}
                      onClick={() => change(kind, 'add')}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p aria-live="polite" className="text-body-sm text-muted-foreground">
              {intakeSummary(day)}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
