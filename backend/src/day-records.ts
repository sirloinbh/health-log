import { shiftDay } from './dates.js';

// Dates here are calendar days in the service time zone, already fixed by the caller; shiftDay
// counts them as UTC midnights, so every boundary stays on the day it names.
export function periodsOf(date: string) {
  // Weeks run Monday to Sunday.
  const sinceMonday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDay(date, -sinceMonday);
  const [year, month] = date.split('-').map(Number);
  return {
    week: { from: monday, to: shiftDay(monday, 6) },
    month: {
      from: `${date.slice(0, 7)}-01`,
      // Day 0 of the next month is the last day of this one.
      to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    },
  };
}
