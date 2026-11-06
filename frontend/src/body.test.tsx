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
  server({
    recordReplies: [{ body: { record: null } }, { body: record }],
    history: [{ body: { records: [earlier] } }, { body: { records: [earlier, record] } }],
  });
  render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  const row = await screen.findByRole('row', { name: /체중.*−1\.5kg/ });
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['−1.5kg3/10~3/15', '−1.5kg3/10~3/15', '−1.5kg3/10~3/15']);
});

test('the trend asks for the 90 days ending on the day shown', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  render(<BodyCard date={date} />);
  await screen.findByLabelText('체중 (kg)');
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
    '/api/body?from=2025-12-16&to=2026-03-15',
  );
});

test('each window shows its own change with the days it compares', async () => {
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
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['−0.5kg3/14~3/15', '−0.5kg3/14~3/15', '−4.5kg1/10~3/15']);
  expect(screen.queryByRole('row', { name: /허리둘레/ })).not.toBeInTheDocument();
});

test('a window with one measurement says there is not enough', async () => {
  server({
    recordReplies: [{ body: { record } }],
    history: [{ body: { records: [{ ...record, date: '2026-01-10', weightKg: 75 }, record] } }],
  });
  render(<BodyCard date={date} />);
  const row = await screen.findByRole('row', { name: /체중/ });
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['기록 부족', '기록 부족', '−4.5kg1/10~3/15']);
});

test('a trend that fails to load leaves today usable and can be retried', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  server({
    recordReplies: [{ body: { record: null } }],
    history: [
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
      { body: { records: [earlier, record] } },
    ],
  });
  render(<BodyCard date={date} />);
  expect(await screen.findByLabelText('체중 (kg)')).toBeEnabled();
  expect(await screen.findByRole('alert')).toHaveTextContent('기간별 변화를 불러오지 못했습니다');

  fireEvent.click(screen.getByRole('button', { name: '변화 다시 불러오기' }));
  expect(await screen.findByRole('row', { name: /체중/ })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '변화 다시 불러오기' })).not.toBeInTheDocument();
});

test('numbers from before a failed reload do not stay on screen', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 75 };
  const saved = { ...record, weightKg: 60 };
  server({
    recordReplies: [{ body: { record } }, { body: saved }],
    history: [
      { body: { records: [earlier, record] } },
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
    ],
  });
  render(<BodyCard date={date} />);
  await screen.findByRole('row', { name: /체중.*−4\.5kg/ });

  fireEvent.click(screen.getByRole('button', { name: '수정' }));
  fireEvent.change(screen.getByLabelText('체중 (kg)'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('기간별 변화를 불러오지 못했습니다');
  expect(screen.getByText('60kg')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a trend retry shows it is running, allows one at a time, and announces failure again', async () => {
  let finishRetry = (_response: Response) => {};
  let historyCalls = 0;
  const fetchMock = vi.fn((url: string) => {
    if (!url.startsWith('/api/body?')) {
      return Promise.resolve(new Response(JSON.stringify({ record: null })));
    }
    historyCalls += 1;
    if (historyCalls === 1) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'x' }), { status: 500 }));
    }
    return new Promise<Response>((resolve) => (finishRetry = resolve));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '변화 다시 불러오기' }));

  const retry = await screen.findByRole('button', { name: /변화 다시 불러오기/ });
  expect(retry).toBeDisabled();
  expect(retry).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(retry);
  expect(historyCalls).toBe(2);

  finishRetry(new Response(JSON.stringify({ error: 'x' }), { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('기간별 변화를 불러오지 못했습니다');
  expect(screen.getByRole('button', { name: '변화 다시 불러오기' })).toBeEnabled();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: '신체' }).parentElement,
    ),
  );
});

test('a value too long to read is refused and the stored value stays', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record } }] });
  render(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '수정' }));
  fireEvent.change(screen.getByLabelText('체중 (kg)'), { target: { value: '9'.repeat(400) } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('숫자만 입력해 주세요');
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'PUT',
    ),
  ).toBe(false);
});

