import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { toast } from './components/ui/sonner';
import { MealCard } from './meals';

const date = '2026-03-15';
const noTotal = { value: null, missing: 0 };
const emptyTotals = {
  calories: noTotal,
  carbs: noTotal,
  protein: noTotal,
  fat: noTotal,
  sugars: noTotal,
  sodium: noTotal,
};
const emptyDay = { entries: [], totals: emptyTotals };
const food = {
  id: 7,
  name: '치즈버거',
  brand: '버거집',
  servingSize: 120,
  servingUnit: 'g',
  calories: 300,
};
const entry = {
  id: 1,
  meal: 'lunch',
  name: '치즈버거',
  brand: '버거집',
  servings: 1.5,
  servingSize: 120,
  servingUnit: 'g',
  calories: 450,
  carbs: null,
  protein: null,
  fat: null,
  sugars: null,
  sodium: null,
};
const oneEntry = {
  entries: [entry],
  totals: {
    ...emptyTotals,
    calories: { value: 450, missing: 0 },
    sodium: { value: null, missing: 1 },
  },
};

type Reply = { status?: number; body?: unknown };

// Answers in order, so a test states exactly what the server said to each request.
const server = (...replies: Reply[]) => {
  const fetchMock = vi.fn(() => {
    const { status = 200, body } = replies.shift() ?? {};
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const request = (fetchMock: ReturnType<typeof server>, call: number) => {
  const [url, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

const searchFood = async () => {
  fireEvent.change(screen.getByLabelText('음식 검색'), { target: { value: '치즈' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  return screen.findByRole('button', { name: '버거집 치즈버거 추가' });
};

test('a searched food is recorded with the chosen meal and quantity', async () => {
  const fetchMock = server(
    { body: emptyDay },
    { body: { foods: [food] } },
    { status: 201, body: oneEntry },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.click(screen.getByRole('button', { name: '점심' }));
  expect(screen.getByRole('button', { name: '점심' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '1.5' } });
  fireEvent.click(await searchFood());

  const lunch = await screen.findByRole('region', { name: '점심' });
  expect(within(lunch).getByText('버거집 치즈버거')).toBeInTheDocument();
  expect(within(lunch).getByText('1.5회분 · 1회 120g · 450kcal')).toBeInTheDocument();
  expect(request(fetchMock, 1).url).toBe('/api/foods?q=%EC%B9%98%EC%A6%88');
  expect(request(fetchMock, 2)).toEqual({
    url: `/api/meals/${date}`,
    method: 'POST',
    body: { meal: 'lunch', servings: 1.5, foodId: 7 },
  });
});

test('the totals say when an unknown value leaves them incomplete', async () => {
  server({ body: oneEntry });
  render(<MealCard date={date} />);
  expect(await screen.findByText('450kcal')).toBeInTheDocument();
  expect(screen.getByText(/일부가 빠진 합계입니다/)).toHaveTextContent('나트륨 1개');
});

test('complete totals carry no such note, and a day with no value says so', async () => {
  server({ body: emptyDay });
  render(<MealCard date={date} />);
  await screen.findByText('아직 기록한 식사가 없습니다.');
  expect(screen.queryByText(/일부가 빠진 합계입니다/)).not.toBeInTheDocument();
  expect(screen.getAllByText('값 없음')).toHaveLength(6);
});

test('a food not in the store is recorded with just a name and calories', async () => {
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));

  await waitFor(() => expect(screen.getByLabelText('음식 이름')).toHaveValue(''));
  expect(screen.getByLabelText('1회 칼로리 (kcal)')).toHaveValue(null);
  expect(request(fetchMock, 1).body).toEqual({
    meal: 'breakfast',
    servings: 1,
    name: '떡볶이',
    calories: 480,
  });
});

test('quick entry without its fields explains itself and sends nothing', async () => {
  const fetchMock = server({ body: emptyDay });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('음식 이름을 입력해 주세요');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('칼로리를 숫자로 입력해 주세요'),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each([
  ['', '수량을 0보다 큰 숫자로 입력해 주세요'],
  ['0', '수량을 0보다 큰 숫자로 입력해 주세요'],
  ['1.555', '수량은 소수 둘째 자리까지 입력해 주세요'],
])('a quantity of "%s" is refused before sending', async (value, message) => {
  const fetchMock = server({ body: emptyDay }, { body: { foods: [food] } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value } });
  fireEvent.click(await searchFood());
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('the server refusing an entry shows why and keeps what was typed', async () => {
  server({ body: emptyDay }, { status: 400, body: { error: '칼로리가 너무 큽니다' } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '100000' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('칼로리가 너무 큽니다');
  expect(screen.getByLabelText('음식 이름')).toHaveValue('떡볶이');
  expect(screen.getByRole('button', { name: '바로 기록' })).toBeEnabled();
});

test('an entry in flight cannot be sent twice', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ foods: [food] })))
    .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  vi.stubGlobal('fetch', fetchMock);
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  const add = await searchFood();
  fireEvent.click(add);
  await waitFor(() => expect(add).toBeDisabled());
  fireEvent.click(add);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  await waitFor(() => expect(add).toBeEnabled());
});

test('the typed form also waits for its request, and shows that it is working', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
    .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  vi.stubGlobal('fetch', fetchMock);
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  const save = screen.getByRole('button', { name: /바로 기록/ });
  fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  expect(screen.getByRole('status', { name: '기록하는 중' })).toBeInTheDocument();
  fireEvent.click(save);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  // Typed while waiting: the next entry, which finishing this one must not wipe.
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '김밥' } });
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByLabelText('음식 이름')).toHaveValue('김밥');
  expect(screen.getByLabelText('1회 칼로리 (kcal)')).toHaveValue(null);
});

test('the delete buttons wait while an entry is being recorded', async () => {
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(oneEntry)))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
  );
  render(<MealCard date={date} />);
  const remove = await screen.findByRole('button', { name: '버거집 치즈버거 삭제' });
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: /바로 기록/ }));
  await waitFor(() => expect(remove).toBeDisabled());
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  await waitFor(() => expect(remove).toBeEnabled());
});

