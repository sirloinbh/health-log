import { calorieText } from './calorie-text';
import { fullName } from './combo-text';
import { BusyButton } from './components/busy-button/busy-button';
import { Badge } from './components/ui/badge';
import { Spinner } from './components/ui/spinner';
import type { FoodOption } from './meal-entry';

export const JunkBadge = () => <Badge variant="warning">Junk food</Badge>;

/** Stored foods, each with its own add button. Search results and recent foods look the same. */
export function FoodChoices({
  label,
  foods,
  adding,
  waiting,
  onAdd,
}: {
  label: string;
  foods: FoodOption[];
  adding: boolean;
  /** The food whose add button is waiting, if it is in this list. */
  waiting: number | null;
  onAdd: (food: FoodOption) => void;
}) {
  return (
    <ul aria-label={label} className="flex max-h-80 flex-col divide-y overflow-y-auto">
      {foods.map((food) => (
        <li key={food.id} className="flex items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="wrap-anywhere">{fullName(food)}</span>
              {food.isJunk ? <JunkBadge /> : null}
            </span>
            <span className="text-caption text-muted-foreground">
              Serving {food.servingSize}
              {food.servingUnit} · {calorieText(food.calories)}
            </span>
          </div>
          <BusyButton
            variant="outline"
            size="sm"
            busy={adding}
            aria-busy={waiting === food.id || undefined}
            aria-label={`Add ${fullName(food)}`}
            onClick={() => onAdd(food)}
          >
            {waiting === food.id ? <Spinner size="sm" label="Recording" /> : null}
            Add
          </BusyButton>
        </li>
      ))}
    </ul>
  );
}
