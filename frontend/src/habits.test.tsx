import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { HabitsCard } from './habits';

const date = '2026-11-04';
type Period = {
  smoking: { days: number; cigarettes: number | null };
  drinking: { days: number; drinkingDays: number; totals: unknown[] };
};
const emptyPeriod: Period = {
  smoking: { days: 0, cigarettes: null },
  drinking: { days: 0, drinkingDays: 0, totals: [] },
};
const dayOf = (record: unknown, period = emptyPeriod) => ({
  record,
  week: { from: '2026-11-02', to: '2026-11-08', ...period },
  month: { from: '2026-11-01', to: '2026-11-30', ...period },
});

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
  const [url, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

const card = () =>
  screen.getByRole('heading', { name: '술·담배' }).closest<HTMLElement>('[data-slot=card]')!;

test('a day with nothing recorded shows the form and says the periods have no record', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByLabelText('담배 (개비)')).toHaveValue('');
  expect(request(fetchMock, 0).url).toBe(`/api/habits/${date}`);
  const week = screen.getByRole('region', { name: '이 주' });
  expect(within(week).getByText('11.02~11.08')).toBeInTheDocument();
  expect(within(week).getByText('담배: 기록 없음')).toBeInTheDocument();
  expect(within(week).getByText('술: 기록 없음')).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: '이 달' })).getByText('11.01~11.30'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '기록 안 함' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('zero cigarettes and no drinking are saved as recorded none, not left blank', async () => {
  const saved = { date, cigarettes: 0, drinks: [] };
  const fetchMock = server(
    { body: dayOf(null) },
    {
      body: dayOf(saved, {
        smoking: { days: 1, cigarettes: 0 },
        drinking: { days: 1, drinkingDays: 0, totals: [] },
      }),
    },
  );
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('담배 (개비)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: '안 마심' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('안 피움')).toBeInTheDocument();
  expect(screen.getByText('안 마심')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/habits/${date}`,
    method: 'PUT',
    body: { cigarettes: 0, drinks: [] },
  });
  const week = screen.getByRole('region', { name: '이 주' });
  expect(within(week).getByText('담배: 0개비 (기록한 날 1일)')).toBeInTheDocument();
  expect(within(week).getByText('술: 마신 날 0일 / 기록한 날 1일')).toBeInTheDocument();
});

test('drinks are listed one per row, and a blank cigarette field stays unrecorded', async () => {
  const drinks = [
    { kind: 'soju', unit: 'bottle', amount: 1.5 },
    { kind: 'beer', unit: 'bottle', amount: 1 },
  ];
  const fetchMock = server(
    { body: dayOf(null) },
    { body: dayOf({ date, cigarettes: null, drinks }) },
  );
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('담배 (개비)');
  fireEvent.click(screen.getByRole('button', { name: '마심' }));
  fireEvent.change(screen.getByLabelText('1번째 술 양'), { target: { value: '1.5' } });
  // A new row starts on a kind not used yet.
  fireEvent.click(screen.getByRole('button', { name: '술 추가' }));
  expect(screen.getByLabelText('2번째 술 종류')).toHaveTextContent('맥주');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('소주 1.5병, 맥주 1병')).toBeInTheDocument();
  expect(screen.getByText('기록 안 함')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ cigarettes: null, drinks });
});

test('a removed drink row is not sent', async () => {
  const fetchMock = server(
    { body: dayOf(null) },
    {
      body: dayOf({
        date,
        cigarettes: null,
        drinks: [{ kind: 'beer', unit: 'bottle', amount: 1 }],
      }),
    },
  );
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('담배 (개비)');
  fireEvent.click(screen.getByRole('button', { name: '마심' }));
  fireEvent.click(screen.getByRole('button', { name: '술 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '1번째 술 빼기' }));
  expect(screen.queryByLabelText('2번째 술 양')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('맥주 1병');
  expect(request(fetchMock, 1).body.drinks).toEqual([{ kind: 'beer', unit: 'bottle', amount: 1 }]);
});

test.each([
  [{ cigarettes: '' }, '술이나 담배 중 하나 이상 기록해 주세요'],
  [{ cigarettes: '1.5' }, '정수로 입력'],
  [{ cigarettes: '3,5' }, '담배 \\(개비\\)'],
  [{ cigarettes: '', drinks: true, amount: '0' }, '1번째 술의 양을 0보다 큰'],
  [{ cigarettes: '', drinks: true, amount: '1,5' }, '1번째 술의 양'],
])('%j is refused before anything is sent', async (input, message) => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('담배 (개비)'), {
    target: { value: input.cigarettes },
  });
  if ('drinks' in input) {
    fireEvent.click(screen.getByRole('button', { name: '마심' }));
    fireEvent.change(screen.getByLabelText('1번째 술 양'), { target: { value: input.amount } });
  }
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(message));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('drinking with every row removed asks for one', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('담배 (개비)');
  fireEvent.click(screen.getByRole('button', { name: '마심' }));
  fireEvent.click(screen.getByRole('button', { name: '1번째 술 빼기' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('마신 술을 하나 이상');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a saved day opens its own values for editing', async () => {
  const record = { date, cigarettes: 7, drinks: [{ kind: 'wine', unit: 'glass', amount: 2 }] };
  const fetchMock = server({ body: dayOf(record) }, { body: dayOf({ ...record, cigarettes: 5 }) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByText('7개비')).toBeInTheDocument();
  expect(screen.getByText('와인 2잔')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '수정' }));
  expect(screen.getByLabelText('담배 (개비)')).toHaveValue('7');
  expect(screen.getByRole('button', { name: '마심' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('1번째 술 양')).toHaveValue('2');
  expect(screen.getByLabelText('1번째 술 종류')).toHaveTextContent('와인');
  fireEvent.change(screen.getByLabelText('담배 (개비)'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByText('5개비')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ cigarettes: 5, drinks: record.drinks });
  await waitFor(() => expect(screen.getByText('술·담배').parentElement).toHaveFocus());
});

test('cancelling an edit keeps the saved values', async () => {
  server({ body: dayOf({ date, cigarettes: 7, drinks: null }) });
  render(<HabitsCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '수정' }));
  fireEvent.change(screen.getByLabelText('담배 (개비)'), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByText('7개비')).toBeInTheDocument();
});

test('deleting asks first, then reloads the totals without the day', async () => {
  const fetchMock = server(
    {
      body: dayOf(
        { date, cigarettes: 3, drinks: null },
        { smoking: { days: 1, cigarettes: 3 }, drinking: emptyPeriod.drinking },
      ),
    },
    { status: 204 },
    { body: dayOf(null) },
  );
  render(<HabitsCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const dialog = await screen.findByRole('dialog', { name: '술·담배 기록을 삭제할까요?' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

  expect(await screen.findByLabelText('담배 (개비)')).toHaveValue('');
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/habits/${date}`,
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).method).toBe('GET');
  expect(
    within(screen.getByRole('region', { name: '이 주' })).getByText('담배: 기록 없음'),
  ).toBeInTheDocument();
});

test('a server refusal is shown and the form keeps what was typed', async () => {
  server(
    { body: dayOf(null) },
    { status: 400, body: { error: '담배는 200개비 이하로 입력해 주세요' } },
  );
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('담배 (개비)'), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('200개비 이하');
  expect(screen.getByLabelText('담배 (개비)')).toHaveValue('300');
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: '서버 오류가 발생했습니다' } }, { body: dayOf(null) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(within(card()).queryByRole('region', { name: '이 주' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByLabelText('담배 (개비)')).toBeInTheDocument();
});
