import { Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { type Combo, comboSummary, fullName } from './combo-text';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { formatDate, isValidDate, shiftDate } from './daily-date';
import { resultText, useFoodSearch } from './food-search';
import { spanText } from './habit-text';
import { type JunkPeriod, junkText } from './junk-text';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { MoreFoodsButton } from './more-foods-button';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';
import { trackWrite, writesSettled } from './pending-writes';

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
  /** The mark when it was recorded; changing the food later leaves it as it was. */
  isJunk: boolean;
};

type MealDay = {
  entries: Entry[];
  totals: Record<NutrientKey, { value: number | null; missing: number }>;
  junk: { week: JunkPeriod; month: JunkPeriod };
};

type FoodOption = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
  isJunk: boolean;
};

const pathOf = (date: string) => `/api/meals/${date}`;

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

function JunkSummary({ junk }: { junk: MealDay['junk'] }) {
  return (
    <section aria-labelledby="meal-junk-heading" className="flex flex-col gap-1 text-body-sm">
      <h3 id="meal-junk-heading" className="font-medium">
        정크푸드
      </h3>
      {(
        [
          ['이 주', junk.week],
          ['이 달', junk.month],
        ] as const
      ).map(([title, period]) => (
        <p key={title} className="break-keep">
          {title} <span className="text-muted-foreground">{spanText(period)}</span>:{' '}
          {junkText(period)}
        </p>
      ))}
    </section>
  );
}

const JunkBadge = () => <Badge variant="warning">정크푸드</Badge>;

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
        <span className="flex flex-wrap items-center gap-2">
          <span className="wrap-anywhere">{fullName(entry)}</span>
          {entry.isJunk ? <JunkBadge /> : null}
        </span>
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

