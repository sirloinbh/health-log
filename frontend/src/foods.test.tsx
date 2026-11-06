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
  isJunk: false,
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
    isJunk: false,
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
  expect(within(dialog).getByLabelText('칼로리 (kcal)')).toHaveValue('300');
  expect(within(dialog).getByLabelText('지방 (g)')).toHaveValue('');
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

test.each([
  '1회 제공량',
  '칼로리 (kcal)',
  '탄수화물 (g)',
  '단백질 (g)',
  '지방 (g)',
  '당류 (g)',
  '나트륨 (mg)',
])('a comma decimal in %s is refused, never read as ten times the value', async (label) => {
  const fetchMock = serve(() => json({ foods: [] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('음식 이름'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('1회 제공량'), { target: { value: '120' } });
  const field = within(dialog).getByLabelText(label);
  fireEvent.change(field, { target: { value: '49,5' } });
  // A number field would have dropped the comma and shown 495 here.
  expect(field).toHaveValue('49,5');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    `${label}: 숫자만 입력해 주세요. 소수점은 마침표로 씁니다`,
  );
  expect(field).toHaveValue('49,5');
  expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'POST')).toBe(false);
});

test('a decimal written with a point is sent as that number', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(food, 201) : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '음식 추가' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('음식 이름'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('1회 제공량'), { target: { value: ' 49.5 ' } });
  fireEvent.change(within(dialog).getByLabelText('단백질 (g)'), { target: { value: '15.25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'POST')).toBe(true),
  );
  const post = foodCalls(fetchMock).find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({ servingSize: 49.5, protein: 15.25 });
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

test('a long list says more foods are waiting and adds the next page below', async () => {
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null })
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  expect(screen.getByText('음식 1개 표시 중. 더 있습니다.')).toBeInTheDocument();

  const more = screen.getByRole('button', { name: '결과 더 보기' });
  more.focus();
  fireEvent.click(more);
  expect(await screen.findByRole('heading', { level: 2, name: '피자' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=&offset=100');
  expect(screen.queryByRole('button', { name: '결과 더 보기' })).not.toBeInTheDocument();
  // With the button gone, focus lands on the line that says how many foods are shown.
  await vi.waitFor(() => expect(screen.getByText('음식 2개')).toHaveFocus());
});

test('while the next page loads, the button keeps the focus and ignores presses', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? new Promise((resolve) => (finish = resolve))
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  const more = await screen.findByRole('button', { name: '결과 더 보기' });
  more.focus();
  fireEvent.click(more);
  await vi.waitFor(() => expect(more).toHaveAttribute('aria-disabled', 'true'));
  // Not `disabled`: a disabled button drops the keyboard focus to the start of the page.
  expect(more).not.toBeDisabled();
  expect(more).toHaveFocus();
  fireEvent.click(more);
  expect(foodCalls(fetchMock).filter(([url]) => url.includes('offset='))).toHaveLength(1);
  finish(json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: 200 }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  expect(more).not.toHaveAttribute('aria-disabled');
});

test('after the last page, focus moved elsewhere while waiting stays there', async () => {
  let finish = (_response: Response) => {};
  serve((url) =>
    url.endsWith('offset=100')
      ? new Promise((resolve) => (finish = resolve))
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  const more = await screen.findByRole('button', { name: '결과 더 보기' });
  more.focus();
  fireEvent.click(more);
  const search = screen.getByLabelText('음식 검색');
  search.focus();
  finish(json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  await new Promise((resolve) => setTimeout(resolve));
  expect(search).toHaveFocus();
});

test('a next page leaves the message of a failed search in place', async () => {
  serve((url) => {
    if (url.endsWith('q=broken')) return json({ error: '검색이 실패했습니다' }, 500);
    return url.includes('offset=')
      ? json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null })
      : json({ foods: [food], nextOffset: 100 });
  });
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  fireEvent.change(screen.getByLabelText('음식 검색'), { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('검색이 실패했습니다');

  fireEvent.click(screen.getByRole('button', { name: '결과 더 보기' }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  // The list is still the answer to the earlier words, so the failure must stay in view.
  expect(screen.getByRole('alert')).toHaveTextContent('검색이 실패했습니다');
});

test('a failed next page keeps the list and the button to try again', async () => {
  serve((url) =>
    url.endsWith('offset=100')
      ? json({ error: '서버 오류가 발생했습니다' }, 500)
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '결과 더 보기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '결과 더 보기' })).not.toHaveAttribute('aria-disabled');
});

// Focuses the button first, as a keyboard user would; a pointer click does not in every browser.
const openWith = async (name: string) => {
  const opener = await screen.findByRole('button', { name });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: await screen.findByRole('dialog') };
};

test('cancelling the add dialog returns focus to the add button', async () => {
  serve(() => json({ foods: [] }));
  open();
  const { opener, dialog } = await openWith('음식 추가');
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());
});

test('closing the edit dialog with Escape returns focus to that food’s edit button', async () => {
  serve(() => json({ foods: [food, { ...food, id: 2, name: '감자튀김' }] }));
  open();
  const { opener, dialog } = await openWith('치즈버거 수정');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await vi.waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('saving returns focus to the edit button while the food is still listed', async () => {
  serve((_url, init) => (init?.method === 'PUT' ? json(food) : json({ foods: [food] })));
  open();
  const { dialog } = await openWith('치즈버거 수정');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: '치즈버거 수정' })).toHaveFocus(),
  );
});

test('a saved food the search no longer finds leaves focus on the page title, not the body', async () => {
  let saved = false;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json({ ...food, name: '더블버거' });
    }
    return json({ foods: saved ? [] : [food] });
  });
  open();
  const { dialog } = await openWith('치즈버거 수정');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: '음식' })).toHaveFocus(),
  );
});

