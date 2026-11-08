import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';
import { trackWrite } from './pending-writes';
import { VisitsCard } from './visit-card';
import type { Visit } from './visit-text';

// Made-up values only: no real visit belongs in tests.
const visit: Visit = {
  id: 7,
  date: '2026-03-10',
  clinic: '가상피부과',
  department: '피부과',
  note: '가상 메모',
  cost: 12000,
  nextVisitOn: '2026-04-07',
  procedures: [
    { name: '가상 레이저', area: '이마', amount: '1회차', cost: 50000, note: null },
    { name: '가상 관리', area: null, amount: null, cost: null, note: '가상 시술 메모' },
  ],
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `visits` answers /api/visits; anything else gets today's date. */
const serve = (visits: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/visits') ? visits(url, init) : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = (path = '/visits') => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/visits') && (init?.method ?? 'GET') !== 'GET',
  );

const sentBody = (call: [string, RequestInit | undefined]) =>
  JSON.parse(String(call[1]?.body)) as unknown;

const dialog = () => screen.getByRole('dialog');
const fill = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

test('the main menu opens the clinic page, which lists visits with their procedures', async () => {
  serve(() => json({ visits: [visit], more: false }));
  window.history.replaceState(null, '', '/');
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '병원' }));
  expect(await screen.findByRole('heading', { level: 1, name: '병원' })).toBeInTheDocument();

  const card = (
    await screen.findByRole('heading', { level: 2, name: '가상피부과 · 피부과' })
  ).closest<HTMLElement>('[data-slot=card]')!;
  expect(within(card).getByText('2026년 3월 10일 화요일')).toBeInTheDocument();
  expect(within(card).getByText('12,000원')).toBeInTheDocument();
  expect(within(card).getByText('2026년 4월 7일 화요일')).toBeInTheDocument();
  const procedures = within(card).getByRole('list', { name: '시술' });
  expect(within(procedures).getByText('가상 레이저 · 이마 · 1회차 · 50,000원')).toBeInTheDocument();
  expect(within(procedures).getByText('가상 시술 메모')).toBeInTheDocument();
  expect(screen.getByText('방문 1건')).toBeInTheDocument();
});

test('a new visit is sent with its procedures, blanks as nothing and costs with commas read', async () => {
  let saved = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(visit, 201);
    }
    return json({ visits: saved ? [visit] : [], more: false });
  });
  open();
  expect(await screen.findByText('병원 기록이 없습니다')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '방문 기록' }));
  // Today, as the server counts it, is where a new visit starts.
  expect(within(dialog()).getByLabelText('방문 날짜')).toHaveValue('2026-03-15');
  fill('병원 이름', '가상피부과');
  fill('진료비 (원)', '12,000');
  fireEvent.click(within(dialog()).getByRole('button', { name: '시술 추가' }));
  fill('1번째 시술 이름', '가상 레이저');
  fill('1번째 시술 비용 (원)', '50000');
  fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    await screen.findByRole('heading', { level: 2, name: '가상피부과 · 피부과' }),
  ).toBeInTheDocument();
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/visits');
  expect(sentBody(post as [string, RequestInit])).toEqual({
    date: '2026-03-15',
    clinic: '가상피부과',
    department: '',
    note: '',
    cost: 12000,
    nextVisitOn: null,
    procedures: [{ name: '가상 레이저', area: '', amount: '', cost: 50000, note: '' }],
  });
});

test('editing starts from the visit, can take a procedure out, and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(visit) : json({ visits: [visit], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '2026-03-10 가상피부과 수정' }));
  expect(within(dialog()).getByLabelText('병원 이름')).toHaveValue('가상피부과');
  expect(within(dialog()).getByLabelText('진료비 (원)')).toHaveValue('12000');
  expect(within(dialog()).getByLabelText('다음 예약일')).toHaveValue('2026-04-07');
  expect(within(dialog()).getByLabelText('2번째 시술 메모')).toHaveValue('가상 시술 메모');
  fireEvent.click(within(dialog()).getByRole('button', { name: '1번째 시술 빼기' }));
  expect(within(dialog()).getByLabelText('1번째 시술 이름')).toHaveValue('가상 관리');
  fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

  await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/visits/7');
  expect(put[1]?.method).toBe('PUT');
  expect((sentBody(put as [string, RequestInit]) as { procedures: unknown[] }).procedures).toEqual([
    { name: '가상 관리', area: '', amount: '', cost: null, note: '가상 시술 메모' },
  ]);
});

