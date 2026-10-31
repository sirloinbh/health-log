import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { toast } from './components/ui/sonner';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';

const nutrients = [
  { key: 'calories', label: '칼로리', unit: 'kcal' },
  { key: 'carbs', label: '탄수화물', unit: 'g' },
  { key: 'protein', label: '단백질', unit: 'g' },
  { key: 'fat', label: '지방', unit: 'g' },
  { key: 'sugars', label: '당류', unit: 'g' },
  { key: 'sodium', label: '나트륨', unit: 'mg' },
] as const;

const sourceLabels = {
  official: '공식 자료',
  public: '공공 자료',
  label: '제품 표기',
  estimate: '추정값',
  manual: '직접 입력',
} as const;

type NutrientKey = (typeof nutrients)[number]['key'];
type SourceType = keyof typeof sourceLabels;

type Food = Record<NutrientKey, number | null> & {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  servingSize: number;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  checkedOn: string | null;
};

type Form = Record<NutrientKey, string> & {
  name: string;
  brand: string;
  category: string;
  servingSize: string;
  servingUnit: string;
  sourceType: SourceType;
  sourceUrl: string;
  checkedOn: string;
};

const emptyForm: Form = {
  name: '',
  brand: '',
  category: '',
  servingSize: '',
  servingUnit: 'g',
  calories: '',
  carbs: '',
  protein: '',
  fat: '',
  sugars: '',
  sodium: '',
  sourceType: 'manual',
  sourceUrl: '',
  checkedOn: '',
};

const formOf = (food: Food): Form => ({
  name: food.name,
  brand: food.brand ?? '',
  category: food.category ?? '',
  servingSize: String(food.servingSize),
  servingUnit: food.servingUnit,
  calories: food.calories?.toString() ?? '',
  carbs: food.carbs?.toString() ?? '',
  protein: food.protein?.toString() ?? '',
  fat: food.fat?.toString() ?? '',
  sugars: food.sugars?.toString() ?? '',
  sodium: food.sodium?.toString() ?? '',
  sourceType: food.sourceType,
  sourceUrl: food.sourceUrl ?? '',
  checkedOn: food.checkedOn ?? '',
});

const textOrNull = (value: string) => value.trim() || null;
const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

const bodyOf = (form: Form) => ({
  name: form.name,
  brand: textOrNull(form.brand),
  category: textOrNull(form.category),
  servingSize: numberOrNull(form.servingSize),
  servingUnit: form.servingUnit,
  calories: numberOrNull(form.calories),
  carbs: numberOrNull(form.carbs),
  protein: numberOrNull(form.protein),
  fat: numberOrNull(form.fat),
  sugars: numberOrNull(form.sugars),
  sodium: numberOrNull(form.sodium),
  sourceType: form.sourceType,
  sourceUrl: textOrNull(form.sourceUrl),
  checkedOn: textOrNull(form.checkedOn),
});

