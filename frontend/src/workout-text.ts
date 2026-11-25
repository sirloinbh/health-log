// The day's workouts from workout-memo (#333), as the API summarizes them: read-only.
export type WorkoutExercise = { exercise: string; sets: number; topWeightKg: number };
export type WorkoutJournal = { id: number; title: string; exercises: WorkoutExercise[] };
export type WorkoutDay = { state: 'ok'; workouts: WorkoutJournal[] } | { state: 'unavailable' };

export const unavailableText = 'Workouts from workout-memo cannot be shown right now.';
export const emptyText = 'No workouts recorded in workout-memo for this day.';

/** "3 sets, top 62.5 kg"; a bodyweight exercise (0 kg) has no weight to name. */
export const exerciseText = ({ sets, topWeightKg }: WorkoutExercise) => {
  const count = `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  return topWeightKg > 0 ? `${count}, top ${topWeightKg} kg` : count;
};
