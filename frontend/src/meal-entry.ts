// What the meal card and its add forms share: the meals of a day, the stored foods offered for
// adding, and which add button is waiting (#210).

export const meals = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
] as const;

export type MealKey = (typeof meals)[number]['key'];

/** A stored food as the search and the recent list offer it. */
export type FoodOption = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
  isJunk: boolean;
};

/** The two lists a stored food can be added from; each shows its own spinner and errors. */
export type FoodList = 'search' | 'recent';

/** The add button that is waiting for the server, so only it shows a spinner. */
export type Pending =
  | { kind: 'food'; list: FoodList; foodId: number }
  | { kind: 'combo'; comboId: number }
  | { kind: 'copy' }
  | { kind: 'typed' };

/** The food whose add button in `list` is waiting, if any. */
export const waitingFood = (pending: Pending | null, list: FoodList) =>
  pending?.kind === 'food' && pending.list === list ? pending.foodId : null;

/** Whether the combo's record button is waiting. */
export const waitingCombo = (pending: Pending | null, comboId: number) =>
  pending?.kind === 'combo' && pending.comboId === comboId;
