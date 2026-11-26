import { Minus, Plus } from 'lucide-react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { amountText, intakeKinds, intakeLabels, intakeSummary } from './intake-text';
import { errorText } from './lib/use-notice';
import { useIntakeDay } from './use-intake-day';

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function IntakeCard({ date }: { date: string }) {
  const { query, day, change } = useIntakeDay(date);

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
