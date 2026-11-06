import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

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
const noJunkPeriod = (from: string, to: string) => ({
  from,
  to,
  times: 0,
  days: 0,
  calories: { value: null, missing: 0 },
});
const noJunk = {
  week: noJunkPeriod('2026-03-09', '2026-03-15'),
  month: noJunkPeriod('2026-03-01', '2026-03-31'),
};
const emptyDay = { entries: [], totals: emptyTotals, junk: noJunk };
const food = {
  id: 7,
  name: '치즈버거',
  brand: '버거집',
  servingSize: 120,
  servingUnit: 'g',
  calories: 300,
  isJunk: false,
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
  isJunk: false,
};
const oneEntry = {
  entries: [entry],
  junk: noJunk,
  totals: {
    ...emptyTotals,
    calories: { value: 450, missing: 0 },
    sodium: { value: null, missing: 1 },
  },
};

// The card reads the recent foods on its own whenever it opens or records something. That read is
// answered here, apart from the replies each test lists in order, so those stay about the day.
let recentReply: () => Response | Promise<Response> = () =>
  new Response(JSON.stringify({ foods: [] }));
const recentCalls: string[] = [];

beforeEach(() => {
  recentReply = () => new Response(JSON.stringify({ foods: [] }));
  recentCalls.length = 0;
});

const stubFetch = (inner: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url !== '/api/foods/recent') return inner(url, init);
      recentCalls.push(url);
      return Promise.resolve(recentReply());
    }),
  );

type Reply = { status?: number; body?: unknown };

// Answers in order, so a test states exactly what the server said to each request.
const server = (...replies: Reply[]) => {
  const fetchMock = vi.fn(() => {
    const { status = 200, body } = replies.shift() ?? {};
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  });
  stubFetch(fetchMock);
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
  expect(screen.getByLabelText('1회 칼로리 (kcal)')).toHaveValue('');
  expect(request(fetchMock, 1).body).toEqual({
    meal: 'breakfast',
    servings: 1,
    name: '떡볶이',
    calories: 480,
    isJunk: false,
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
  ['49,5', '수량: 숫자만 입력해 주세요. 소수점은 마침표로 씁니다'],
  ['1.5.1', '수량: 숫자만 입력해 주세요. 소수점은 마침표로 씁니다'],
])('a quantity of "%s" is refused before sending', async (value, message) => {
  const fetchMock = server({ body: emptyDay }, { body: { foods: [food] } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value } });
  fireEvent.click(await searchFood());
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each([
  ['수량 (1회 제공량 기준)', '수량'],
  ['1회 칼로리 (kcal)', '1회 칼로리'],
])('a comma decimal in %s is refused, never read as ten times the value', async (label, name) => {
  const fetchMock = server({ body: emptyDay });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value: '49,5' } });
  // A number field would have dropped the comma and shown 495 here.
  expect(field).toHaveValue('49,5');
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    `${name}: 숫자만 입력해 주세요. 소수점은 마침표로 씁니다`,
  );
  expect(field).toHaveValue('49,5');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a calorie with a decimal point is sent as that number', async () => {
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '0.5' } });
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '49.5' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(request(fetchMock, 1).body).toEqual({
    meal: 'breakfast',
    servings: 0.5,
    name: '떡볶이',
    calories: 49.5,
    isJunk: false,
  });
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
  stubFetch(fetchMock);
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
  stubFetch(fetchMock);
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
  expect(screen.getByLabelText('1회 칼로리 (kcal)')).toHaveValue('');
});

// #38: the junk food mark follows the same rule as the typed fields.
test('a junk food mark changed while waiting belongs to the next entry', async () => {
  let finish = (_response: Response) => {};
  stubFetch(
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '감자칩' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '300' } });
  const mark = screen.getByRole('checkbox', { name: '정크푸드' });
  expect(mark).toHaveAccessibleDescription('위의 이 주·이 달 정크푸드 횟수로 셉니다.');
  const save = screen.getByRole('button', { name: /바로 기록/ });
  fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  fireEvent.click(mark);
  expect(mark).toBeChecked();
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByRole('checkbox', { name: '정크푸드' })).toBeChecked();
});

