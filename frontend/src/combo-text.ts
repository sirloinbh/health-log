// What the API answers for a combo (#46), and how the combo and meal screens describe it.

export type ComboItem = {
  foodId: number;
  name: string;
  brand: string | null;
  servings: number;
  servingSize: number | null;
  servingUnit: string | null;
  /** For all the servings; null when the food's calories are not known. */
  calories: number | null;
};

export type Combo = {
  id: number;
  name: string;
  items: ComboItem[];
  /** `missing` counts foods whose calories are not known, so `value` leaves them out. */
  calories: { value: number | null; missing: number };
};

export const fullName = ({ brand, name }: { brand: string | null; name: string }) =>
  brand ? `${brand} ${name}` : name;

/** "음식 3개 · 650kcal", saying when some calories are unknown. */
export function comboSummary(combo: Combo) {
  if (combo.items.length === 0) return '음식이 없습니다';
  const { value, missing } = combo.calories;
  const calories = value === null ? '칼로리 값 없음' : `${value}kcal`;
  const unknown = missing > 0 && value !== null ? ` (칼로리를 모르는 음식 ${missing}개 제외)` : '';
  return `음식 ${combo.items.length}개 · ${calories}${unknown}`;
}
