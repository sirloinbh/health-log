import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ChecksCard } from './checks';
import { toast } from './components/ui/sonner';

const date = '2026-11-04';
type Rate = { days: number; yes: number };
const noRate: Rate = { days: 0, yes: 0 };
const dayOf = (record: unknown, diet = noRate, sleep = noRate) => ({
  record,
  week: { from: '2026-11-02', to: '2026-11-08', diet, sleep },
  month: { from: '2026-11-01', to: '2026-11-30', diet, sleep },
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

const group = (name: string) => screen.getByRole('group', { name });

test('a day with no check starts with both questions unchecked and no rate', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  const diet = await screen.findByRole('group', { name: '식단을 지켰나요?' });
  expect(within(diet).getByRole('button', { name: '체크 안 함' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    within(group('잠을 잘 잤나요?')).getByRole('button', { name: '체크 안 함' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(request(fetchMock, 0).url).toBe(`/api/checks/${date}`);
  const week = screen.getByRole('region', { name: '이 주' });
  expect(within(week).getByText('11.02~11.08')).toBeInTheDocument();
  expect(within(week).getByText('식단: 기록 없음')).toBeInTheDocument();
  expect(within(week).getByText('수면: 기록 없음')).toBeInTheDocument();
});

test('one answered question is sent with the other left unchecked, not as a no', async () => {
  const saved = { date, dietKept: true, sleepGood: null, memo: null };
  const fetchMock = server({ body: dayOf(null) }, { body: dayOf(saved, { days: 1, yes: 1 }) });
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: '식단을 지켰나요?' })).getByRole('button', {
      name: '지킴',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  // The form closes once the save is back; the view shows the answers.
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument(),
  );
  expect(screen.getByText('지킴')).toBeInTheDocument();
  expect(screen.getByText('체크 안 함')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/checks/${date}`,
    method: 'PUT',
    body: { dietKept: true, sleepGood: null, memo: null },
  });
  const week = screen.getByRole('region', { name: '이 주' });
  expect(within(week).getByText('식단: 1/1일 지킴 (100%)')).toBeInTheDocument();
  expect(within(week).getByText('수면: 기록 없음')).toBeInTheDocument();
});

test('no answers and a memo are saved as they are, the memo trimmed', async () => {
  const saved = { date, dietKept: false, sleepGood: false, memo: '야근' };
  const fetchMock = server(
    { body: dayOf(null) },
    { body: dayOf(saved, { days: 1, yes: 0 }, { days: 1, yes: 0 }) },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: '식단을 지켰나요?' })).getByRole('button', {
      name: '못 지킴',
    }),
  );
  fireEvent.click(within(group('잠을 잘 잤나요?')).getByRole('button', { name: '못 잠' }));
  fireEvent.change(screen.getByLabelText('메모'), { target: { value: '  야근  ' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('야근')).toBeInTheDocument();
  expect(screen.getByText('못 지킴')).toBeInTheDocument();
  expect(screen.getByText('못 잠')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ dietKept: false, sleepGood: false, memo: '야근' });
  expect(
    within(screen.getByRole('region', { name: '이 주' })).getByText('식단: 0/1일 지킴 (0%)'),
  ).toBeInTheDocument();
});

test('nothing checked and no memo is refused before anything is sent', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  fireEvent.change(await screen.findByLabelText('메모'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('체크나 메모 중 하나 이상');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a saved day opens its own answers for editing, and an answer can be taken back', async () => {
  const record = { date, dietKept: true, sleepGood: false, memo: '메모' };
  const fetchMock = server(
    { body: dayOf(record, { days: 1, yes: 1 }, { days: 1, yes: 0 }) },
    { body: dayOf({ ...record, sleepGood: null }, { days: 1, yes: 1 }) },
  );
  render(<ChecksCard date={date} />);
  expect(await screen.findByText('지킴')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '수정' }));
  expect(within(group('식단을 지켰나요?')).getByRole('button', { name: '지킴' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(within(group('잠을 잘 잤나요?')).getByRole('button', { name: '못 잠' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('메모')).toHaveValue('메모');
  fireEvent.click(within(group('잠을 잘 잤나요?')).getByRole('button', { name: '체크 안 함' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument(),
  );
  expect(request(fetchMock, 1).body).toEqual({ dietKept: true, sleepGood: null, memo: '메모' });
  await waitFor(() => expect(screen.getByText('하루 체크').parentElement).toHaveFocus());
});

test('cancelling an edit keeps the saved answers', async () => {
  server({ body: dayOf({ date, dietKept: true, sleepGood: null, memo: null }) });
  render(<ChecksCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '수정' }));
  fireEvent.click(within(group('식단을 지켰나요?')).getByRole('button', { name: '못 지킴' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByText('지킴')).toBeInTheDocument();
});

test('deleting asks first, then reloads the rates without the day', async () => {
  const fetchMock = server(
    { body: dayOf({ date, dietKept: true, sleepGood: null, memo: null }, { days: 1, yes: 1 }) },
    { status: 204 },
    { body: dayOf(null) },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const dialog = await screen.findByRole('dialog', { name: '하루 체크를 삭제할까요?' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

  expect(await screen.findByRole('button', { name: '저장' })).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/checks/${date}`,
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).method).toBe('GET');
  expect(
    within(screen.getByRole('region', { name: '이 주' })).getByText('식단: 기록 없음'),
  ).toBeInTheDocument();
});

test('a server refusal is shown and the answers stay', async () => {
  server(
    { body: dayOf(null) },
    { status: 400, body: { error: '메모는 200자 이하로 입력해 주세요' } },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: '식단을 지켰나요?' })).getByRole('button', {
      name: '지킴',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('200자 이하');
  expect(within(group('식단을 지켰나요?')).getByRole('button', { name: '지킴' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: '서버 오류가 발생했습니다' } }, { body: dayOf(null) });
  render(<ChecksCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.queryByRole('region', { name: '이 주' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('group', { name: '식단을 지켰나요?' })).toBeInTheDocument();
});

test('while saving, the answers and the memo cannot change under the save', async () => {
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve(new Response(JSON.stringify(dayOf(null)))),
    ),
  );
  render(<ChecksCard date={date} />);
  const diet = await screen.findByRole('group', { name: '식단을 지켰나요?' });
  fireEvent.click(within(diet).getByRole('button', { name: '지킴' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(within(diet).getByRole('button', { name: '못 지킴' })).toBeDisabled());
  expect(screen.getByLabelText('메모')).toBeDisabled();
  finish(new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(within(diet).getByRole('button', { name: '못 지킴' })).toBeEnabled();
  expect(screen.getByLabelText('메모')).toBeEnabled();
});

test('the memo field says how long it may be', async () => {
  server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  const memo = await screen.findByLabelText('메모');
  expect(memo).toHaveAccessibleDescription('200자까지 쓸 수 있습니다.');
  expect(memo).toHaveAttribute('maxLength', '200');
});

test('a save that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let failSave = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Promise((resolve) => (failSave = resolve))
        : Promise.resolve(new Response(JSON.stringify(dayOf(null)))),
    ),
  );
  const { unmount } = render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: '식단을 지켰나요?' })).getByRole('button', {
      name: '지킴',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  unmount();

  failSave(new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      `${date} 하루 체크를 저장하지 못했습니다: 서버 오류가 발생했습니다`,
    ),
  );
});