// The server and database only store http(s) addresses; a link must never run script regardless.
const isSafeLink = (url: string) => /^https?:\/\//i.test(url);

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function FoodDialog({
  food,
  onClose,
  onSaved,
}: {
  food: Food | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(food ? formOf(food) : emptyForm);
  const [saving, setSaving] = useState(false);
  const { notice, error } = useNotice();
  const update = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // A number field reports "" for text like "1,200"; saving that would turn it into "no value".
    const unreadable = [...event.currentTarget.querySelectorAll('input')].find(
      (input) => input.validity.badInput,
    );
    if (unreadable) {
      error(`${unreadable.labels?.[0]?.textContent ?? '입력값'}의 입력값을 확인해 주세요`);
      return;
    }
    setSaving(true);
    try {
      await requestJson<Food>(food ? `/api/foods/${food.id}` : '/api/foods', {
        method: food ? 'PUT' : 'POST',
        body: bodyOf(form),
      });
      onSaved();
    } catch (cause) {
      error(cause);
      setSaving(false);
    }
  };

  return (
    // Closing during a save would not cancel it, and its late reply would close whatever opened next.
    <Dialog open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{food ? '음식 수정' : '음식 추가'}</DialogTitle>
          <DialogDescription>
            영양성분은 1회 제공량 기준입니다. 모르는 값은 비워 두세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <Field id="food-name" label="음식 이름">
            <Input id="food-name" value={form.name} onChange={update('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="food-brand" label="브랜드">
              <Input id="food-brand" value={form.brand} onChange={update('brand')} />
            </Field>
            <Field id="food-category" label="분류">
              <Input id="food-category" value={form.category} onChange={update('category')} />
            </Field>
            <Field id="food-serving-size" label="1회 제공량">
              <Input
                id="food-serving-size"
                type="number"
                inputMode="decimal"
                step="any"
                value={form.servingSize}
                onChange={update('servingSize')}
              />
            </Field>
            <Field id="food-serving-unit" label="단위">
              <Input
                id="food-serving-unit"
                value={form.servingUnit}
                onChange={update('servingUnit')}
              />
            </Field>
            {nutrients.map(({ key, label, unit }) => (
              <Field key={key} id={`food-${key}`} label={`${label} (${unit})`}>
                <Input
                  id={`food-${key}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form[key]}
                  onChange={update(key)}
                />
              </Field>
            ))}
          </div>
          <Field id="food-source-type" label="출처 종류">
            <Select
              value={form.sourceType}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, sourceType: value as SourceType }))
              }
            >
              <SelectTrigger id="food-source-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sourceLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="food-source-url" label="출처 주소">
            <Input
              id="food-source-url"
              type="url"
              value={form.sourceUrl}
              onChange={update('sourceUrl')}
            />
          </Field>
          <Field id="food-checked-on" label="확인 날짜">
            <Input
              id="food-checked-on"
              type="date"
              value={form.checkedOn}
              onChange={update('checkedOn')}
            />
          </Field>
          <Notice notice={notice} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FoodCard({ food, onEdit }: { food: Food; onEdit: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="break-words">
          {food.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">
          {[food.brand, food.category, `1회 ${food.servingSize}${food.servingUnit}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
          {nutrients.map(({ key, label, unit }) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{food[key] === null ? '값 없음' : `${food[key]}${unit}`}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <Badge variant="secondary">{sourceLabels[food.sourceType]}</Badge>
          {food.checkedOn ? <span>{food.checkedOn} 확인</span> : null}
          {food.sourceUrl && isSafeLink(food.sourceUrl) ? (
            <a
              href={food.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              출처 보기
            </a>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`${food.name} 수정`}
            onClick={onEdit}
          >
            <Pencil aria-hidden />
            수정
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FoodsPage() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[] | null>(null);
  // null: closed, 'new': adding, a food: editing it.
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const { notice, error, clear } = useNotice();
  const latestLoad = useRef(0);
  // What the list shows, which can differ from words typed but not yet searched.
  const appliedQuery = useRef('');

  const load = useCallback(
    async (search: string) => {
      // A slow older search must not overwrite a newer one.
      const request = ++latestLoad.current;
      const previousQuery = appliedQuery.current;
      appliedQuery.current = search;
      try {
        const data = await requestJson<{ foods: Food[] }>(
          `/api/foods?q=${encodeURIComponent(search)}`,
        );
        if (request !== latestLoad.current) return;
        clear();
        setFoods(data.foods);
      } catch (cause) {
        if (request === latestLoad.current) {
          // The list still shows the previous search.
          appliedQuery.current = previousQuery;
          error(cause);
        }
      }
    },
    [clear, error],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">음식</h1>
        <p className="text-body text-muted-foreground">영양성분과 출처를 관리합니다.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <Input
            type="search"
            aria-label="음식 검색"
            placeholder="이름 또는 브랜드"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden />
          음식 추가
        </Button>
      </div>
      <Notice notice={notice} />
      {foods === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          불러오는 중…
        </p>
      ) : null}
      {foods?.length === 0 ? (
        <EmptyState title="음식이 없습니다" description="검색어를 바꾸거나 음식을 추가해 보세요." />
      ) : null}
      {foods?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {foods.map((food) => (
            <FoodCard key={food.id} food={food} onEdit={() => setEditing(food)} />
          ))}
        </div>
      ) : null}
      {editing ? (
        <FoodDialog
          food={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            // The saved food may not match the current search, so the list alone cannot confirm it.
            toast.success('저장했습니다');
            void load(appliedQuery.current);
          }}
        />
      ) : null}
    </section>
  );
}
