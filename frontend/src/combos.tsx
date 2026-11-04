import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { type Combo, type ComboItem, comboSummary, fullName } from './combo-text';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import { Spinner } from './components/ui/spinner';
import { RequestError, requestJson } from './lib/api';
import { errorText, useNotice } from './lib/use-notice';
import { hasTwoDecimalsAtMost, parseAmount, unreadableAmount } from './number-input';

/** The most foods one combo holds; the server and database refuse more. */
const maxItems = 20;

type FoodOption = {
  id: number;
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number | null;
};

type DraftItem = Omit<ComboItem, 'servings' | 'calories'> & { servings: string };

/** The request body, or the message to show instead of sending. */
function readDraft(name: string, items: DraftItem[]) {
  if (!name.trim()) return '조합 이름을 입력해 주세요';
  if (items.length === 0) return '조합에 음식을 하나 이상 넣어 주세요';
  const read = [];
  for (const item of items) {
    const label = `${fullName(item)} 수량`;
    const servings = parseAmount(item.servings);
    if (servings === undefined) return unreadableAmount(label);
    if (servings === null || !(servings > 0)) return `${label}을 0보다 큰 숫자로 입력해 주세요`;
    if (!hasTwoDecimalsAtMost(servings)) return `${label}은 소수 둘째 자리까지 입력해 주세요`;
    read.push({ foodId: item.foodId, servings });
  }
  return { name, items: read };
}