test('the delete buttons wait while an entry is being recorded', async () => {
  let finish = (_response: Response) => {};
  stubFetch(
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
  stubFetch(
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

test('each form shows its errors next to its own buttons', async () => {
  server({ body: emptyDay }, { body: { foods: [food] } });
  render(<MealCard date={date} />);
  const typedForm = (await screen.findByLabelText('음식 이름')).closest('form')!;
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  expect(within(typedForm).getByRole('alert')).toHaveTextContent('음식 이름을 입력해 주세요');

  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '0' } });
  fireEvent.click(await searchFood());
  const shown = await screen.findByRole('alert');
  expect(shown).toHaveTextContent('수량을 0보다 큰 숫자로 입력해 주세요');
  expect(typedForm).not.toContainElement(shown);
  expect(shown.compareDocumentPosition(screen.getByRole('list', { name: '검색 결과' }))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test('a searched food the server refuses says why and can be tried again', async () => {
  server(
    { body: emptyDay },
    { body: { foods: [food] } },
    { status: 500, body: { error: '서버 오류가 발생했습니다' } },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  const add = await searchFood();
  fireEvent.click(add);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  await waitFor(() => expect(add).toBeEnabled());
});

test('a search says how many it found', async () => {
  server({ body: emptyDay }, { body: { foods: [food] } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  await searchFood();
  expect(screen.getByText('검색 결과 1건')).toHaveAttribute('role', 'status');
});

test('a search in progress shows that it is working', async () => {
  let finish = (_response: Response) => {};
  stubFetch(
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByRole('status', { name: '검색하는 중' })).toBeInTheDocument();
  finish(new Response(JSON.stringify({ foods: [] })));
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: '검색하는 중' })).not.toBeInTheDocument(),
  );
});

test('the delete question names the brand, as two entries can differ only by it', async () => {
  server({ body: oneEntry });
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  expect(within(screen.getByRole('dialog')).getByText(/'버거집 치즈버거' 기록을/)).toBeVisible();
});

test('a read started before an entry was recorded does not undo it on screen', async () => {
  let finishRead = (_response: Response) => {};
  const added = {
    entries: [entry, { ...entry, id: 2, name: '떡볶이', brand: null }],
    totals: emptyTotals,
    junk: noJunk,
  };
  // Reads and writes answer from separate lists: each read first waits a turn for pending writes,
  // so the order in which the two reach fetch is not what this test is about.
  const reads: (() => Promise<Response>)[] = [
    () => Promise.resolve(new Response(JSON.stringify(oneEntry))),
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }),
      ),
    () => new Promise((resolve) => (finishRead = resolve)),
  ];
  const writes = [
    new Response(JSON.stringify({ error: '식사 기록을 찾을 수 없습니다' }), { status: 404 }),
    new Response(JSON.stringify(added), { status: 201 }),
  ];
  stubFetch((_url, init) =>
    init?.method === 'GET' ? reads.shift()!() : Promise.resolve(writes.shift()!),
  );
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '버거집 치즈버거 삭제' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  expect(await screen.findByRole('button', { name: '떡볶이 삭제' })).toBeInTheDocument();

  finishRead(new Response(JSON.stringify(oneEntry)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole('button', { name: '떡볶이 삭제' })).toBeInTheDocument();
});

test('trying again moves focus to the card, as the button it was on goes away', async () => {
  server({ status: 500, body: { error: '서버 오류가 발생했습니다' } }, { body: oneEntry });
  render(<MealCard date={date} />);
  const again = await screen.findByRole('button', { name: '다시 시도' });
  again.focus();
  fireEvent.click(again);
  await screen.findByText('버거집 치즈버거');
  await waitFor(() => expect(screen.getByText('식단').parentElement).toHaveFocus());
});

test('recording that succeeds after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'success');
  let finish = (_response: Response) => {};
  stubFetch(
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
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  await waitFor(() => expect(shown).toHaveBeenCalledWith('2026-03-15 식사를 기록했습니다'));
  shown.mockRestore();
});

test('losing the answer after leaving the day does not claim it was not recorded', async () => {
  const shown = vi.spyOn(toast, 'error');
  let lose = (_cause: Error) => {};
  stubFetch(
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (lose = reject))),
  );
  const { unmount } = render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  unmount();
  lose(new TypeError('Failed to fetch'));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      '2026-03-15 식사를 기록했는지 확인하지 못했습니다: 서버에 연결할 수 없습니다',
    ),
  );
  shown.mockRestore();
});