test('what cannot be sent is explained in the dialog before anything is sent', async () => {
  const fetchMock = serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '방문 기록' }));
  const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
  const said = async (text: string) =>
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text);

  save();
  await said('병원 이름을 입력해 주세요');
  fill('병원 이름', '가상의원');
  fill('진료비 (원)', '1.5');
  save();
  await said('진료비은(는) 원 단위 숫자로 입력해 주세요');
  fill('진료비 (원)', '');
  fill('다음 예약일', '2026-03-14');
  save();
  await said('다음 예약일은 방문 날짜보다 빠를 수 없습니다');
  fill('다음 예약일', '2100-01-01');
  save();
  await said('다음 예약일: 2000-01-01부터 2099-12-31까지 기록할 수 있습니다');
  fill('다음 예약일', '');
  fill('방문 날짜', '1999-12-31');
  save();
  await said('방문 날짜: 2000-01-01부터 2099-12-31까지 기록할 수 있습니다');
  fill('방문 날짜', '2026-03-15');
  fill('진료비 (원)', '100,000,001');
  save();
  await said('진료비은(는) 1억 원 이하로 입력해 주세요');
  fill('진료비 (원)', '');
  fill('병원 이름', '🏥'.repeat(101));
  save();
  await said('병원 이름은(는) 100자 이하로 입력해 주세요');
  fill('병원 이름', '가상의원');
  fireEvent.click(within(dialog()).getByRole('button', { name: '시술 추가' }));
  save();
  await said('1번째 시술의 이름을 입력해 주세요');
  fill('1번째 시술 이름', '가상 시술');
  fill('1번째 시술 메모', '가'.repeat(501));
  save();
  await said('1번째 시술 메모은(는) 500자 이하로 입력해 주세요');
  expect(writes(fetchMock)).toHaveLength(0);
});

test('a visit takes at most ten procedures', async () => {
  serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '방문 기록' }));
  const add = within(dialog()).getByRole('button', { name: '시술 추가' });
  for (let count = 0; count < 10; count += 1) {
    add.focus();
    fireEvent.click(add);
  }
  // The new row's name takes focus each time.
  await waitFor(() => expect(within(dialog()).getByLabelText('10번째 시술 이름')).toHaveFocus());
  expect(add).toHaveAttribute('aria-disabled', 'true');
  add.focus();
  fireEvent.click(add);
  expect(within(dialog()).queryByLabelText('11번째 시술 이름')).not.toBeInTheDocument();
  expect(add).toHaveFocus();
  expect(
    within(dialog()).getByText('시술은 한 번에 10개까지 기록할 수 있습니다.'),
  ).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('10번째 시술 이름')).toBeInTheDocument();
});

test('searching sends the encoded words and says when nothing matches', async () => {
  const fetchMock = serve((url) =>
    json({ visits: url.includes('q=100%25') ? [] : [visit], more: false }),
  );
  open();
  await screen.findByText('방문 1건');
  fireEvent.change(screen.getByRole('searchbox', { name: '병원 기록 검색' }), {
    target: { value: ' 100% ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  expect(await screen.findByText('찾는 기록이 없습니다')).toBeInTheDocument();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/visits?q=100%25');
});

test('deleting asks first, removes the visit and keeps keyboard focus on the page', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json({ visits: deleted ? [] : [visit], more: false });
  });
  const success = vi.spyOn(toast, 'success');
  open();
  fireEvent.click(await screen.findByRole('button', { name: '2026-03-10 가상피부과 삭제' }));
  const confirm = screen.getByRole('dialog', { name: '병원 방문 기록을 삭제할까요?' });
  expect(writes(fetchMock)).toHaveLength(0);
  fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }));

  expect(await screen.findByText('병원 기록이 없습니다')).toBeInTheDocument();
  expect(writes(fetchMock)[0][0]).toBe('/api/visits/7');
  expect(success).toHaveBeenCalledWith('삭제했습니다');
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: '병원' })).toHaveFocus(),
  );
});