test('the next attempt clears the last error', async () => {
  server({ body: emptyDay }, { body: { foods: [food] } }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  await screen.findByRole('alert');
  fireEvent.click(await searchFood());
  await screen.findByText('버거집 치즈버거');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a slower older search does not replace a newer one', async () => {
  const replies: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockImplementation(() => new Promise((resolve) => replies.push(resolve))),
  );
  render(<MealCard date={date} />);
  const box = await screen.findByLabelText('음식 검색');
  const form = box.closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(replies).toHaveLength(2));
  replies[1](new Response(JSON.stringify({ foods: [food] })));
  await screen.findByRole('button', { name: '버거집 치즈버거 추가' });
  replies[0](new Response(JSON.stringify({ foods: [] })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole('button', { name: '버거집 치즈버거 추가' })).toBeInTheDocument();
});

test('a failed search removes results that would read as its answer', async () => {
  server(
    { body: emptyDay },
    { body: { foods: [food] } },
    { status: 500, body: { error: '서버 오류가 발생했습니다' } },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  await searchFood();
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: '버거집 치즈버거 추가' })).not.toBeInTheDocument();
});

test('searching with no match points to direct entry', async () => {
  server({ body: emptyDay }, { body: { foods: [] } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByText(/이름과 칼로리를 바로 적을 수 있습니다/)).toBeInTheDocument();
});

test('a failed search says why', async () => {
  server({ body: emptyDay }, { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.getByRole('button', { name: '검색' })).toBeEnabled();
});

test('deleting asks first, updates the totals, and returns focus to the card', async () => {
  const fetchMock = server({ body: oneEntry }, { body: emptyDay });
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

  expect(await screen.findByText('아직 기록한 식사가 없습니다.')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/meals/${date}/entries/1`,
    method: 'DELETE',
    body: undefined,
  });
  await waitFor(() => expect(screen.getByText('식단').parentElement).toHaveFocus());
});

test('cancelling a delete returns focus to its own button', async () => {
  server({ body: oneEntry });
  render(<MealCard date={date} />);
  const remove = await screen.findByRole('button', { name: '버거집 치즈버거 삭제' });
  remove.focus();
  fireEvent.click(remove);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '버거집 치즈버거 삭제' })).toHaveFocus(),
  );
});

test('an entry gone but the day unreadable does not claim success, and offers another try', async () => {
  const shown = vi.spyOn(toast, 'success');
  server(
    { body: oneEntry },
    { status: 404, body: { error: '식사 기록을 찾을 수 없습니다' } },
    { status: 500, body: { error: '서버 오류가 발생했습니다' } },
    { body: emptyDay },
  );
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(shown).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('아직 기록한 식사가 없습니다.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  shown.mockRestore();
});

test('an entry already gone counts as deleted and the day is read again', async () => {
  const fetchMock = server(
    { body: oneEntry },
    { status: 404, body: { error: '식사 기록을 찾을 수 없습니다' } },
    { body: emptyDay },
  );
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  expect(await screen.findByText('아직 기록한 식사가 없습니다.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('a failed delete says why and keeps the entry and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server({ body: oneEntry }, { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('서버 오류가 발생했습니다');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  shown.mockRestore();
});

test('a failed load offers another try, with no form to record into an unseen day', async () => {
  server({ status: 500, body: { error: '서버 오류가 발생했습니다' } }, { body: oneEntry });
  render(<MealCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.queryByLabelText('음식 검색')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('버거집 치즈버거')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('recording that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
  );
  const { unmount } = render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  unmount();
  finish(new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      '2026-03-15 식사를 기록하지 못했습니다: 서버 오류가 발생했습니다',
    ),
  );
  shown.mockRestore();
});