test('recording that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let finish = (_response: Response) => {};
  stubFetch(
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

const combo = {
  id: 9,
  name: '점심 세트',
  items: [
    {
      foodId: 7,
      name: '치즈버거',
      brand: '버거집',
      servings: 1.5,
      servingSize: 120,
      servingUnit: 'g',
      calories: 450,
    },
  ],
  calories: { value: 450, missing: 0 },
};

test('a combo is read only when asked for, then recorded into the chosen meal', async () => {
  const fetchMock = server(
    { body: emptyDay },
    { body: { combos: [combo] } },
    { status: 201, body: oneEntry },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '점심' }));
  fireEvent.click(screen.getByRole('button', { name: '조합에서 고르기' }));
  const list = await screen.findByRole('list', { name: '조합 목록' });
  expect(within(list).getByText('음식 1개 · 450kcal')).toBeInTheDocument();
  fireEvent.click(within(list).getByRole('button', { name: '점심 세트 기록' }));

  const lunch = await screen.findByRole('region', { name: '점심' });
  expect(within(lunch).getByText('버거집 치즈버거')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({ url: '/api/combos', method: 'GET', body: undefined });
  expect(request(fetchMock, 2)).toEqual({
    url: `/api/meals/${date}/combos/9`,
    method: 'POST',
    body: { meal: 'lunch' },
  });
});

test('with no combos saved, the card says where to make one', async () => {
  server({ body: emptyDay }, { body: { combos: [] } });
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '조합에서 고르기' }));
  expect(
    await screen.findByText('저장한 조합이 없습니다. 메뉴의 조합 화면에서 만들 수 있습니다.'),
  ).toBeInTheDocument();
});

test('a combo with no foods left cannot be recorded', async () => {
  server(
    { body: emptyDay },
    { body: { combos: [{ ...combo, items: [], calories: { value: null, missing: 0 } }] } },
  );
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '조합에서 고르기' }));
  const list = await screen.findByRole('list', { name: '조합 목록' });
  expect(within(list).getByText('음식이 없습니다')).toBeInTheDocument();
  expect(within(list).getByRole('button', { name: '점심 세트 기록' })).toBeDisabled();
});

test('combos that cannot be read say why next to their button', async () => {
  server({ body: emptyDay }, { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '조합에서 고르기' }));
  const section = screen.getByRole('region', { name: '조합' });
  expect(await within(section).findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(within(section).getByRole('button', { name: '조합에서 고르기' })).toBeEnabled();
});

