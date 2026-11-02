import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { BodyCard } from './body';
import { toast } from './components/ui/sonner';

const date = '2026-03-15';
const record = {
  date,
  weightKg: 70.5,
  bodyFatPercent: null,
  waistCm: null,
  systolicMmhg: 120,
  diastolicMmhg: 80,
  memo: '공복',
};

type Reply = { status?: number; body?: unknown };

// Separate answers per kind of request, because the record and the trend load at the same time.
const server = ({
  recordReplies = [],
  history = [],
}: {
  recordReplies?: Reply[];
  history?: Reply[];
}) => {
  const fetchMock = vi.fn((url: string) => {
    const replies = url.startsWith('/api/body?') ? history : recordReplies;
    const { status = 200, body } = replies.shift() ?? { body: { records: [] } };
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sent = (fetchMock: ReturnType<typeof server>, method: string) => {
  const call = fetchMock.mock.calls.find(
    (args) => (args as unknown as [string, RequestInit])[1]?.method === method,
  ) as unknown as [string, RequestInit];
  return {
    url: call[0],
    body: call[1].body ? (JSON.parse(String(call[1].body)) as unknown) : null,
  };
};

test('weight alone is saved, and blanks go as no value', async () => {
  const saved = { ...record, systolicMmhg: null, diastolicMmhg: null, memo: null };
  const fetchMock = server({ recordReplies: [{ body: { record: null } }, { body: saved }] });
  render(<BodyCard date={date} />);

  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(screen.queryByText('혈압')).not.toBeInTheDocument();
  expect(screen.queryByText('메모')).not.toBeInTheDocument();
  expect(sent(fetchMock, 'PUT')).toEqual({
    url: `/api/body/${date}`,
    body: {
      weightKg: 70.5,
      bodyFatPercent: null,
      waistCm: null,
      systolicMmhg: null,
      diastolicMmhg: null,
      memo: null,
    },
  });
});

test('saving reloads the trend so the new value counts at once', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  const fetchMock = server({
    recordReplies: [{ body: { record: null } }, { body: record }],
    history: [{ body: { records: [earlier] } }, { body: { records: [earlier, record] } }],
  });
  render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  const row = await screen.findByRole('row', { name: /체중.*−1\.5kg/ });
  expect(within(row).getAllByText('−1.5kg')).toHaveLength(3);
  expect(fetchMock.mock.calls[0]).toBeDefined();
});

test('the trend asks for the 90 days ending on the day shown', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  render(<BodyCard date={date} />);
  await screen.findByLabelText('체중 (kg)');
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
    '/api/body?from=2025-12-16&to=2026-03-15',
  );
});

test('a window with one measurement says there is not enough', async () => {
  server({
    recordReplies: [{ body: { record } }],
    history: [
      {
        body: {
          records: [
            { ...record, date: '2026-01-10', weightKg: 75 },
            { ...record, date: '2026-03-14', weightKg: 71 },
            record,
          ],
        },
      },
    ],
  });
  render(<BodyCard date={date} />);
  const row = await screen.findByRole('row', { name: /체중/ });
  const cells = within(row).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent)).toEqual(['−0.5kg', '−0.5kg', '−4.5kg']);
  expect(screen.queryByRole('row', { name: /허리둘레/ })).not.toBeInTheDocument();
});

test('a trend that fails to load leaves today usable', async () => {
  server({
    recordReplies: [{ body: { record: null } }],
    history: [{ status: 500, body: { error: '서버 오류가 발생했습니다' } }],
  });
  render(<BodyCard date={date} />);
  expect(await screen.findByLabelText('체중 (kg)')).toBeEnabled();
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
});

test('a failed load hides the form so an unseen record cannot be overwritten', async () => {
  server({
    recordReplies: [
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
      { body: { record } },
    ],
  });
  render(<BodyCard date={date} />);
  await screen.findByText('서버 오류가 발생했습니다');
  expect(screen.queryByLabelText('체중 (kg)')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
});

test('a server rejection keeps the form and the typed values', async () => {
  server({
    recordReplies: [
      { body: { record: null } },
      { status: 400, body: { error: '혈압은 수축기와 이완기를 함께 입력해 주세요' } },
    ],
  });
  render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('수축기 혈압 (mmHg)'), {
    target: { value: '120' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('함께 입력해 주세요');
  expect(screen.getByLabelText('수축기 혈압 (mmHg)')).toHaveValue(120);
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
});

test('text a number field cannot read is reported instead of dropped', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  render(<BodyCard date={date} />);
  const weight = await screen.findByLabelText('체중 (kg)');
  // jsdom never reports badInput; a real browser does for text like "70,5".
  Object.defineProperty(weight, 'validity', { value: { badInput: true } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('체중 (kg)의 입력값을 확인해 주세요');
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'PUT',
    ),
  ).toBe(false);
});

test('editing starts from the record and cancel changes nothing', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record } }] });
  render(<BodyCard date={date} />);
  expect(await screen.findByText('120/80mmHg')).toBeInTheDocument();
  expect(screen.getByText('공복')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '수정' }));
  const weight = screen.getByLabelText('체중 (kg)');
  expect(weight).toHaveValue(70.5);
  expect(screen.getByLabelText('체지방률 (%)')).toHaveValue(null);
  expect(screen.getByLabelText('메모')).toHaveValue('공복');
  fireEvent.change(weight, { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: '취소' }));

  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'PUT',
    ),
  ).toBe(false);
});

test('deleting asks first, then offers the form again and reloads the trend', async () => {
  const fetchMock = server({
    recordReplies: [{ body: { record } }, { status: 204 }],
    history: [{ body: { records: [record] } }, { body: { records: [] } }],
  });
  const success = vi.spyOn(toast, 'success');
  render(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const dialog = screen.getByRole('dialog', { name: '신체 기록을 삭제할까요?' });
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'DELETE',
    ),
  ).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

  expect(await screen.findByLabelText('체중 (kg)')).toHaveValue(null);
  expect(success).toHaveBeenCalledWith('삭제했습니다');
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/body?')).length,
    ).toBe(2),
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a record another tab already deleted counts as deleted', async () => {
  server({
    recordReplies: [
      { body: { record } },
      { status: 404, body: { error: '신체 기록을 찾을 수 없습니다' } },
    ],
  });
  render(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const dialog = screen.getByRole('dialog', { name: '신체 기록을 삭제할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  expect(await screen.findByLabelText('체중 (kg)')).toBeInTheDocument();
});
