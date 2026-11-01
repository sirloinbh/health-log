import { Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';

const meals = [
  { key: 'breakfast', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
  { key: 'snack', label: '간식' },
] as const;

const nutrients = [
  { key: 'calories', label: '칼로리', unit: 'kcal' },
  { key: 'carbs', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
  { key: 'sugars', label: '당류', unit: 'g' },
  { key: 'sodium', label: '나트륨', unit: 'mg' },
] as const;

type MealKey = (typeof meals)[number]['key'];
type NutrientKey = (typeof nutrients)[number]['key'];

type Entry = Record<NutrientKey, number | null> & {
  id: number;
  meal: MealKey;
  name: string;
  brand: string | null;
  servings: number;
  servingSize: number | null;
  servingUnit: string | null;
};

type MealDay = {
  entries: Entry[];
  totals: Record<NutrientKey, { value: number | null; missing: number }>;
};

type FoodOption = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
};

const pathOf = (date: string) => `/api/meals/${date}`;

const fullName = ({ brand, name }: { brand: string | null; name: string }) =>
  brand ? `${brand} ${name}` : name;

const hasTwoDecimalsAtMost = (value: number) => Number(value.toFixed(2)) === value;

function Totals({ totals }: { totals: MealDay['totals'] }) {
  const incomplete = nutrients.filter(({ key }) => totals[key].missing > 0);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
        {nutrients.map(({ key, label, unit }) => (
          <div key={key}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{totals[key].value === null ? '값 없음' : `${totals[key].value}${unit}`}</dd>
          </div>
        ))}
      </dl>
      {incomplete.length > 0 ? (
        <p className="text-body-sm break-keep text-muted-foreground">
          값을 모르는 음식이 있어 일부가 빠진 합계입니다:{' '}
          {incomplete.map(({ key, label }) => `${label} ${totals[key].missing}개`).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  disabled,
  onDelete,
}: {
  entry: Entry;
  disabled: boolean;
  onDelete: () => Promise<unknown>;
}) {
  const serving =
    entry.servingSize === null ? null : ` · 1회 ${entry.servingSize}${entry.servingUnit ?? ''}`;
  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <span className="wrap-anywhere">{fullName(entry)}</span>
        <span className="text-caption text-muted-foreground">
          {entry.servings}회분{serving} ·{' '}
          {entry.calories === null ? '칼로리 값 없음' : `${entry.calories}kcal`}
        </span>
      </div>
      <ConfirmDialog
        title="식사 기록을 삭제할까요?"
        description={
          <span className="wrap-anywhere">{`'${fullName(entry)}' 기록을 지웁니다.`}</span>
        }
        onConfirm={onDelete}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`${fullName(entry)} 삭제`}
          >
            <Trash2 aria-hidden />
          </Button>
        }
      />
    </li>
  );
}

function AddEntry({
  adding,
  onAdd,
}: {
  adding: boolean;
  onAdd: (body: object) => Promise<boolean>;
}) {
  const [meal, setMeal] = useState<MealKey>('breakfast');
  const [servings, setServings] = useState('1');
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [pending, setPending] = useState<number | 'typed' | null>(null);
  // A long result list sits between the two forms, so each shows its errors next to its own buttons.
  const { notice: listNotice, error: listError, clear: clearList } = useNotice();
  const { notice: typedNotice, error: typedError, clear: clearTyped } = useNotice();
  const latestSearch = useRef(0);
  const servingsInput = useRef<HTMLInputElement>(null);
  const caloriesInput = useRef<HTMLInputElement>(null);

  const clear = () => {
    clearList();
    clearTyped();
  };

  const readServings = (showError: (message: string) => void) => {
    clear();
    // A number field reports "" for unreadable text such as "1,5".
    const value = Number(servings);
    if (servingsInput.current?.validity.badInput || servings.trim() === '' || !(value > 0)) {
      showError('수량을 0보다 큰 숫자로 입력해 주세요');
      return null;
    }
    if (!hasTwoDecimalsAtMost(value)) {
      showError('수량은 소수 둘째 자리까지 입력해 주세요');
      return null;
    }
    return value;
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = ++latestSearch.current;
    setSearching(true);
    clear();
    try {
      const data = await requestJson<{ foods: FoodOption[] }>(
        `/api/foods?q=${encodeURIComponent(query)}`,
      );
      if (request === latestSearch.current) setFoods(data.foods);
    } catch (cause) {
      if (request === latestSearch.current) {
        // Earlier results would read as the answer to this search.
        setFoods(null);
        listError(cause);
      }
    } finally {
      if (request === latestSearch.current) setSearching(false);
    }
  };

  const addFood = async (food: FoodOption) => {
    const value = readServings(listError);
    if (value === null) return;
    setPending(food.id);
    await onAdd({ meal, servings: value, foodId: food.id }).catch((cause: unknown) =>
      listError(cause),
    );
    setPending(null);
  };

  const addTyped = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = readServings(typedError);
    if (value === null) return;
    if (!name.trim()) {
      typedError('음식 이름을 입력해 주세요');
      return;
    }
    if (caloriesInput.current?.validity.badInput || calories.trim() === '') {
      typedError('칼로리를 숫자로 입력해 주세요');
      return;
    }
    setPending('typed');
    try {
      const added = await onAdd({ meal, servings: value, name, calories: Number(calories) });
      if (added) {
        // Anything typed while waiting is the next entry, not this one.
        setName((current) => (current === name ? '' : current));
        setCalories((current) => (current === calories ? '' : current));
      }
    } catch (cause) {
      typedError(cause);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div role="group" aria-label="끼니" className="flex flex-wrap gap-2">
        {meals.map(({ key, label }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={meal === key ? 'default' : 'outline'}
            aria-pressed={meal === key}
            onClick={() => setMeal(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meal-servings">수량 (1회 제공량 기준)</Label>
        <Input
          id="meal-servings"
          ref={servingsInput}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={servings}
          onChange={(event) => setServings(event.target.value)}
        />
      </div>
      <form role="search" onSubmit={(event) => void search(event)} className="flex gap-2">
        <Input
          type="search"
          aria-label="음식 검색"
          placeholder="이름 또는 브랜드"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={searching}
          aria-busy={searching || undefined}
        >
          {searching ? <Spinner size="sm" label="검색하는 중" /> : null}
          검색
        </Button>
      </form>
      <Notice notice={listNotice} />
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p role="status" className="text-body-sm break-keep text-muted-foreground empty:hidden">
        {foods === null
          ? null
          : foods.length === 0
            ? '찾는 음식이 없습니다. 아래에 이름과 칼로리를 바로 적을 수 있습니다.'
            : `검색 결과 ${foods.length}건`}
      </p>
      {foods?.length ? (
        <ul aria-label="검색 결과" className="flex max-h-80 flex-col divide-y overflow-y-auto">
          {foods.map((food) => (
            <li key={food.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="wrap-anywhere">{fullName(food)}</span>
                <span className="text-caption text-muted-foreground">
                  1회 {food.servingSize}
                  {food.servingUnit} ·{' '}
                  {food.calories === null ? '칼로리 값 없음' : `${food.calories}kcal`}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={adding}
                aria-busy={pending === food.id || undefined}
                aria-label={`${fullName(food)} 추가`}
                onClick={() => void addFood(food)}
              >
                {pending === food.id ? <Spinner size="sm" label="기록하는 중" /> : null}
                추가
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={(event) => void addTyped(event)} noValidate className="flex flex-col gap-3">
        <p className="text-body-sm font-medium">저장소에 없는 음식</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="meal-name">음식 이름</Label>
            <Input id="meal-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="meal-calories">1회 칼로리 (kcal)</Label>
            <Input
              id="meal-calories"
              ref={caloriesInput}
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </div>
        </div>
        <Notice notice={typedNotice} />
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          disabled={adding}
          aria-busy={pending === 'typed' || undefined}
        >
          {pending === 'typed' ? <Spinner size="sm" label="기록하는 중" /> : null}
          바로 기록
        </Button>
      </form>
    </div>
  );
}

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
export function MealCard({ date }: { date: string }) {
  const [day, setDay] = useState<MealDay | null>(null);
  const [adding, setAdding] = useState(false);
  const { notice, error, clear } = useNotice();
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  // Counts changes the server has answered, so a read started before one cannot undo it on screen.
  const changes = useRef(0);

  /** Resolves to whether the day could be read. */
  const load = useCallback(async () => {
    clear();
    const seen = changes.current;
    const stillCurrent = () => live.current && seen === changes.current;
    try {
      const data = await requestJson<MealDay>(pathOf(date));
      if (stillCurrent()) setDay(data);
      return true;
    } catch (cause) {
      if (stillCurrent()) error(cause);
      return false;
    }
  }, [clear, date, error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  // The delete button is gone by now, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  /** Resolves to whether it was added; a failure rejects so the form can show it next to its fields. */
  const add = async (body: object) => {
    setAdding(true);
    try {
      const data = await requestJson<MealDay>(pathOf(date), { method: 'POST', body });
      changes.current += 1;
      if (!live.current) {
        toast.success(`${date} 식사를 기록했습니다`);
        return false;
      }
      setDay(data);
      // What this answers replaces whatever an earlier failed read left on screen.
      clear();
      toast.success('기록했습니다');
      return true;
    } catch (cause) {
      if (live.current) throw cause;
      // Moving to another day removes the form. With no answer, the server may still have saved it.
      const unanswered = cause instanceof RequestError && cause.status === undefined;
      toast.error(
        `${date} 식사를 ${unanswered ? '기록했는지 확인하지 못했습니다' : '기록하지 못했습니다'}: ${errorText(cause)}`,
      );
      return false;
    } finally {
      if (live.current) setAdding(false);
    }
  };

  const remove = async (id: number) => {
    try {
      const data = await requestJson<MealDay>(`${pathOf(date)}/entries/${id}`, {
        method: 'DELETE',
      });
      changes.current += 1;
      if (live.current) setDay(data);
    } catch (cause) {
      if (!(cause instanceof RequestError && cause.status === 404)) {
        // Keeps the dialog open with the reason.
        toast.error(errorText(cause));
        throw cause;
      }
      // Already gone counts as deleted, but the list and totals are out of date.
      if (live.current && !(await load())) return;
    }
    toast.success('삭제했습니다');
    setMoveFocus((count) => count + 1);
  };

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">식단</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void load();
              // Trying again removes this button, which would drop keyboard focus to the page.
              setMoveFocus((count) => count + 1);
            }}
          >
            다시 시도
          </Button>
        ) : null}
        {!notice && !day ? (
          <div role="status" aria-busy="true" aria-label="식사 기록 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {day ? (
          <>
            <Totals totals={day.totals} />
            {day.entries.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">아직 기록한 식사가 없습니다.</p>
            ) : (
              meals
                .filter(({ key }) => day.entries.some((entry) => entry.meal === key))
                .map(({ key, label }) => (
                  <section key={key} aria-label={label} className="flex flex-col gap-2">
                    <h3 className="text-body-sm font-semibold">{label}</h3>
                    <ul className="flex flex-col divide-y">
                      {day.entries
                        .filter((entry) => entry.meal === key)
                        .map((entry) => (
                          <EntryRow
                            key={entry.id}
                            entry={entry}
                            disabled={adding}
                            onDelete={() => remove(entry.id)}
                          />
                        ))}
                    </ul>
                  </section>
                ))
            )}
            <AddEntry adding={adding} onAdd={add} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