test('a combo the server refuses says why and records nothing on screen', async () => {
  const fetchMock = server(
    { body: emptyDay },
    { body: { combos: [combo] } },
    { status: 404, body: { error: '조합을 찾을 수 없습니다' } },
  );
  render(<MealCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '조합에서 고르기' }));
  fireEvent.click(await screen.findByRole('button', { name: '점심 세트 기록' }));
  const section = screen.getByRole('region', { name: '조합' });
  expect(await within(section).findByRole('alert')).toHaveTextContent('조합을 찾을 수 없습니다');
  expect(screen.getByText('아직 기록한 식사가 없습니다.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

const copyForm = () => screen.getByRole('form', { name: '다른 날에서 복사' });

test('the chosen meal of the day before is copied by default', async () => {
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.click(screen.getByRole('button', { name: '점심' }));
  const form = copyForm();
  expect(within(form).getByLabelText('복사할 날짜')).toHaveValue('2026-03-14');
  fireEvent.click(within(form).getByRole('button', { name: '점심 복사' }));

  const lunch = await screen.findByRole('region', { name: '점심' });
  expect(within(lunch).getByText('버거집 치즈버거')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/meals/${date}/copy`,
    method: 'POST',
    body: { from: '2026-03-14', meal: 'lunch' },
  });
});

test('any other day can be the one copied', async () => {
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  const form = copyForm();
  fireEvent.change(within(form).getByLabelText('복사할 날짜'), {
    target: { value: '2026-03-01' },
  });
  fireEvent.click(within(form).getByRole('button', { name: '아침 복사' }));
  await screen.findByText('버거집 치즈버거');
  expect(request(fetchMock, 1).body).toEqual({ from: '2026-03-01', meal: 'breakfast' });
});

test.each([
  ['', '복사할 날짜를 골라 주세요'],
  [date, '다른 날짜를 골라 주세요'],
])('copy from %j is refused before sending', async (from, message) => {
  const fetchMock = server({ body: emptyDay });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  const form = copyForm();
  fireEvent.change(within(form).getByLabelText('복사할 날짜'), { target: { value: from } });
  fireEvent.click(within(form).getByRole('button', { name: '아침 복사' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a meal with nothing to copy says which day and meal were empty', async () => {
  server({ body: emptyDay }, { status: 404, body: { error: '복사할 기록이 없습니다' } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.click(screen.getByRole('button', { name: '저녁' }));
  const form = copyForm();
  fireEvent.click(within(form).getByRole('button', { name: '저녁 복사' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent(
    '2026년 3월 14일 토요일 저녁에 복사할 기록이 없습니다',
  );
  expect(screen.getByText('아직 기록한 식사가 없습니다.')).toBeInTheDocument();
  expect(within(form).getByRole('button', { name: '저녁 복사' })).toBeEnabled();
});

test('another failure to copy shows the server message next to the copy button', async () => {
  server({ body: emptyDay }, { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  const form = copyForm();
  fireEvent.click(within(form).getByRole('button', { name: '아침 복사' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
});

test('while a copy is on its way the button says so and cannot copy twice', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
    .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  stubFetch(fetchMock);
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  const button = within(copyForm()).getByRole('button', { name: '아침 복사' });
  expect(button).toHaveAccessibleDescription(/그대로 더합니다/);
  fireEvent.click(button);

  await waitFor(() => expect(button).toBeDisabled());
  expect(button).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(button);
  finish(new Response(JSON.stringify(oneEntry), { status: 201 }));
  expect(await screen.findByText('버거집 치즈버거')).toBeInTheDocument();
  expect(button).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

const recentRice = {
  id: 3,
  name: '햇반',
  brand: '샘플',
  servingSize: 210,
  servingUnit: 'g',
  calories: 300,
};
const answerRecent = (...lists: object[][]) => {
  // One list per read, in order; the last one repeats.
  recentReply = () =>
    new Response(JSON.stringify({ foods: lists.length > 1 ? lists.shift() : lists[0] }));
};

test('recently eaten foods are offered before any search and add with the chosen meal', async () => {
  answerRecent([recentRice, food], [recentRice, food]);
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  const list = await screen.findByRole('list', { name: '최근 먹은 음식 목록' });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')?.textContent),
  ).toEqual(['샘플 햇반', '버거집 치즈버거']);
  expect(within(list).getByText('1회 210g · 300kcal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '저녁' }));
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '2' } });
  fireEvent.click(within(list).getByRole('button', { name: '샘플 햇반 추가' }));

  await screen.findByText('버거집 치즈버거', { selector: 'section[aria-label=점심] *' });
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/meals/${date}`,
    method: 'POST',
    body: { meal: 'dinner', servings: 2, foodId: 3 },
  });
  // Read once on opening and again after recording, so the order follows what was just eaten.
  await waitFor(() => expect(recentCalls).toHaveLength(2));
});

test('with nothing eaten from the store yet, there is no recent list', async () => {
  server({ body: emptyDay });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  await waitFor(() => expect(recentCalls).toHaveLength(1));
  expect(screen.queryByRole('region', { name: '최근 먹은 음식' })).not.toBeInTheDocument();
});

test('a recent food refused shows why next to the recent list', async () => {
  answerRecent([recentRice]);
  server({ body: emptyDay }, { status: 404, body: { error: '음식을 찾을 수 없습니다' } });
  render(<MealCard date={date} />);
  const section = await screen.findByRole('region', { name: '최근 먹은 음식' });
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '0' } });
  fireEvent.click(within(section).getByRole('button', { name: '샘플 햇반 추가' }));
  expect(await within(section).findByRole('alert')).toHaveTextContent(
    '수량을 0보다 큰 숫자로 입력해 주세요',
  );
  fireEvent.change(screen.getByLabelText('수량 (1회 제공량 기준)'), { target: { value: '1' } });
  fireEvent.click(within(section).getByRole('button', { name: '샘플 햇반 추가' }));
  expect(await within(section).findByRole('alert')).toHaveTextContent('음식을 찾을 수 없습니다');
  // Nothing was recorded, so the list is not read again.
  expect(recentCalls).toHaveLength(1);
});

