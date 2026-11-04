import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import type { Combo } from './combo-text';
import { toast } from './components/ui/sonner';

const rice = {
  id: 3,
  name: '햇반',
  brand: '샘플',
  servingSize: 210,
  servingUnit: 'g',
  calories: 300,
};
const egg = {
  id: 5,
  name: '삶은 달걀',
  brand: null,
  servingSize: 50,
  servingUnit: 'g',
  calories: null,
};

const breakfast: Combo = {
  id: 9,
  name: '아침 세트',
  items: [
    {
      foodId: 3,
      name: '햇반',
      brand: '샘플',
      servings: 1,
      servingSize: 210,
      servingUnit: 'g',
      calories: 300,
    },
    {
      foodId: 5,
      name: '삶은 달걀',
      brand: null,
      servings: 2,
      servingSize: 50,
      servingUnit: 'g',
      calories: null,
    },
  ],
  calories: { value: 300, missing: 1 },
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `combos` answers /api/combos; food searches answer with rice and egg. */
const serve = (combos: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/combos')
        ? combos(url, init)
        : url.startsWith('/api/foods')
          ? json({ foods: [rice, egg] })
          : json({ today: '2026-10-31' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = () => {
  window.history.replaceState(null, '', '/combos');
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/combos') && (init?.method ?? 'GET') !== 'GET',
  );

const search = async (dialog: HTMLElement) => {
  fireEvent.change(within(dialog).getByLabelText('넣을 음식 검색'), { target: { value: '아침' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '검색' }));
  return within(dialog).findByRole('list', { name: '검색 결과' });
};

test('the main menu opens the combos page', async () => {
  serve(() => json({ combos: [] }));
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '조합' }));
  expect(await screen.findByRole('heading', { level: 1, name: '조합' })).toBeInTheDocument();
  expect(await screen.findByText('조합이 없습니다')).toBeInTheDocument();
});

test('a combo shows its foods and says when a calorie is unknown', async () => {
  serve(() => json({ combos: [breakfast] }));
  open();
  const heading = await screen.findByRole('heading', { level: 2, name: '아침 세트' });
  const card = heading.closest<HTMLElement>('[data-slot=card]')!;
  expect(
    within(card).getByText('음식 2개 · 300kcal (칼로리를 모르는 음식 1개 제외)'),
  ).toBeInTheDocument();
  expect(within(card).getByText('샘플 햇반 · 1회분 · 300kcal')).toBeInTheDocument();
  expect(within(card).getByText('삶은 달걀 · 2회분 · 칼로리 값 없음')).toBeInTheDocument();
});

test('a combo whose foods are all gone says how to fix it', async () => {
  serve(() =>
    json({ combos: [{ ...breakfast, items: [], calories: { value: null, missing: 0 } }] }),
  );
  open();
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
  expect(screen.getByText(/수정해서 음식을 넣어 주세요/)).toBeInTheDocument();
});

test('adding finds foods, takes quantities, saves, and shows the list again', async () => {
  let saved = false;
  const success = vi.spyOn(toast, 'success');
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(breakfast, 201);
    }
    return json({ combos: saved ? [breakfast] : [] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: '조합 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('조합 이름'), { target: { value: '아침 세트' } });
  const results = await search(dialog);
  fireEvent.click(within(results).getByRole('button', { name: '샘플 햇반 넣기' }));
  fireEvent.click(within(results).getByRole('button', { name: '삶은 달걀 넣기' }));
  // A food already in the combo is not offered twice.
  expect(within(results).getByRole('button', { name: '샘플 햇반 넣음' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('삶은 달걀 수량'), { target: { value: '1.5' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('heading', { level: 2, name: '아침 세트' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(success).toHaveBeenCalledWith('저장했습니다');
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/combos');
  expect(JSON.parse(String(post[1]?.body))).toEqual({
    name: '아침 세트',
    items: [
      { foodId: 3, servings: 1 },
      { foodId: 5, servings: 1.5 },
    ],
  });
});

test.each([
  ['', [], '조합 이름을 입력해 주세요'],
  ['세트', [], '조합에 음식을 하나 이상 넣어 주세요'],
  ['세트', ['1,5'], '샘플 햇반 수량: 숫자만 입력해 주세요. 소수점은 마침표로 씁니다'],
  ['세트', ['0'], '샘플 햇반 수량을 0보다 큰 숫자로 입력해 주세요'],
  ['세트', ['1.555'], '샘플 햇반 수량은 소수 둘째 자리까지 입력해 주세요'],
])('name %j with quantities %j is refused before sending', async (name, quantities, message) => {
  const fetchMock = serve(() => json({ combos: [] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '조합 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('조합 이름'), { target: { value: name } });
  if (quantities.length) {
    const results = await search(dialog);
    fireEvent.click(within(results).getByRole('button', { name: '샘플 햇반 넣기' }));
    fireEvent.change(within(dialog).getByLabelText('샘플 햇반 수량'), {
      target: { value: quantities[0] },
    });
  }
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  expect(writes(fetchMock)).toHaveLength(0);
});

test('editing starts from the combo, can take a food out, and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(breakfast) : json({ combos: [breakfast] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '아침 세트 수정' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('조합 이름')).toHaveValue('아침 세트');
  expect(within(dialog).getByLabelText('삶은 달걀 수량')).toHaveValue('2');
  fireEvent.click(within(dialog).getByRole('button', { name: '삶은 달걀 빼기' }));
  expect(within(dialog).queryByLabelText('삶은 달걀 수량')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('샘플 햇반 수량'), { target: { value: '2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  await vi.waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/combos/9');
  expect(put[1]?.method).toBe('PUT');
  expect(JSON.parse(String(put[1]?.body))).toEqual({
    name: '아침 세트',
    items: [{ foodId: 3, servings: 2 }],
  });
});

test('a full combo takes no more foods', async () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    ...breakfast.items[0],
    foodId: 100 + index,
    name: `음식 ${index}`,
  }));
  serve(() => json({ combos: [{ ...breakfast, items }] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '아침 세트 수정' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('넣은 음식 20/20')).toBeInTheDocument();
  const results = await search(dialog);
  expect(within(results).getByRole('button', { name: '샘플 햇반 넣기' })).toBeDisabled();
  expect(within(dialog).getByText(/음식은 20개까지 넣을 수 있습니다/)).toBeInTheDocument();
});

test('a server rejection keeps the dialog open with its message and what was typed', async () => {
  serve((_url, init) =>
    init?.method === 'PUT'
      ? json({ error: '같은 이름의 조합이 이미 있습니다' }, 409)
      : json({ combos: [breakfast] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '아침 세트 수정' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('조합 이름'), { target: { value: '점심 세트' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '같은 이름의 조합이 이미 있습니다',
  );
  expect(within(dialog).getByLabelText('조합 이름')).toHaveValue('점심 세트');
  expect(within(dialog).getByRole('button', { name: '저장' })).toBeEnabled();
});

test('deleting asks first, then the list is read again', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json({ combos: deleted ? [] : [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: '아침 세트 삭제' }));
  const question = await screen.findByRole('dialog');
  expect(question).toHaveTextContent('이미 기록한 식사는 그대로 남습니다');
  fireEvent.click(within(question).getByRole('button', { name: '삭제' }));

  expect(await screen.findByText('조합이 없습니다')).toBeInTheDocument();
  expect(writes(fetchMock).map(([url, init]) => [url, init?.method])).toEqual([
    ['/api/combos/9', 'DELETE'],
  ]);
});

test('a combo already gone counts as deleted', async () => {
  let deleted = false;
  serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json({ error: '조합을 찾을 수 없습니다' }, 404);
    }
    return json({ combos: deleted ? [] : [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: '아침 세트 삭제' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }));
  expect(await screen.findByText('조합이 없습니다')).toBeInTheDocument();
});

test('a failed load shows the server message', async () => {
  serve(() => json({ error: '서버 오류가 발생했습니다' }, 500));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
});
