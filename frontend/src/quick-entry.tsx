import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { BusyButton } from './busy-button';
import { calorieText } from './calorie-text';
import { fullName } from './combo-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { Spinner } from './components/ui/spinner';
import { formatDate } from './daily-date';
import { JunkBadge } from './food-choices';
import { type Health, healthText } from './health';
import { errorText } from './lib/use-notice';
import { type FoodOption, meals, waitingFood } from './meal-entry';
import { mealAt, waterText } from './quick-entry-text';
import { useAddEntry } from './use-add-entry';
import { useIntakeDay } from './use-intake-day';
import { useMealAdd } from './use-meal-add';

/** Water for today with one large button each way (#329). */
function QuickWater({ date }: { date: string }) {
  const { query, day, change } = useIntakeDay(date);
  const water = day?.kinds.water;
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Water</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {query.isError && !day ? (
          <>
            <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
            <Button
              variant="outline"
              size="lg"
              className="self-start"
              onClick={() => void query.refetch({ cancelRefetch: false })}
            >
              Try again
            </Button>
          </>
        ) : null}
        {!query.isError && !water ? (
          <div role="status" aria-busy="true" aria-label="Loading water">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {water ? (
          <>
            <p aria-live="polite" className="text-xl font-semibold">
              {waterText(water.count, water.amount)}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                aria-label="Remove one water"
                disabled={water.count === 0}
                onClick={() => change('water', 'remove')}
              >
                <Minus aria-hidden />
                One less
              </Button>
              <Button
                size="lg"
                className="flex-[2]"
                aria-label="Add one water"
                onClick={() => change('water', 'add')}
              >
                <Plus aria-hidden />
                One cup
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Recently eaten foods, each one tap to record one serving in the chosen meal (#329). */
function QuickMeal({ date }: { date: string }) {
  const { add, adding } = useMealAdd(date);
  // Chosen once, when the page opens; a tap on another meal changes it.
  const [initialMeal] = useState(() => mealAt(new Date()));
  const entry = useAddEntry({ onAdd: add, initialMeal });
  const { recent, recentFailure, notices } = entry;
  const waiting = waitingFood(entry.pending, 'recent');

  const addFood = (food: FoodOption) => {
    if (adding) return;
    entry.clear();
    void entry.record(
      { kind: 'food', list: 'recent', foodId: food.id },
      { meal: entry.meal, servings: 1, foodId: food.id },
      { onRecorded: () => void entry.loadRecent(), onError: notices.recent.error },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Meal</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div role="group" aria-label="Meal" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {meals.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="lg"
              variant={entry.meal === key ? 'default' : 'outline'}
              aria-pressed={entry.meal === key}
              onClick={() => entry.setMeal(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="text-body-sm break-keep text-muted-foreground">
          A tap records one serving in {entry.mealLabel.toLowerCase()} for today.
        </p>
        {recentFailure ? (
          <>
            <Notice
              notice={{
                kind: 'error',
                text: `Could not load recently eaten foods: ${recentFailure}`,
              }}
            />
            <Button
              variant="outline"
              size="lg"
              className="self-start"
              onClick={() => void entry.loadRecent()}
            >
              Try again
            </Button>
          </>
        ) : null}
        {!recent && !recentFailure ? (
          <div role="status" aria-busy="true" aria-label="Loading recent foods">
            <SkeletonText lines={3} />
          </div>
        ) : null}
        {recent && recent.length === 0 ? (
          <p className="text-body-sm break-keep text-muted-foreground">
            No recent foods yet. Record a meal once on the{' '}
            <Link to={`/daily/${date}`}>daily record</Link> and it shows here.
          </p>
        ) : null}
        {recent?.length ? (
          <ul aria-label="Recent foods" className="flex flex-col gap-2">
            {recent.map((food) => (
              <li key={food.id}>
                <BusyButton
                  variant="outline"
                  size="lg"
                  className="h-auto min-h-14 w-full justify-between gap-3 py-2 text-left whitespace-normal"
                  busy={adding}
                  aria-busy={waiting === food.id || undefined}
                  aria-label={`Add ${fullName(food)} to ${entry.mealLabel.toLowerCase()}`}
                  onClick={() => addFood(food)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="wrap-anywhere">{fullName(food)}</span>
                      {food.isJunk ? <JunkBadge /> : null}
                    </span>
                    <span className="text-caption font-normal text-muted-foreground">
                      {calorieText(food.calories)}
                    </span>
                  </span>
                  {waiting === food.id ? (
                    <Spinner size="sm" label="Recording" />
                  ) : (
                    <Plus aria-hidden />
                  )}
                </BusyButton>
              </li>
            ))}
          </ul>
        ) : null}
        <Notice notice={notices.recent.notice} />
      </CardContent>
    </Card>
  );
}

/** A meal or a cup of water in a few taps, for today, on a phone (#329). */
export function QuickEntryPage({ health }: { health: Health }) {
  // The last today the server gave: one failed check must not take the buttons away.
  const [lastToday, setLastToday] = useState<string | null>(null);
  if (health.state === 'ok' && health.today && health.today !== lastToday)
    setLastToday(health.today);
  const today = health.state === 'ok' && health.today ? health.today : lastToday;

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">Quick entry</h1>
        {today ? (
          <p aria-live="polite" className="text-body text-muted-foreground">
            {formatDate(today)}
          </p>
        ) : null}
      </header>
      {health.state === 'error' || !today ? (
        <Notice
          notice={{
            kind: health.state === 'error' ? 'error' : 'status',
            text: healthText(health),
          }}
        />
      ) : null}
      {today ? (
        <div key={today} className="flex flex-col gap-6">
          <QuickWater date={today} />
          <QuickMeal date={today} />
        </div>
      ) : null}
    </section>
  );
}