test('recent foods that cannot be read say why and can be read again', async () => {
  let fail = true;
  recentReply = () =>
    fail
      ? new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 })
      : new Response(JSON.stringify({ foods: [recentRice] }));
  server({ body: emptyDay }, { body: { foods: [] } });
  render(<MealCard date={date} />);
  const section = await screen.findByRole('region', { name: '최근 먹은 음식' });
  expect(await within(section).findByRole('alert')).toHaveTextContent(
    '최근 먹은 음식을 불러오지 못했습니다: 서버 오류가 발생했습니다',
  );
  // Another action clears its own messages, not the reason the retry button is there.
  fireEvent.change(screen.getByLabelText('음식 검색'), { target: { value: '없는 음식' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText(/찾는 음식이 없습니다/);
  expect(within(section).getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');

  fail = false;
  fireEvent.click(within(section).getByRole('button', { name: '다시 불러오기' }));
  expect(await within(section).findByRole('button', { name: '샘플 햇반 추가' })).toBeEnabled();
  expect(within(section).queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
  expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
  // The retry button is gone, so focus goes to the list's heading rather than the page.
  await waitFor(() =>
    expect(document.activeElement).toBe(within(section).getByText('최근 먹은 음식')),
  );
});

test('recording a combo or a copy reads the recent foods again; typed food does not', async () => {
  const fetchMock = server(
    { body: emptyDay },
    { status: 201, body: oneEntry },
    { status: 201, body: oneEntry },
    { body: { combos: [combo] } },
    { status: 201, body: oneEntry },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  await screen.findByText('버거집 치즈버거');
  await waitFor(() => expect(screen.getByRole('button', { name: '바로 기록' })).toBeEnabled());
  expect(recentCalls).toHaveLength(1);

  fireEvent.click(within(copyForm()).getByRole('button', { name: '아침 복사' }));
  await waitFor(() => expect(recentCalls).toHaveLength(2));

  fireEvent.click(screen.getByRole('button', { name: '조합에서 고르기' }));
  fireEvent.click(await screen.findByRole('button', { name: '점심 세트 기록' }));
  await waitFor(() => expect(recentCalls).toHaveLength(3));
  expect([0, 1, 2, 3, 4].map((call) => request(fetchMock, call).url)).toEqual([
    `/api/meals/${date}`,
    `/api/meals/${date}`,
    `/api/meals/${date}/copy`,
    '/api/combos',
    `/api/meals/${date}/combos/9`,
  ]);
});

test('a retry that finds nothing moves focus to the search instead', async () => {
  let fail = true;
  recentReply = () =>
    fail
      ? new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 })
      : new Response(JSON.stringify({ foods: [] }));
  server({ body: emptyDay });
  render(<MealCard date={date} />);
  const section = await screen.findByRole('region', { name: '최근 먹은 음식' });
  fail = false;
  fireEvent.click(within(section).getByRole('button', { name: '다시 불러오기' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: '최근 먹은 음식' })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('음식 검색')));
});

test('focus follows the retry even when a read started by an add answers first', async () => {
  const fail = () =>
    new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 });
  let finishRetry = (_response: Response) => {};
  const replies = [
    fail,
    () => new Promise<Response>((resolve) => (finishRetry = resolve)),
    () => new Response(JSON.stringify({ foods: [recentRice] })),
  ];
  recentReply = () => replies.shift()!();
  let finishAdd = (_response: Response) => {};
  stubFetch(
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(emptyDay)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ foods: [food] })))
      .mockImplementationOnce(() => new Promise((resolve) => (finishAdd = resolve))),
  );
  render(<MealCard date={date} />);
  const section = await screen.findByRole('region', { name: '최근 먹은 음식' });
  fireEvent.click(await searchFood());
  // While the add waits, the retry starts a read; the add's own read starts after it and wins.
  fireEvent.click(within(section).getByRole('button', { name: '다시 불러오기' }));
  finishAdd(new Response(JSON.stringify(oneEntry), { status: 201 }));
  expect(
    await within(section).findByRole('button', { name: '샘플 햇반 추가' }),
  ).toBeInTheDocument();
  finishRetry(fail());
  await waitFor(() =>
    expect(document.activeElement).toBe(within(section).getByText('최근 먹은 음식')),
  );
  expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
});