test('when both fail, one retry brings back the record and the trend', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  server({
    recordReplies: [
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
      { body: { record } },
    ],
    history: [
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
      { body: { records: [earlier, record] } },
    ],
  });
  render(<BodyCard date={date} />);
  await screen.findByText('기간별 변화를 불러오지 못했습니다');
  await screen.findByText('서버 오류가 발생했습니다');
  expect(screen.queryByRole('button', { name: '변화 다시 불러오기' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(await screen.findByRole('row', { name: /체중/ })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a slow older trend does not overwrite the one that includes a save', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  let finishFirst = (_response: Response) => {};
  let historyCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/body?')) {
        historyCalls += 1;
        if (historyCalls === 1) return new Promise((resolve) => (finishFirst = resolve));
        return Promise.resolve(new Response(JSON.stringify({ records: [earlier, record] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify(init?.method === 'PUT' ? record : { record: null })),
      );
    }),
  );
  render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('row', { name: /체중.*−1\.5kg/ });

  finishFirst(new Response(JSON.stringify({ records: [earlier] })));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByRole('row', { name: /체중.*−1\.5kg/ })).toBeInTheDocument();
});

test('a save that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let failSave = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Promise((resolve) => (failSave = resolve));
      return Promise.resolve(
        new Response(
          JSON.stringify(url.startsWith('/api/body?') ? { records: [] } : { record: null }),
        ),
      );
    }),
  );
  const { unmount } = render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  unmount();

  failSave(new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      `${date} 신체 기록을 저장하지 못했습니다: 서버 오류가 발생했습니다`,
    ),
  );
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
  expect(screen.getByLabelText('수축기 혈압 (mmHg)')).toHaveValue('120');
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
});

test('a comma decimal is refused, never read as ten times the value', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  render(<BodyCard date={date} />);
  const weight = await screen.findByLabelText('체중 (kg)');
  fireEvent.change(weight, { target: { value: '49,5' } });
  expect(weight).toHaveValue('49,5');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '체중 (kg): 숫자만 입력해 주세요. 소수점은 마침표로 씁니다',
  );
  expect(weight).toHaveValue('49,5');
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
  expect(weight).toHaveValue('70.5');
  expect(screen.getByLabelText('체지방률 (%)')).toHaveValue('');
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

  expect(await screen.findByLabelText('체중 (kg)')).toHaveValue('');
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

test('coming back while a save is on its way shows the saved record, not a blank form', async () => {
  let stored: typeof record | null = null;
  let finishSave = () => {};
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return new Promise<Response>((resolve) => {
        finishSave = () => {
          stored = record;
          resolve(new Response(JSON.stringify(record)));
        };
      });
    }
    const body = url.startsWith('/api/body?')
      ? { records: stored ? [stored] : [] }
      : { record: stored };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal('fetch', fetchMock);
  const reads = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => url === `/api/body/${date}` && init?.method === 'GET',
    ).length;

  const first = render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  first.unmount();
  render(<BodyCard date={date} />);

  // No form while the save is out: the server would still answer with the empty day.
  expect(screen.getByRole('status', { name: '신체 기록 불러오는 중' })).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads()).toBe(1);
  expect(screen.queryByLabelText('체중 (kg)')).not.toBeInTheDocument();

  finishSave();
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(reads()).toBe(2);
  expect(screen.queryByLabelText('체중 (kg)')).not.toBeInTheDocument();
  expect(await screen.findByRole('row', { name: /체중/ })).toBeInTheDocument();
});

test('a failed delete says why and keeps the record and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server({
    recordReplies: [
      { body: { record } },
      { status: 500, body: { error: '서버 오류가 발생했습니다' } },
    ],
  });
  render(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('서버 오류가 발생했습니다');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('70.5kg')).toBeInTheDocument();
  shown.mockRestore();
});

test('pressing edit moves focus to the card instead of losing it', async () => {
  server({ recordReplies: [{ body: { record } }] });
  render(<BodyCard date={date} />);
  const edit = await screen.findByRole('button', { name: '수정' });
  edit.focus();
  fireEvent.click(edit);
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '신체' }).parentElement).toHaveFocus(),
  );
});

test('a slow older trend failure does not replace the one that includes a save', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  let failFirst = (_response: Response) => {};
  let historyCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/body?')) {
        historyCalls += 1;
        if (historyCalls === 1) return new Promise((resolve) => (failFirst = resolve));
        return Promise.resolve(new Response(JSON.stringify({ records: [earlier, record] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify(init?.method === 'PUT' ? record : { record: null })),
      );
    }),
  );
  render(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('체중 (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('row', { name: /체중.*−1\.5kg/ });

  failFirst(new Response(JSON.stringify({ error: '서버 오류가 발생했습니다' }), { status: 500 }));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.queryByText('기간별 변화를 불러오지 못했습니다')).not.toBeInTheDocument();
  expect(screen.getByRole('row', { name: /체중.*−1\.5kg/ })).toBeInTheDocument();
});
