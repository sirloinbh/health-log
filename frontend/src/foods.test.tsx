import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';

const food = {
  id: 1,
  name: '치즈버거',
  brand: '샘플버거',
  category: null,
  servingSize: 120,
  servingUnit: 'g',
  calories: 300,
  carbs: 0,
  protein: 15.5,
  fat: null,
  sugars: null,
  sodium: null,
  sourceType: 'official',
  sourceUrl: 'https://example.com/menu',
  checkedOn: '2026-10-31',
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

const serve = (foods: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/foods') ? foods(url, init) : json({ today: '2026-10-31' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = () => {
  window.history.replaceState(null, '', '/foods');
  render(<App />);
};

const foodCalls = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/foods'));

test('the main menu opens the foods page', async () => {
  serve(() => json({ foods: [] }));
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '음식' }));
  expect(await screen.findByRole('heading', { level: 1, name: '음식' })).toBeInTheDocument();
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
});

test('a food shows its numbers, separates zero from no value, and links its source', async () => {
  serve(() => json({ foods: [food] }));
  open();
  const heading = await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  const card = heading.closest<HTMLElement>('[data-slot=card]')!;
  expect(within(card).getByText('샘플버거 · 1회 120g')).toBeInTheDocument();
  expect(within(card).getByText('300kcal')).toBeInTheDocument();
  expect(within(card).getByText('0g')).toBeInTheDocument();
  expect(within(card).getAllByText('값 없음')).toHaveLength(3);
  expect(within(card).getByText('공식 자료')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: '출처 보기' })).toHaveAttribute(
    'href',
    'https://example.com/menu',
  );
});

test('a source address that is not http is not turned into a link', async () => {
  serve(() => json({ foods: [{ ...food, sourceUrl: 'javascript:alert(1)' }] }));
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  expect(screen.queryByRole('link', { name: '출처 보기' })).not.toBeInTheDocument();
});

test('searching sends the encoded words', async () => {
  const fetchMock = serve(() => json({ foods: [] }));
  open();
  await screen.findByText('음식이 없습니다');
  fireEvent.change(screen.getByLabelText('음식 검색'), { target: { value: '와퍼 100%' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=%EC%99%80%ED%8D%BC%20100%25'),
  );
});

test('a slow older search does not overwrite a newer one', async () => {
  let finishOld = (_response: Response) => {};
  serve((url) => {
    if (url === '/api/foods?q=') return json({ foods: [] });
    if (url.endsWith('old')) return new Promise((resolve) => (finishOld = resolve));
    return json({ foods: [food] });
  });
  open();
  await screen.findByText('음식이 없습니다');
  const search = screen.getByLabelText('음식 검색');
  fireEvent.change(search, { target: { value: 'old' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  fireEvent.change(search, { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });

  finishOld(json({ foods: [] }));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
});

test('adding sends blanks as no value, then shows the list again', async () => {
  let saved = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(food, 201);
    }
    return json({ foods: saved ? [food] : [] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('음식 이름'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('1회 제공량'), { target: { value: '120' } });
  fireEvent.change(within(dialog).getByLabelText('칼로리 (kcal)'), { target: { value: '0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const post = foodCalls(fetchMock).find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({
    name: '치즈버거',
    brand: null,
    servingSize: 120,
    servingUnit: 'g',
    calories: 0,
    sodium: null,
    sourceType: 'manual',
    sourceUrl: null,
    checkedOn: null,
  });
});

test('a server rejection keeps the form open with the Korean message and the typed values', async () => {
  serve((_url, init) =>
    init?.method === 'POST'
      ? json({ error: '1회 제공량을 입력해 주세요' }, 400)
      : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('음식 이름'), { target: { value: '치즈버거' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('1회 제공량을 입력해 주세요');
  expect(within(dialog).getByLabelText('음식 이름')).toHaveValue('치즈버거');
  expect(within(dialog).getByRole('button', { name: '저장' })).toBeEnabled();
});

test('editing starts from the food and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json({ ...food, calories: 310 }) : json({ foods: [food] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '치즈버거 수정' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('칼로리 (kcal)')).toHaveValue(300);
  expect(within(dialog).getByLabelText('지방 (g)')).toHaveValue(null);
  expect(within(dialog).getByLabelText('확인 날짜')).toHaveValue('2026-10-31');
  fireEvent.change(within(dialog).getByLabelText('칼로리 (kcal)'), { target: { value: '310' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'PUT')).toBe(true),
  );
  const put = foodCalls(fetchMock).find(([, init]) => init?.method === 'PUT')!;
  expect(put[0]).toBe('/api/foods/1');
  expect(JSON.parse(String(put[1]?.body))).toMatchObject({
    calories: 310,
    fat: null,
    sourceType: 'official',
    sourceUrl: 'https://example.com/menu',
  });
});

test('text a number field cannot read is reported instead of saved as no value', async () => {
  const fetchMock = serve(() => json({ foods: [] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  const calories = within(dialog).getByLabelText('칼로리 (kcal)');
  // jsdom never reports badInput; a real browser does for text like "1,200".
  Object.defineProperty(calories, 'validity', { value: { badInput: true } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '칼로리 (kcal)의 입력값을 확인해 주세요',
  );
  expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'POST')).toBe(false);
});

test('a save in progress cannot be cancelled or closed', async () => {
  let finish = (_response: Response) => {};
  serve((_url, init) =>
    init?.method === 'POST' ? new Promise((resolve) => (finish = resolve)) : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await within(dialog).findByRole('button', { name: '저장 중…' });

  expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  finish(json(food, 201));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a save is confirmed even when the current search hides the food', async () => {
  // Toasts outlive a test in sonner's global store, so check the call rather than the text.
  const success = vi.spyOn(toast, 'success');
  serve((_url, init) => (init?.method === 'POST' ? json(food, 201) : json({ foods: [] })));
  open();
  await screen.findByText('음식이 없습니다');
  fireEvent.click(screen.getByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await vi.waitFor(() => expect(success).toHaveBeenCalledWith('저장했습니다'));
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
});

test('saving reloads the search on screen, not words typed but not searched', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(food, 201) : json({ foods: [] }),
  );
  open();
  await screen.findByText('음식이 없습니다');
  const search = screen.getByLabelText('음식 검색');
  fireEvent.change(search, { target: { value: 'applied' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=applied'));
  fireEvent.change(search, { target: { value: 'typed' } });

  fireEvent.click(screen.getByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=applied'));
});

test('after a failed search, saving reloads the search the list still shows', async () => {
  const fetchMock = serve((url, init) => {
    if (init?.method === 'PUT') return json(food);
    if (url.endsWith('q=broken')) return json({ error: '서버 오류가 발생했습니다' }, 500);
    return json({ foods: [food] });
  });
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  const search = screen.getByLabelText('음식 검색');
  fireEvent.change(search, { target: { value: 'shown' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=shown'));
  fireEvent.change(search, { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('alert');

  fireEvent.click(screen.getByRole('button', { name: '치즈버거 수정' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=shown'));
});

test('a failed load shows the server message', async () => {
  serve(() => json({ error: '서버 오류가 발생했습니다' }, 500));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.queryByText('음식이 없습니다')).not.toBeInTheDocument();
});