test('search results say when more are waiting, and the next page joins the list', async () => {
  const fetchMock = server(
    { body: emptyDay },
    { body: { foods: [food], nextOffset: 100 } },
    { body: { foods: [food, { ...food, id: 8, name: '불고기버거' }], nextOffset: null } },
  );
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 검색');
  await searchFood();
  expect(screen.getByText('검색 결과 1건 표시 중, 결과가 더 있습니다')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '결과 더 보기' }));
  expect(await screen.findByRole('button', { name: '버거집 불고기버거 추가' })).toBeInTheDocument();
  expect(request(fetchMock, 2).url).toBe('/api/foods?q=%EC%B9%98%EC%A6%88&offset=100');
  // The repeated food stays a single row.
  expect(screen.getAllByRole('button', { name: '버거집 치즈버거 추가' })).toHaveLength(1);
  expect(screen.getByText('검색 결과 2건')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '결과 더 보기' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('검색 결과 2건')).toHaveFocus());
});

test('a next page clears only its own message, not the other forms', async () => {
  server(
    { body: emptyDay },
    { body: { foods: [food], nextOffset: 100 } },
    { status: 500, body: { error: '서버 오류가 발생했습니다' } },
    { body: { foods: [{ ...food, id: 8, name: '불고기버거' }], nextOffset: 200 } },
  );
  render(<MealCard date={date} />);
  const typedForm = (await screen.findByLabelText('음식 이름')).closest('form')!;
  await searchFood();
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  expect(within(typedForm).getByRole('alert')).toHaveTextContent('음식 이름을 입력해 주세요');

  const more = screen.getByRole('button', { name: '결과 더 보기' });
  fireEvent.click(more);
  // The failure shows below the list, next to the button, not at the search far above.
  const failed = await screen.findByText(/서버 오류가 발생했습니다/);
  expect(more.compareDocumentPosition(failed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(typedForm).getByRole('alert')).toHaveTextContent('음식 이름을 입력해 주세요');

  fireEvent.click(more);
  await screen.findByRole('button', { name: '버거집 불고기버거 추가' });
  expect(screen.queryByText(/서버 오류가 발생했습니다/)).not.toBeInTheDocument();
  expect(within(typedForm).getByRole('alert')).toHaveTextContent('음식 이름을 입력해 주세요');
});

test('coming back while an entry is being recorded shows it, not the day without it', async () => {
  const added = {
    entries: [{ ...entry, name: '떡볶이', brand: null }],
    totals: emptyTotals,
    junk: noJunk,
  };
  let saved = false;
  let finishAdd = () => {};
  const inner = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Promise<Response>((resolve) => {
        finishAdd = () => {
          saved = true;
          resolve(new Response(JSON.stringify(added), { status: 201 }));
        };
      });
    }
    return Promise.resolve(new Response(JSON.stringify(saved ? added : emptyDay)));
  });
  stubFetch(inner);
  const first = render(<MealCard date={date} />);
  fireEvent.change(await screen.findByLabelText('음식 이름'), { target: { value: '떡볶이' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));
  first.unmount();
  render(<MealCard date={date} />);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(inner.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(1);
  finishAdd();
  expect(await screen.findByRole('button', { name: '떡볶이 삭제' })).toBeInTheDocument();
  expect(inner.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(2);
});

// #38
test('a typed-in food can be marked junk food, and the mark clears after it is recorded', async () => {
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  await screen.findByLabelText('음식 이름');
  fireEvent.change(screen.getByLabelText('음식 이름'), { target: { value: '감자칩' } });
  fireEvent.change(screen.getByLabelText('1회 칼로리 (kcal)'), { target: { value: '300' } });
  const mark = screen.getByRole('checkbox', { name: '정크푸드' });
  expect(mark).not.toBeChecked();
  fireEvent.click(mark);
  fireEvent.click(screen.getByRole('button', { name: '바로 기록' }));

  await waitFor(() => expect(screen.getByLabelText('음식 이름')).toHaveValue(''));
  expect(request(fetchMock, 1).body).toEqual({
    meal: 'breakfast',
    servings: 1,
    name: '감자칩',
    calories: 300,
    isJunk: true,
  });
  expect(screen.getByRole('checkbox', { name: '정크푸드' })).not.toBeChecked();
});

test('a stored food is recorded without a mark of its own; it brings the food mark', async () => {
  recentReply = () => new Response(JSON.stringify({ foods: [{ ...food, isJunk: true }] }));
  const fetchMock = server({ body: emptyDay }, { status: 201, body: oneEntry });
  render(<MealCard date={date} />);
  const recent = await screen.findByRole('list', { name: '최근 먹은 음식 목록' });
  expect(within(recent).getByText('정크푸드')).toBeVisible();
  fireEvent.click(within(recent).getByRole('button', { name: '버거집 치즈버거 추가' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(request(fetchMock, 1).body).toEqual({ meal: 'breakfast', servings: 1, foodId: 7 });
});

test('junk food entries are marked, with the week and month counts below the totals', async () => {
  server({
    body: {
      entries: [
        { ...entry, isJunk: true },
        { ...entry, id: 2, name: '샐러드', brand: null, isJunk: false },
      ],
      totals: emptyTotals,
      junk: {
        week: { ...noJunk.week, times: 3, days: 2, calories: { value: 1850, missing: 0 } },
        month: { ...noJunk.month, times: 4, days: 3, calories: { value: 2100, missing: 1 } },
      },
    },
  });
  render(<MealCard date={date} />);
  const summary = await screen.findByRole('region', { name: '정크푸드' });
  expect(within(summary).getByRole('heading', { level: 3, name: '정크푸드' })).toBeVisible();
  expect(within(summary).getByText(/이 주/)).toHaveTextContent(
    '이 주 03.09~03.15: 3회 · 먹은 날 2일 · 1850kcal',
  );
  expect(within(summary).getByText(/이 달/)).toHaveTextContent(
    '이 달 03.01~03.31: 4회 · 먹은 날 3일 · 2100kcal 이상 (칼로리 모르는 기록 1개 제외)',
  );
  const lunch = screen.getByRole('region', { name: '점심' });
  const items = within(lunch).getAllByRole('listitem');
  expect(within(items[0]).getByText('정크푸드')).toBeVisible();
  expect(within(items[1]).queryByText('정크푸드')).not.toBeInTheDocument();
});

test('a day without junk food says none for the week and the month', async () => {
  server({ body: emptyDay });
  render(<MealCard date={date} />);
  const summary = await screen.findByRole('region', { name: '정크푸드' });
  expect(within(summary).getByText(/이 주/)).toHaveTextContent('이 주 03.09~03.15: 없음');
  expect(within(summary).getByText(/이 달/)).toHaveTextContent('이 달 03.01~03.31: 없음');
});
