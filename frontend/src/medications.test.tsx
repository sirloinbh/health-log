import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';
import type { Medication, MedicationLists } from './med-text';
import { VisitsCard } from './visit-card';
import type { Visit } from './visit-text';

// Made-up values only: no real prescription belongs in tests.
const prescribed: Medication = {
  id: 3,
  name: '가상정',
  dose: '500mg',
  directions: '하루 2번 식후',
  startOn: '2026-03-10',
  endOn: null,
  note: '가상 메모',
  visit: { id: 7, date: '2026-03-10', clinic: '가상내과' },
};
const finished: Medication = {
  ...prescribed,
  id: 4,
  name: '가상캡슐',
  dose: null,
  directions: null,
  startOn: '2026-02-01',
  endOn: '2026-02-07',
  note: null,
  visit: null,
};
const visit: Visit = {
  id: 7,
  date: '2026-03-10',
  clinic: '가상내과',
  department: null,
  note: null,
  cost: null,
  nextVisitOn: null,
  procedures: [],
};

const lists = (overrides: Partial<MedicationLists> = {}): MedicationLists => ({
  today: '2026-03-15',
  current: [prescribed],
  upcoming: [],
  past: [finished],
  ...overrides,
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `medications` answers /api/medications; visits are the one above; else today's date. */
const serve = (medications: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/medications')
        ? medications(url, init)
        : url.startsWith('/api/visits')
          ? json({ visits: [visit], more: false })
          : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = (path = '/medications') => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/medications') && (init?.method ?? 'GET') !== 'GET',
  );

const sentBody = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as unknown;

const dialog = () => screen.getByRole('dialog');
const fill = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

test('the main menu opens the medicine page, split into taken now and finished', async () => {
  serve(() => json(lists()));
  window.history.replaceState(null, '', '/');
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '약' }));
  expect(await screen.findByRole('heading', { level: 1, name: '약' })).toBeInTheDocument();

  const current = await screen.findByRole('region', { name: '복용 중 1' });
  expect(within(current).getByRole('heading', { name: '가상정' })).toBeInTheDocument();
  expect(within(current).getByText('2026-03-10부터')).toBeInTheDocument();
  expect(within(current).getByText('500mg · 하루 2번 식후')).toBeInTheDocument();
  expect(within(current).getByText('2026-03-10 가상내과 처방')).toBeInTheDocument();
  const past = screen.getByRole('region', { name: '지난 약 1' });
  expect(within(past).getByText('2026-02-01 ~ 2026-02-07')).toBeInTheDocument();
  // Nothing starting later, so that list is left out.
  expect(screen.queryByRole('region', { name: /시작 예정/ })).not.toBeInTheDocument();
  expect(screen.getByText(/오늘\(2026-03-15\) 기준/)).toBeInTheDocument();
});

test('a new medicine starts today, can be linked to a visit, and is sent as typed', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(prescribed, 201) : json(lists({ current: [] })),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '약 기록' }));
  expect(within(dialog()).getByLabelText('시작일')).toHaveValue('2026-03-15');
  fill('약 이름', '가상정');
  fill('용량', '500mg');
  await within(dialog()).findByRole('option', { name: '2026-03-10 가상내과' });
  fill('처방받은 병원 방문', '7');
  fill('종료일', '2026-03-21');
  fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/medications');
  expect(sentBody(post)).toEqual({
    name: '가상정',
    dose: '500mg',
    directions: '',
    startOn: '2026-03-15',
    endOn: '2026-03-21',
    note: '',
    visitId: 7,
  });
});

test('editing starts from the medicine, and taking the link off sends no visit', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(prescribed) : json(lists()),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '가상정 수정' }));
  expect(within(dialog()).getByLabelText('약 이름')).toHaveValue('가상정');
  expect(within(dialog()).getByLabelText('복용법')).toHaveValue('하루 2번 식후');
  expect(within(dialog()).getByLabelText('처방받은 병원 방문')).toHaveValue('7');
  fill('처방받은 병원 방문', '');
  fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

  await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/medications/3');
  expect((sentBody(put) as { visitId: unknown }).visitId).toBeNull();
});