/** Stored foods, each with its own add button. Search results and recent foods look the same. */
function FoodChoices({
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
              1회 {food.servingSize}
              {food.servingUnit} ·{' '}
              {food.calories === null ? '칼로리 값 없음' : `${food.calories}kcal`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={adding}
            aria-busy={waiting === food.id || undefined}
            aria-label={`${fullName(food)} 추가`}
            onClick={() => onAdd(food)}
          >
            {waiting === food.id ? <Spinner size="sm" label="기록하는 중" /> : null}
            추가
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AddEntry({
  date,
  adding,
  onAdd,
}: {
  date: string;
  adding: boolean;
  /** `path` follows the day's address, e.g. `/combos/3` to record a combo. */
  onAdd: (body: object, path?: string) => Promise<boolean>;
}) {
  const [meal, setMeal] = useState<MealKey>('breakfast');
  // "The same as yesterday" is the usual copy.
  const [copyFrom, setCopyFrom] = useState(() => shiftDate(date, -1));
  const [servings, setServings] = useState('1');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [typedJunk, setTypedJunk] = useState(false);
  // Which button is waiting: `search-<id>`, `recent-<id>`, `combo-<id>`, 'copy' or 'typed'.
  const [pending, setPending] = useState<string | null>(null);
  // Stored foods last recorded, so a usual food needs no search. null until read, or if it failed.
  const [recent, setRecent] = useState<FoodOption[] | null>(null);
  // Why the list could not be read. Kept apart from the add errors below, which the next action
  // clears: this one stays with its retry button until a read succeeds.
  const [recentFailure, setRecentFailure] = useState<string | null>(null);
  const latestRecent = useRef(0);
  const recentHeading = useRef<HTMLParagraphElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [focusAfterRetry, setFocusAfterRetry] = useState(0);
  const focusAfterRead = useRef(false);
  // Combos are read only when asked for, so a day opens with no extra request.
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [loadingCombos, setLoadingCombos] = useState(false);
  // A long result list sits between the forms, so each shows its errors next to its own buttons.
  const { notice: recentNotice, error: recentError, clear: clearRecent } = useNotice();
  const { notice: listNotice, error: listError, clear: clearList } = useNotice();
  const { notice: comboNotice, error: comboError, clear: clearCombo } = useNotice();
  const { notice: copyNotice, error: copyError, clear: clearCopy } = useNotice();
  const { notice: typedNotice, error: typedError, clear: clearTyped } = useNotice();
  // Below a long result list, next to the button that asked for the page.
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const shown = useRef<HTMLParagraphElement>(null);
  // A search clears every message, like the other forms; a next page only its own.
  const {
    foods,
    more,
    searching,
    loadingMore,
    search: searchFoods,
    loadMore,
  } = useFoodSearch<FoodOption>({
    onStart: () => clear(),
    onError: listError,
    onMoreStart: clearPage,
    onMoreError: pageError,
  });
  const mealLabel = meals.find(({ key }) => key === meal)!.label;

  const clear = () => {
    clearRecent();
    clearList();
    clearCombo();
    clearCopy();
    clearTyped();
    clearPage();
  };

  const loadRecent = useCallback(async () => {
    // A slow older read must not put back an order that a newer one already replaced.
    const request = ++latestRecent.current;
    try {
      const data = await requestJson<{ foods: FoodOption[] }>('/api/foods/recent');
      if (request !== latestRecent.current) return;
      setRecent(data.foods);
      setRecentFailure(null);
      // Whichever read clears the failure removes the retry button, even one started by an add
      // that finished after the retry was pressed.
      if (focusAfterRead.current) {
        focusAfterRead.current = false;
        setFocusAfterRetry((count) => count + 1);
      }
    } catch (cause) {
      if (request !== latestRecent.current) return;
      setRecentFailure(errorText(cause));
      // The retry button is still there, and focus with it.
      focusAfterRead.current = false;
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // The retry button goes away once the read works. Focus moves to the list's heading, or to the
  // search when there is still nothing to offer, instead of falling to the page.
  useEffect(() => {
    if (!focusAfterRetry) return;
    const timer = setTimeout(() => (recentHeading.current ?? searchInput.current)?.focus(), 0);
    return () => clearTimeout(timer);
  }, [focusAfterRetry]);

  const retryRecent = () => {
    focusAfterRead.current = true;
    void loadRecent();
  };

  const copyMeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    if (!isValidDate(copyFrom)) {
      copyError('복사할 날짜를 골라 주세요');
      return;
    }
    if (copyFrom === date) {
      copyError('다른 날짜를 골라 주세요');
      return;
    }
    setPending('copy');
    try {
      if (await onAdd({ from: copyFrom, meal }, '/copy')) void loadRecent();
    } catch (cause) {
      // Say which meal of which day was empty, not just that nothing was found.
      copyError(
        cause instanceof RequestError && cause.status === 404
          ? `${formatDate(copyFrom)} ${mealLabel}에 복사할 기록이 없습니다`
          : cause,
      );
    } finally {
      setPending(null);
    }
  };

  const loadCombos = async () => {
    clear();
    setLoadingCombos(true);
    try {
      setCombos((await requestJson<{ combos: Combo[] }>('/api/combos')).combos);
    } catch (cause) {
      comboError(cause);
    } finally {
      setLoadingCombos(false);
    }
  };

  const addCombo = async (combo: Combo) => {
    clear();
    setPending(`combo-${combo.id}`);
    try {
      if (await onAdd({ meal }, `/combos/${combo.id}`)) void loadRecent();
    } catch (cause) {
      comboError(cause);
    } finally {
      setPending(null);
    }
  };

  const readServings = (showError: (message: string) => void) => {
    clear();
    const value = parseAmount(servings);
    if (value === undefined) {
      showError(unreadableAmount('수량'));
      return null;
    }
    if (value === null || !(value > 0)) {
      showError('수량을 0보다 큰 숫자로 입력해 주세요');
      return null;
    }
    if (!hasTwoDecimalsAtMost(value)) {
      showError('수량은 소수 둘째 자리까지 입력해 주세요');
      return null;
    }
    return value;
  };

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchFoods(query);
  };

  /** `from` says which list was used, so the error and the spinner show next to that list. */
  const addFood = async (food: FoodOption, from: 'search' | 'recent') => {
    const showError = from === 'recent' ? recentError : listError;
    const value = readServings(showError);
    if (value === null) return;
    setPending(`${from}-${food.id}`);
    try {
      // The food just eaten moves to the top of the recent list.
      if (await onAdd({ meal, servings: value, foodId: food.id })) void loadRecent();
    } catch (cause) {
      showError(cause);
    } finally {
      setPending(null);
    }
  };

  const waitingIn = (from: 'search' | 'recent') =>
    pending?.startsWith(`${from}-`) ? Number(pending.slice(from.length + 1)) : null;

  const addTyped = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = readServings(typedError);
    if (value === null) return;
    if (!name.trim()) {
      typedError('음식 이름을 입력해 주세요');
      return;
    }
    const kcal = parseAmount(calories);
    if (kcal === undefined) {
      typedError(unreadableAmount('1회 칼로리'));
      return;
    }
    if (kcal === null) {
      typedError('칼로리를 숫자로 입력해 주세요');
      return;
    }
    setPending('typed');
    try {
      const added = await onAdd({ meal, servings: value, name, calories: kcal, isJunk: typedJunk });
      if (added) {
        // Anything typed while waiting is the next entry, not this one.
        setName((current) => (current === name ? '' : current));
        setCalories((current) => (current === calories ? '' : current));
        setTypedJunk((current) => (current === typedJunk ? false : current));
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
          inputMode="decimal"
          autoComplete="off"
          value={servings}
          onChange={(event) => setServings(event.target.value)}
        />
      </div>
      {/* Shown only once there is something to offer, or a reason it could not be read. */}
      {recent?.length || recentFailure ? (
        <section aria-label="최근 먹은 음식" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p ref={recentHeading} tabIndex={-1} className="text-body-sm font-medium outline-none">
              최근 먹은 음식
            </p>
            {recentFailure ? (
              <Button type="button" variant="outline" size="sm" onClick={retryRecent}>
                다시 불러오기
              </Button>
            ) : null}
          </div>
          <Notice
            notice={
              recentFailure
                ? { kind: 'error', text: `최근 먹은 음식을 불러오지 못했습니다: ${recentFailure}` }
                : undefined
            }
          />
          {recent?.length ? (
            <FoodChoices
              label="최근 먹은 음식 목록"
              foods={recent}
              adding={adding}
              waiting={waitingIn('recent')}
              onAdd={(food) => void addFood(food, 'recent')}
            />
          ) : null}
          <Notice notice={recentNotice} />
        </section>
      ) : null}
      <form role="search" onSubmit={search} className="flex gap-2">
        <Input
          ref={searchInput}
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
      <p
        ref={shown}
        role="status"
        tabIndex={-1}
        className="rounded-sm text-body-sm break-keep text-muted-foreground outline-none empty:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {foods === null
          ? null
          : foods.length === 0
            ? '찾는 음식이 없습니다. 아래에 이름과 칼로리를 바로 적을 수 있습니다.'
            : resultText(foods.length, more)}
      </p>
      {foods?.length ? (
        <FoodChoices
          label="검색 결과"
          foods={foods}
          adding={adding}
          waiting={waitingIn('search')}
          onAdd={(food) => void addFood(food, 'search')}
        />
      ) : null}
      {foods?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={pageNotice} />
      <section aria-label="조합" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body-sm font-medium">조합</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingCombos}
            aria-busy={loadingCombos || undefined}
            onClick={() => void loadCombos()}
          >
            {loadingCombos ? <Spinner size="sm" label="불러오는 중" /> : null}
            {combos === null ? '조합에서 고르기' : '조합 다시 불러오기'}
          </Button>
        </div>
        {combos === null ? null : combos.length === 0 ? (
          <p className="text-body-sm break-keep text-muted-foreground">
            저장한 조합이 없습니다. 메뉴의 조합 화면에서 만들 수 있습니다.
          </p>
        ) : (
          <>
            <p className="text-caption break-keep text-muted-foreground">
              고른 끼니에, 조합에 저장한 수량대로 기록합니다.
            </p>
            <ul aria-label="조합 목록" className="flex max-h-80 flex-col divide-y overflow-y-auto">
              {combos.map((combo) => (
                <li key={combo.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="wrap-anywhere">{combo.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {comboSummary(combo)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={adding || combo.items.length === 0}
                    aria-busy={pending === `combo-${combo.id}` || undefined}
                    aria-label={`${combo.name} 기록`}
                    onClick={() => void addCombo(combo)}
                  >
                    {pending === `combo-${combo.id}` ? (
                      <Spinner size="sm" label="기록하는 중" />
                    ) : null}
                    기록
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Notice notice={comboNotice} />
      </section>
      <form
        aria-label="다른 날에서 복사"
        onSubmit={(event) => void copyMeal(event)}
        noValidate
        className="flex flex-col gap-3"
      >
        <p className="text-body-sm font-medium">다른 날에서 복사</p>
        <p id="meal-copy-help" className="text-caption break-keep text-muted-foreground">
          고른 날의 {mealLabel} 기록을 이 날 {mealLabel}에 그대로 더합니다. 영양성분은 그날 기록한
          값 그대로입니다.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="meal-copy-from">복사할 날짜</Label>
            <Input
              id="meal-copy-from"
              type="date"
              className="w-auto"
              value={copyFrom}
              onChange={(event) => setCopyFrom(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={adding}
            aria-busy={pending === 'copy' || undefined}
            aria-describedby="meal-copy-help"
          >
            {pending === 'copy' ? <Spinner size="sm" label="복사하는 중" /> : null}
            {mealLabel} 복사
          </Button>
        </div>
        <Notice notice={copyNotice} />
      </form>
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
              inputMode="decimal"
              autoComplete="off"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="meal-typed-junk"
            checked={typedJunk}
            aria-describedby="meal-typed-junk-help"
            onCheckedChange={(checked) => setTypedJunk(checked === true)}
          />
          <Label htmlFor="meal-typed-junk">정크푸드</Label>
        </div>
        <p
          id="meal-typed-junk-help"
          className="-mt-2 text-caption break-keep text-muted-foreground"
        >
          위의 이 주·이 달 정크푸드 횟수로 셉니다.
        </p>
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
      // A meal added before leaving this day may still be on its way; read after it lands.
      await writesSettled(pathOf(date));
      // Left again while waiting: nothing would show the answer.
      if (!live.current) return false;
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
  const add = async (body: object, path = '') => {
    setAdding(true);
    try {
      const data = await trackWrite(
        pathOf(date),
        requestJson<MealDay>(`${pathOf(date)}${path}`, { method: 'POST', body }),
      );
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
      const data = await trackWrite(
        pathOf(date),
        requestJson<MealDay>(`${pathOf(date)}/entries/${id}`, { method: 'DELETE' }),
      );
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
            <JunkSummary junk={day.junk} />
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
            <AddEntry date={date} adding={adding} onAdd={add} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
