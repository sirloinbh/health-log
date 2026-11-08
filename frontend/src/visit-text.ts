// Clinic visits as the API sends them (#39), and how they read on screen.

export type Procedure = {
  name: string;
  area: string | null;
  amount: string | null;
  cost: number | null;
  note: string | null;
};

export type Visit = {
  id: number;
  date: string;
  clinic: string;
  department: string | null;
  note: string | null;
  /** Whole won. */
  cost: number | null;
  nextVisitOn: string | null;
  procedures: Procedure[];
};

export const maxProcedures = 10;

/** Path every visit write goes under, so the daily card can wait for them (#71). */
export const visitsPath = '/api/visits';

const won = new Intl.NumberFormat('ko-KR');

export const wonText = (value: number) => `${won.format(value)}원`;

/**
 * Whole won as typed: digits, with or without thousands commas. Blank is no value (null) and
 * anything else unreadable (undefined), so "1.5" or "12,00" is never guessed at.
 */
export function parseWon(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(value)) return undefined;
  return Number(value.replaceAll(',', ''));
}

/** What a procedure was, in one line: "레이저 · 이마 · 1회차 · 50,000원". */
export const procedureText = (item: Procedure) =>
  [item.name, item.area, item.amount, item.cost === null ? null : wonText(item.cost)]
    .filter(Boolean)
    .join(' · ');

/** The clinic with its department: "가상피부과 · 피부과". */
export const clinicText = (visit: Pick<Visit, 'clinic' | 'department'>) =>
  visit.department ? `${visit.clinic} · ${visit.department}` : visit.clinic;

/** The clinic page, in the app's page list and linked from the daily card. */
export const visitsPagePath = '/visits';

/**
 * The label with 은 or 는, as its last syllable takes: "진료비는", "병원 이름은". A label that does
 * not end in Hangul gets 은(는).
 */
export function withTopic(label: string) {
  const last = label.charCodeAt(label.length - 1) - 0xac00;
  if (last < 0 || last > 11171) return `${label}은(는)`;
  return `${label}${last % 28 === 0 ? '는' : '은'}`;
}