test('what cannot be sent is explained before anything is sent', async () => {
  const fetchMock = serve(() => json(lists()));
  open();
  fireEvent.click(await screen.findByRole('button', { name: '약 기록' }));
  const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
  const said = async (text: string) =>
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text);

  save();
  await said('약 이름을 입력해 주세요');
  fill('약 이름', '💊'.repeat(101));
  save();
  await said('약 이름은 100자 이하로 입력해 주세요');
  fill('약 이름', '가상정');
  fill('종료일', '2026-03-14');
  save();
  await said('종료일은 시작일보다 빠를 수 없습니다');
  fill('종료일', '');
  fill('시작일', '1999-12-31');
  save();
  await said('시작일: 2000-01-01부터 2099-12-31까지 기록할 수 있습니다');
  expect(writes(fetchMock)).toHaveLength(0);
});

test('a visit’s link opens a medicine linked to it, starting on its day', async () => {
  serve(() => json(lists()));
  open('/medications?visit=7&date=2026-03-10');
  expect(await screen.findByRole('dialog', { name: '약 기록' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('시작일')).toHaveValue('2026-03-10');
  await waitFor(() =>
    expect(within(dialog()).getByLabelText('처방받은 병원 방문')).toHaveValue('7'),
  );
  expect(window.location.search).toBe('');
});

test('deleting asks first, removes the medicine and keeps keyboard focus on the page', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json(lists({ past: deleted ? [] : [finished] }));
  });
  const success = vi.spyOn(toast, 'success');
  open();
  fireEvent.click(await screen.findByRole('button', { name: '가상캡슐 삭제' }));
  const confirm = screen.getByRole('dialog', { name: '약 기록을 삭제할까요?' });
  fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }));

  expect(await screen.findByText('끝난 약이 없습니다.')).toBeInTheDocument();
  expect(writes(fetchMock)[0][0]).toBe('/api/medications/4');
  expect(success).toHaveBeenCalledWith('삭제했습니다');
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '약' })).toHaveFocus());
});

test('a failed save keeps the dialog, what was typed and the focus inside it', async () => {
  serve((_url, init) =>
    init?.method === 'POST'
      ? json({ error: '연결할 병원 방문을 찾을 수 없습니다' }, 400)
      : json(lists()),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: '약 기록' }));
  fill('약 이름', '가상정');
  const save = within(dialog()).getByRole('button', { name: '저장' });
  save.focus();
  fireEvent.click(save);
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
    '연결할 병원 방문을 찾을 수 없습니다',
  );
  expect(within(dialog()).getByLabelText('약 이름')).toHaveValue('가상정');
  expect(within(dialog()).getByRole('button', { name: '저장' })).toHaveFocus();
});

test('a visit card links to recording what was prescribed there', async () => {
  serve(() => json(lists()));
  open('/visits');
  expect(
    await screen.findByRole('link', { name: '2026-03-10 가상내과 처방 약 기록' }),
  ).toHaveAttribute('href', '/medications?visit=7&date=2026-03-10');
});

// The daily card's medicine part.

const renderCard = (date = '2026-03-12') =>
  render(
    <MemoryRouter>
      <VisitsCard date={date} />
    </MemoryRouter>,
  );

test('the daily card lists the medicines taken that day', async () => {
  const fetchMock = serve(() => json({ date: '2026-03-12', medications: [prescribed] }));
  renderCard();
  const part = await screen.findByRole('region', { name: '이 날 먹은 약' });
  expect(within(part).getByText('가상정')).toBeInTheDocument();
  expect(within(part).getByText('· 500mg · 하루 2번 식후')).toBeInTheDocument();
  expect(within(part).getByRole('link', { name: '약 기록 보기' })).toHaveAttribute(
    'href',
    '/medications',
  );
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/medications?date=2026-03-12');
});

test('a day without medicines says so', async () => {
  serve(() => json({ date: '2026-03-12', medications: [] }));
  renderCard();
  expect(await screen.findByText('이 날 먹은 약 기록이 없습니다.')).toBeInTheDocument();
});