function ComboDialog({
  combo,
  onClose,
  onSaved,
}: {
  combo: Combo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(combo?.name ?? '');
  const [items, setItems] = useState<DraftItem[]>(
    () => combo?.items.map((item) => ({ ...item, servings: String(item.servings) })) ?? [],
  );
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const { notice, error } = useNotice();
  const { notice: searchNotice, error: searchError, clear: clearSearch } = useNotice();
  const latestSearch = useRef(0);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = ++latestSearch.current;
    setSearching(true);
    clearSearch();
    try {
      const data = await requestJson<{ foods: FoodOption[] }>(
        `/api/foods?q=${encodeURIComponent(query)}`,
      );
      if (request === latestSearch.current) setFoods(data.foods);
    } catch (cause) {
      if (request === latestSearch.current) {
        setFoods(null);
        searchError(cause);
      }
    } finally {
      if (request === latestSearch.current) setSearching(false);
    }
  };

  const addFood = (food: FoodOption) =>
    setItems((current) =>
      current.some((item) => item.foodId === food.id) || current.length >= maxItems
        ? current
        : [
            ...current,
            {
              foodId: food.id,
              name: food.name,
              brand: food.brand,
              servingSize: food.servingSize,
              servingUnit: food.servingUnit,
              servings: '1',
            },
          ],
    );

  const save = async () => {
    const body = readDraft(name, items);
    if (typeof body === 'string') {
      error(body);
      return;
    }
    setSaving(true);
    try {
      await requestJson<Combo>(combo ? `/api/combos/${combo.id}` : '/api/combos', {
        method: combo ? 'PUT' : 'POST',
        body,
      });
      onSaved();
    } catch (cause) {
      error(cause);
      setSaving(false);
    }
  };

  const full = items.length >= maxItems;

  return (
    // Closing during a save would not cancel it, and its late reply would close whatever opened next.
    <Dialog open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{combo ? '조합 수정' : '조합 추가'}</DialogTitle>
          <DialogDescription>
            함께 먹는 음식과 수량을 정해 두면 식단 카드에서 한 번에 기록합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="combo-name">조합 이름</Label>
            <Input
              id="combo-name"
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <section aria-label="조합에 넣은 음식" className="flex flex-col gap-2">
            <p className="text-body-sm font-medium">
              넣은 음식 {items.length}/{maxItems}
            </p>
            {items.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                아래에서 음식을 검색해 넣어 주세요.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {items.map((item) => (
                  <li key={item.foodId} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 text-body-sm wrap-anywhere">
                      {fullName(item)}
                    </span>
                    <Input
                      aria-label={`${fullName(item)} 수량`}
                      className="w-20"
                      inputMode="decimal"
                      autoComplete="off"
                      value={item.servings}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((other) =>
                            other.foodId === item.foodId
                              ? { ...other, servings: event.target.value }
                              : other,
                          ),
                        )
                      }
                    />
                    <span className="text-body-sm text-muted-foreground">회분</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${fullName(item)} 빼기`}
                      onClick={() =>
                        setItems((current) =>
                          current.filter((other) => other.foodId !== item.foodId),
                        )
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form role="search" onSubmit={(event) => void search(event)} className="flex gap-2">
            <Input
              type="search"
              aria-label="넣을 음식 검색"
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
          <Notice notice={searchNotice} />
          <p role="status" className="text-body-sm break-keep text-muted-foreground empty:hidden">
            {foods === null
              ? null
              : foods.length === 0
                ? '찾는 음식이 없습니다. 음식 화면에서 먼저 추가해 주세요.'
                : full
                  ? `검색 결과 ${foods.length}건. 음식은 ${maxItems}개까지 넣을 수 있습니다.`
                  : `검색 결과 ${foods.length}건`}
          </p>
          {foods?.length ? (
            <ul aria-label="검색 결과" className="flex max-h-60 flex-col divide-y overflow-y-auto">
              {foods.map((food) => {
                const added = items.some((item) => item.foodId === food.id);
                return (
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
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={added || full}
                      aria-label={`${fullName(food)} ${added ? '넣음' : '넣기'}`}
                      onClick={() => addFood(food)}
                    >
                      {added ? '넣음' : '넣기'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Notice notice={notice} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            취소
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComboCard({
  combo,
  onEdit,
  onDelete,
}: {
  combo: Combo;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="break-words">
          {combo.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{comboSummary(combo)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {combo.items.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            음식이 모두 지워졌습니다. 수정해서 음식을 넣어 주세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {combo.items.map((item) => (
              <li key={item.foodId} className="wrap-anywhere">
                {fullName(item)} · {item.servings}회분 ·{' '}
                {item.calories === null ? '칼로리 값 없음' : `${item.calories}kcal`}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="조합을 삭제할까요?"
            description={
              <span className="wrap-anywhere">{`'${combo.name}' 조합을 지웁니다. 이미 기록한 식사는 그대로 남습니다.`}</span>
            }
            onConfirm={onDelete}
            trigger={
              <Button variant="outline" size="sm" aria-label={`${combo.name} 삭제`}>
                <Trash2 aria-hidden />
                삭제
              </Button>
            }
          />
          <Button variant="outline" size="sm" aria-label={`${combo.name} 수정`} onClick={onEdit}>
            <Pencil aria-hidden />
            수정
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CombosPage() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  // null: closed, 'new': adding, a combo: editing it.
  const [editing, setEditing] = useState<Combo | 'new' | null>(null);
  const { notice, error, clear } = useNotice();
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    // A slow older read must not overwrite a newer one.
    const request = ++latestLoad.current;
    try {
      const data = await requestJson<{ combos: Combo[] }>('/api/combos');
      if (request !== latestLoad.current) return;
      clear();
      setCombos(data.combos);
    } catch (cause) {
      if (request === latestLoad.current) error(cause);
    }
  }, [clear, error]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (combo: Combo) => {
    try {
      await requestJson(`/api/combos/${combo.id}`, { method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        // Keeps the dialog open with the reason.
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('삭제했습니다');
    void load();
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">조합</h1>
        <p className="text-body text-muted-foreground">
          자주 함께 먹는 음식을 묶어 두고, 하루 기록의 식단 카드에서 한 번에 기록합니다.
        </p>
      </header>
      <div>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden />
          조합 추가
        </Button>
      </div>
      <Notice notice={notice} />
      {combos === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          불러오는 중…
        </p>
      ) : null}
      {combos?.length === 0 ? (
        <EmptyState
          title="조합이 없습니다"
          description="함께 먹는 음식을 묶어 첫 조합을 만들어 보세요."
        />
      ) : null}
      {combos?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {combos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              onEdit={() => setEditing(combo)}
              onDelete={() => remove(combo)}
            />
          ))}
        </div>
      ) : null}
      {editing ? (
        <ComboDialog
          combo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success('저장했습니다');
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
