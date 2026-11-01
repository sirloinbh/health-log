import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { SleepCard } from './sleep';

const date = '2026-03-15';
const record = {
  date,
  bedAt: '2026-03-14T14:30:00.000Z',
  wakeAt: '2026-03-14T22:00:00.000Z',
  durationMinutes: 450,
  source: 'manual',
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

const sentBody = (fetchMock: ReturnType<typeof server>, call: number) => {
  const init = (fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1];
  return JSON.parse(String(init.body)) as unknown;
};

const typeTimes = (bed: string, wake: string) => {
  fireEvent.change(screen.getByLabelText('취침 시각'), { target: { value: bed } });
  fireEvent.change(screen.getByLabelText('기상 시각'), { target: { value: wake } });
};

test('a day without a record asks for times and files a night under the day of waking', async () => {
  const fetchMock = server({ body: { record: null } }, { body: record });
  render(<SleepCard date={date} />);
  await screen.findByLabelText('취침 시각');

  typeTimes('23:30', '07:00');
  expect(screen.getByText('전날 23:30에 잠들어 7시간 30분')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('7시간 30분')).toBeInTheDocument();
  expect(screen.getByText('전날 23:30')).toBeInTheDocument();
  expect(screen.getByText('07:00')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1]).toEqual([
    `/api/sleep/${date}`,
    expect.objectContaining({ method: 'PUT' }),
  ]);
  expect(sentBody(fetchMock, 1)).toEqual({
    bedAt: '2026-03-14T23:30:00+09:00',
    wakeAt: '2026-03-15T07:00:00+09:00',
  });
});

test('saving without both times explains itself and sends nothing', async () => {
  const fetchMock = server({ body: { record: null } });
  render(<SleepCard date={date} />);
  await screen.findByLabelText('취침 시각');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '취침 시각과 기상 시각을 입력해 주세요',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('the server refusing the times shows its reason and keeps what was typed', async () => {
  server(
    { body: { record: null } },
    { status: 400, body: { error: '기상 시각은 취침 시각보다 늦어야 합니다' } },
  );
  render(<SleepCard date={date} />);
  await screen.findByLabelText('취침 시각');
  typeTimes('07:00', '07:00');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '기상 시각은 취침 시각보다 늦어야 합니다',
  );
  expect(screen.getByLabelText('취침 시각')).toHaveValue('07:00');
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
});

test('editing starts from the saved times and cancel changes nothing', async () => {
  server({ body: { record } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '수정' }));
  expect(screen.getByLabelText('취침 시각')).toHaveValue('23:30');
  expect(screen.getByLabelText('기상 시각')).toHaveValue('07:00');
  typeTimes('01:00', '07:00');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByText('7시간 30분')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('수면').parentElement).toHaveFocus());
});

test('deleting asks first, then the form returns with focus on the card', async () => {
  const fetchMock = server({ body: { record } }, { status: 204 });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const dialog = screen.getByRole('dialog', { name: '수면 기록을 삭제할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

  expect(await screen.findByLabelText('취침 시각')).toHaveValue('');
  expect(fetchMock.mock.calls[1]).toEqual([
    `/api/sleep/${date}`,
    expect.objectContaining({ method: 'DELETE' }),
  ]);
  await waitFor(() => expect(screen.getByText('수면').parentElement).toHaveFocus());
});

test('a record already gone counts as deleted', async () => {
  server({ body: { record } }, { status: 404, body: { error: '수면 기록을 찾을 수 없습니다' } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  expect(await screen.findByLabelText('취침 시각')).toBeInTheDocument();
});

test('a failed delete keeps the record and the dialog', async () => {
  server({ body: { record } }, { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('7시간 30분')).toBeInTheDocument();
});

test('an imported sleep says where it came from', async () => {
  server({ body: { record: { ...record, source: 'garmin' } } });
  render(<SleepCard date={date} />);
  expect(await screen.findByText('가민')).toBeInTheDocument();
});

test('a failed load offers another try, with no form to overwrite an unseen record', async () => {
  server({ status: 500, body: { error: '서버 오류가 발생했습니다' } }, { body: { record } });
  render(<SleepCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(screen.queryByLabelText('취침 시각')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('7시간 30분')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a reply for a day already left is ignored', async () => {
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise((resolve) => (finish = resolve))),
  );
  const { unmount } = render(<SleepCard date={date} />);
  unmount();
  finish(new Response(JSON.stringify({ record })));
  await Promise.resolve();
  expect(screen.queryByText('7시간 30분')).not.toBeInTheDocument();
});