test('a slow reload that drops the saved food still leaves focus on the page title', async () => {
  let saved = false;
  let finishReload: (() => void) | undefined;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json({ ...food, name: '더블버거' });
    }
    if (!saved) return json({ foods: [food] });
    // Slower than the dialog's close, so focus is back on the edit button when the list changes.
    return new Promise<Response>((resolve) => (finishReload = () => resolve(json({ foods: [] }))));
  });
  open();
  const { opener, dialog } = await openWith('치즈버거 수정');
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());

  // The reload has to be on its way, or finishing it would do nothing.
  await vi.waitFor(() => expect(finishReload).toBeDefined());
  finishReload?.();
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: '음식' })).toHaveFocus(),
  );
});

test('once focus has moved on from the edit button, a later redraw leaves it alone', async () => {
  serve((url) => json({ foods: url === '/api/foods?q=' ? [food] : [] }));
  open();
  const { opener, dialog } = await openWith('치즈버거 수정');
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());

  // Typing in the search field moves focus on. A mouse click on 검색 that does not focus the
  // button (as in Safari) then leaves focus on <body> while the search removes the card.
  const field = screen.getByRole('searchbox', { name: '음식 검색' });
  field.focus();
  fireEvent.change(field, { target: { value: '없는음식' } });
  field.blur();
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByText('음식이 없습니다')).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole('heading', { level: 1, name: '음식' })).not.toHaveFocus();
});

// #38
test('a food can be marked junk food, shown on its card, and the edit starts from the mark', async () => {
  let current = food;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'PUT') {
      current = { ...food, ...(JSON.parse(String(init.body)) as object) };
      return json(current);
    }
    return json({ foods: [current] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: '치즈버거 수정' }));
  let dialog = await screen.findByRole('dialog');
  const mark = within(dialog).getByRole('checkbox', { name: '정크푸드' });
  expect(mark).not.toBeChecked();
  expect(mark).toHaveAccessibleDescription(/이미 기록한 식사는 그대로입니다/);
  fireEvent.click(mark);
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = foodCalls(fetchMock).find(([, init]) => init?.method === 'PUT')!;
  expect(JSON.parse(String(put[1]?.body))).toMatchObject({ isJunk: true });
  const card = (await screen.findByRole('heading', { level: 2, name: '치즈버거' })).closest(
    '[data-slot="card"]',
  ) as HTMLElement;
  expect(await within(card).findByText('정크푸드')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: '치즈버거 수정' }));
  dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('checkbox', { name: '정크푸드' })).toBeChecked();
});
