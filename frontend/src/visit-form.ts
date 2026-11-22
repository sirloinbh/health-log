// The clinic visit form: what the dialog holds while typing, and the rules that turn it into the
// request body (#211). Kept apart from the screen so each rule can be tested on its own.

import { charCount } from './check-text';
import { dailyRangeText, inDailyRange, isValidDate } from './daily-date';
import { parseWon, type Procedure, type Visit } from './visit-text';

export type ProcedureDraft = {
  /** Tells rows apart while they are added and removed; never sent. */
  key: number;
  name: string;
  area: string;
  amount: string;
  cost: string;
  note: string;
};

export type Draft = {
  date: string;
  clinic: string;
  department: string;
  note: string;
  cost: string;
  nextVisitOn: string;
  procedures: ProcedureDraft[];
};

/** What a save sends: text as typed, costs in whole won, a blank next appointment as null. */
export type VisitBody = {
  date: string;
  clinic: string;
  department: string;
  note: string;
  cost: number | null;
  nextVisitOn: string | null;
  procedures: {
    name: string;
    area: string;
    amount: string;
    cost: number | null;
    note: string;
  }[];
};

let nextKey = 1;

/** A procedure row: blank for a new one, or filled from a saved procedure. */
export const procedureDraft = (item?: Procedure): ProcedureDraft => ({
  key: nextKey++,
  name: item?.name ?? '',
  area: item?.area ?? '',
  amount: item?.amount ?? '',
  cost: item?.cost?.toString() ?? '',
  note: item?.note ?? '',
});

/** The form for a visit being edited, or a blank one starting on `date`. */
export const draftOf = (visit: Visit | null, date: string): Draft => ({
  date: visit?.date ?? date,
  clinic: visit?.clinic ?? '',
  department: visit?.department ?? '',
  note: visit?.note ?? '',
  cost: visit?.cost?.toString() ?? '',
  nextVisitOn: visit?.nextVisitOn ?? '',
  procedures: visit?.procedures.map(procedureDraft) ?? [],
});

const maxCost = 100_000_000;

/** The first field longer than the server takes, counted in characters as it counts them (#92). */
export const tooLong = (fields: [label: string, value: string, max: number][]) => {
  const found = fields.find(([, value, max]) => charCount(value.trim()) > max);
  return found ? `${found[0]} must be ${found[2]} characters or fewer` : null;
};

/** A cost in won (null when blank), or the reason it cannot be read. */
export const readCost = (label: string, text: string): number | null | string => {
  const value = parseWon(text);
  if (value === undefined) {
    return `${label}: enter whole won, for example 12000 or 12,000`;
  }
  if (value !== null && value > maxCost) return `${label} must be 100 million won or less`;
  return value;
};

/** The request body, or the first reason it cannot be sent. */
export function readDraft(draft: Draft): VisitBody | string {
  if (!isValidDate(draft.date)) return 'Choose a visit date';
  // The daily page opens only these days (#50); a visit outside them could never be seen there.
  if (!inDailyRange(draft.date)) return `Visit date: ${dailyRangeText}`;
  if (!draft.clinic.trim()) return 'Enter the clinic name';
  const long = tooLong([
    ['Clinic name', draft.clinic, 100],
    ['Department', draft.department, 50],
    ['Symptoms and diagnosis note', draft.note, 1000],
  ]);
  if (long) return long;
  const cost = readCost('Visit cost', draft.cost);
  if (typeof cost === 'string') return cost;
  if (draft.nextVisitOn && !isValidDate(draft.nextVisitOn))
    return 'The next appointment date is not valid';
  if (draft.nextVisitOn && !inDailyRange(draft.nextVisitOn))
    return `Next appointment: ${dailyRangeText}`;
  if (draft.nextVisitOn && draft.nextVisitOn < draft.date) {
    return 'The next appointment date cannot be before the visit date';
  }
  const procedures: VisitBody['procedures'] = [];
  for (const [index, item] of draft.procedures.entries()) {
    const label = `Procedure ${index + 1}`;
    if (!item.name.trim()) return `${label}: enter a name`;
    const itemLong = tooLong([
      [`${label} name`, item.name, 100],
      [`${label} area`, item.area, 50],
      [`${label} dose or count`, item.amount, 50],
      [`${label} note`, item.note, 500],
    ]);
    if (itemLong) return itemLong;
    const itemCost = readCost(`${label} cost`, item.cost);
    if (typeof itemCost === 'string') return itemCost;
    procedures.push({
      name: item.name,
      area: item.area,
      amount: item.amount,
      cost: itemCost,
      note: item.note,
    });
  }
  return {
    date: draft.date,
    clinic: draft.clinic,
    department: draft.department,
    note: draft.note,
    cost,
    nextVisitOn: draft.nextVisitOn || null,
    procedures,
  };
}