test('the daily link opens a new visit on its day', async () => {
  serve(() => json({ visits: [], more: false }));
  open('/visits?new=2026-03-02');
  expect(await screen.findByRole('dialog', { name: '병원 방문 기록' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('방문 날짜')).toHaveValue('2026-03-02');
  expect(window.location.search).toBe('');
});

test('a failed save keeps the dialog, what was typed and the focus inside it', async () => {
  serve((_url, init) =>
    init?.method === 'POST'
      ? json({ error: '서버 오류가 발생했습니다' }, 500)
      : json({ visits: [], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '방문 기록' }));
  fill('병원 이름', '가상의원');
  const save = within(dialog()).getByRole('button', { name: '저장' });
  save.focus();
  fireEvent.click(save);
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(within(dialog()).getByLabelText('병원 이름')).toHaveValue('가상의원');
  expect(within(dialog()).getByRole('button', { name: '저장' })).toHaveFocus();
});

// The daily card.

const renderCard = (date = '2026-03-10') =>
  render(
    <MemoryRouter>
      <VisitsCard date={date} />
    </MemoryRouter>,
  );

test('the daily card shows the day’s visits and links to record one on that day', async () => {
  const fetchMock = serve(() => json({ visits: [visit], more: false }));
  renderCard();
  const list = await screen.findByRole('list', { name: '이 날 병원 방문' });
  expect(within(list).getByText('가상피부과 · 피부과')).toBeInTheDocument();
  expect(within(list).getByText('가상 레이저 · 이마 · 1회차 · 50,000원')).toBeInTheDocument();
  expect(within(list).getByText('진료비 12,000원')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/visits?date=2026-03-10');
  expect(screen.getByRole('link', { name: '이 날 병원 방문 기록' })).toHaveAttribute(
    'href',
    '/visits?new=2026-03-10',
  );
  expect(screen.getByRole('link', { name: '병원 기록 보기' })).toHaveAttribute('href', '/visits');
});

test('a day without visits says so', async () => {
  serve(() => json({ visits: [], more: false }));
  renderCard();
  expect(await screen.findByText('이 날 병원 방문 기록이 없습니다.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '병원 기록 보기' })).not.toBeInTheDocument();
});

test('trying again after a failed load moves focus to the card', async () => {
  const replies = [
    json({ error: '서버 오류가 발생했습니다' }, 500),
    json({ visits: [], more: false }),
  ];
  serve(() => replies.shift()!);
  renderCard();
  const again = await screen.findByRole('button', { name: '다시 시도' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByText('이 날 병원 방문 기록이 없습니다.')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '병원·약' }).parentElement).toHaveFocus(),
  );
});

test('the daily card reads only after a visit save still on its way', async () => {
  let finish = () => {};
  void trackWrite(
    '/api/visits/',
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const fetchMock = serve(() => json({ visits: [visit], more: false }));
  renderCard();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
  finish();
  expect(await screen.findByRole('list', { name: '이 날 병원 방문' })).toBeInTheDocument();
});

test('removing a procedure row moves focus to the add button, not the page', async () => {
  serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '방문 기록' }));
  fireEvent.click(within(dialog()).getByRole('button', { name: '시술 추가' }));
  const remove = within(dialog()).getByRole('button', { name: '1번째 시술 빼기' });
  remove.focus();
  fireEvent.click(remove);
  await waitFor(() =>
    expect(within(dialog()).getByRole('button', { name: '시술 추가' })).toHaveFocus(),
  );
});

test('a daily link outside the daily range starts on today instead', async () => {
  serve(() => json({ visits: [], more: false }));
  open('/visits?new=1985-07-01');
  expect(await screen.findByRole('dialog', { name: '병원 방문 기록' })).toBeInTheDocument();
  await waitFor(() =>
    expect(within(dialog()).getByLabelText('방문 날짜')).toHaveValue('2026-03-15'),
  );
});

test('while a search is on its way, the next page waits, so two lists never mix', async () => {
  let finishSearch = () => {};
  const fetchMock = serve((url) => {
    if (url.includes('q=%EA%B0%80')) {
      return new Promise<Response>((resolve) => {
        finishSearch = () => resolve(json({ visits: [{ ...visit, id: 9 }], more: false }));
      });
    }
    return json({ visits: [visit], more: true });
  });
  open();
  const more = await screen.findByRole('button', { name: '결과 더 보기' });
  fireEvent.change(screen.getByRole('searchbox', { name: '병원 기록 검색' }), {
    target: { value: '가' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await waitFor(() => expect(more).toHaveAttribute('aria-disabled', 'true'));
  fireEvent.click(more);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('offset='))).toBe(false);
  finishSearch();
  expect(await screen.findByText('방문 1건')).toBeInTheDocument();
});
