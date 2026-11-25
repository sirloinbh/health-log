import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { SkeletonText } from './components/ui/skeleton';
import { apiKey, useApiQuery } from './lib/query';
import { emptyText, exerciseText, unavailableText, type WorkoutDay } from './workout-text';

const pathOf = (date: string) => `/api/workout-memo/${date}`;

// Read-only: the workouts live in workout-memo. The daily page gives this a key per date.
export function WorkoutsCard({ date }: { date: string }) {
  const query = useApiQuery<WorkoutDay>(apiKey(pathOf(date)), pathOf(date));
  const day = query.data;
  // The API answers "unavailable" itself; a failed request to our own API says the same, quietly.
  const unavailable = day?.state === 'unavailable' || (query.isError && !day);

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Workouts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!day && !query.isError ? (
          <div role="status" aria-busy="true" aria-label="Loading workouts">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {unavailable ? (
          <>
            <p className="text-body text-muted-foreground">{unavailableText}</p>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => void query.refetch({ cancelRefetch: false })}
            >
              Try again
            </Button>
          </>
        ) : null}
        {day?.state === 'ok' && day.workouts.length === 0 ? (
          <p className="text-body text-muted-foreground">{emptyText}</p>
        ) : null}
        {day?.state === 'ok'
          ? day.workouts.map((workout) => (
              <section key={workout.id} aria-label={workout.title} className="flex flex-col gap-1">
                <h3 className="font-semibold">{workout.title}</h3>
                <ul className="flex flex-col gap-1 text-body-sm">
                  {workout.exercises.map((exercise) => (
                    <li key={exercise.exercise} className="flex justify-between gap-2">
                      <span className="min-w-0">{exercise.exercise}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {exerciseText(exercise)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          : null}
      </CardContent>
    </Card>
  );
}
