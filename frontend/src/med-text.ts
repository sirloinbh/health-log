// Medicines as the API sends them (#40), and how they read on screen.

export type Medication = {
  id: number;
  name: string;
  dose: string | null;
  directions: string | null;
  startOn: string;
  /** null: still being taken. */
  endOn: string | null;
  note: string | null;
  /** The visit it was prescribed at; null when bought without one or once that visit is gone. */
  visit: { id: number; date: string; clinic: string } | null;
};

export type MedicationLists = {
  /** The service's today (Asia/Seoul) the lists were split by. */
  today: string;
  current: Medication[];
  upcoming: Medication[];
  past: Medication[];
};

/** Path every medicine write goes under, so the daily card can wait for them (#71). */
export const medicationsPath = '/api/medications';

/** The medicine page, in the app's page list and linked from the daily card and visits. */
export const medicationsPagePath = '/medications';

/** "500mg · 하루 2번 식후", or null when neither is known. */
export const howText = (item: Pick<Medication, 'dose' | 'directions'>) =>
  [item.dose, item.directions].filter(Boolean).join(' · ') || null;

/** "2026-03-10 ~ 2026-03-17", or "2026-03-10부터" while it has no end. */
export const periodText = (item: Pick<Medication, 'startOn' | 'endOn'>) =>
  item.endOn ? `${item.startOn} ~ ${item.endOn}` : `${item.startOn}부터`;
