import { shiftDate } from './daily-date';

// Sleep is filed under the day of waking and typed as two clock times, so the bed date is inferred:
// a bed time later on the clock than the wake time means the night before.
const serviceOffset = '+09:00';

// Reading uses the same fixed offset as writing. Asia/Seoul had other offsets before 1989, and reading
// through it would show those dates at a different time than was typed.
const inService = (instant: string) =>
  new Date(new Date(instant).getTime() + 9 * 60 * 60_000).toISOString();

export const isOvernight = (bed: string, wake: string) => bed > wake;

export const toInstants = (date: string, bed: string, wake: string) => ({
  bedAt: `${isOvernight(bed, wake) ? shiftDate(date, -1) : date}T${bed}:00${serviceOffset}`,
  wakeAt: `${date}T${wake}:00${serviceOffset}`,
});

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const minutesBetween = (bed: string, wake: string) =>
  minutesOf(wake) - minutesOf(bed) + (isOvernight(bed, wake) ? 24 * 60 : 0);

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : ''].filter(Boolean).join(' ');
}

export const clockOf = (instant: string) => inService(instant).slice(11, 16);

export const dayOf = (instant: string) => inService(instant).slice(0, 10);
