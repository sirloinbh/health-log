import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { trackWrite } from './pending-writes';
import type { Reminder, Reminders } from './reminder-text';
import { reminderDetail, reminderTitle, whenText } from './reminder-text';
import { RemindersCard } from './reminders';

// Made-up values only: no real appointment or prescription belongs in tests.
const appointment: Reminder = {
  kind: 'visit',
  id: 7,
  dueOn: '2026-03-15',
  daysLeft: 0,
  clinic: '가상피부과',
  department: '피부과',
  procedures: ['가상레이저', '가상주사'],
};
const lastPill: Reminder = {
  kind: 'medication',
  id: 7,
  dueOn: '2026-03-16',
  daysLeft: 1,
  name: '가상정',
};
const later: Reminder = {
  kind: 'visit',
  id: 8,
  dueOn: '2026-03-22',
  daysLeft: 7,
  clinic: '가상내과',
  department: null,
  procedures: [],
};

const listOf = (reminders: Reminder[]): Reminders => ({
  today: '2026-03-15',
  until: '2026-03-22',
  leadDays: 7,
  reminders,
});

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const serve = (handler: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const show = () =>
  render(
    <MemoryRouter>
      <RemindersCard />
    </MemoryRouter>,
  );

const reads = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === '/api/reminders' && init?.method === 'GET');

test('words for the day and what each reminder is about', () => {
  expect([0, 1, 2, 7].map(whenText)).toEqual(['오늘', '내일', '2일 뒤', '7일 뒤']);
  expect(reminderTitle(appointment)).toBe('가상피부과 · 피부과 예약');
  expect(reminderTitle(later)).toBe('가상내과 예약');
  expect(reminderTitle(lastPill)).toBe('가상정 복용 종료');
  expect(reminderDetail(appointment)).toBe('지난번 시술: 가상레이저, 가상주사');
  expect(reminderDetail(later)).toBeNull();
  expect(reminderDetail(lastPill)).toBeNull();
});

test('each reminder says when, what and where it is written', async () => {
  serve(() => json(listOf([appointment, lastPill, later])));
  show();
  const list = await screen.findByRole('list', { name: '다가오는 일정' });
  const items = within(list).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringMatching(
      /^오늘2026년 3월 15일 일요일가상피부과 · 피부과 예약지난번 시술: 가상레이저, 가상주사/,
    ),
    expect.stringMatching(/^내일2026년 3월 16일 월요일가상정 복용 종료/),
    expect.stringMatching(/^7일 뒤2026년 3월 22일 일요일가상내과 예약/),
  ]);
  expect(within(items[0]).getByRole('link', { name: '병원 기록' })).toHaveAttribute(
    'href',
    '/visits',
  );
  expect(within(items[1]).getByRole('link', { name: '약 기록' })).toHaveAttribute(
    'href',
    '/medications',
  );
  expect(
    screen.getByText(/7일 전부터 알려 줍니다\(2026년 3월 22일 일요일까지\)/),
  ).toBeInTheDocument();
});

test('nothing coming up says so', async () => {
  serve(() => json(listOf([])));
  show();
  expect(
    await screen.findByText('7일 안에 다가오는 병원 예약이나 약 복용 종료가 없습니다.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '다가오는 일정' })).not.toBeInTheDocument();
});

test('marking one done sends its day, takes it off and keeps focus in the card', async () => {
  let finish: (response: Response) => void = () => {};
  const fetchMock = serve((url) =>
    url === '/api/reminders/done'
      ? new Promise((resolve) => (finish = resolve))
      : json(listOf([appointment, lastPill])),
  );
  show();
  const button = await screen.findByRole('button', { name: '가상정 복용 종료 완료' });
  button.focus();
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button).toHaveTextContent('처리 중…');
  // Every done button waits while one is on its way, so a second press is not sent.
  const other = screen.getByRole('button', { name: '가상피부과 · 피부과 예약 완료' });
  expect(other).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(other);
  const posts = fetchMock.mock.calls.filter(([url]) => url === '/api/reminders/done');
  expect(posts).toHaveLength(1);
  expect(posts[0][1]).toMatchObject({ method: 'POST' });
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    kind: 'medication',
    id: 7,
    dueOn: '2026-03-16',
  });

  finish(json(null, 204));
  expect(await screen.findByRole('status')).toHaveTextContent(
    '가상정 복용 종료 알림을 완료로 표시했습니다.',
  );
  // Same id, other kind: the visit stays.
  const list = screen.getByRole('list', { name: '다가오는 일정' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('가상피부과 · 피부과 예약')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '다가오는 일정' }).parentElement).toHaveFocus(),
  );
  expect(other).not.toHaveAttribute('aria-disabled');
});

test('a reminder moved or deleted elsewhere says so and the list is read again', async () => {
  let reminders = [appointment];
  const fetchMock = serve((url) =>
    url === '/api/reminders/done'
      ? json({ error: '알림을 찾을 수 없습니다' }, 404)
      : json(listOf(reminders)),
  );
  show();
  const button = await screen.findByRole('button', { name: '가상피부과 · 피부과 예약 완료' });
  reminders = [{ ...appointment, dueOn: '2026-03-18', daysLeft: 3 }];
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('알림을 찾을 수 없습니다');
  expect(await screen.findByText('3일 뒤')).toBeInTheDocument();
  expect(reads(fetchMock)).toHaveLength(2);
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '다가오는 일정' }).parentElement).toHaveFocus(),
  );
});

test('a list read before a mark landed does not bring the marked one back', async () => {
  let gets = 0;
  let answerSecondRead: (response: Response) => void = () => {};
  serve((url, init) => {
    if (url === '/api/reminders/done') {
      const body = JSON.parse(String(init?.body)) as { kind: string };
      return body.kind === 'visit'
        ? json({ error: '알림을 찾을 수 없습니다' }, 404)
        : json(null, 204);
    }
    gets += 1;
    return gets === 1
      ? json(listOf([appointment, lastPill]))
      : new Promise((resolve) => (answerSecondRead = resolve));
  });
  show();
  // The 404 reads the list again; that answer is still on its way.
  fireEvent.click(await screen.findByRole('button', { name: '가상피부과 · 피부과 예약 완료' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(gets).toBe(2));
  // Meanwhile the medicine is marked done, after the read had already gone out.
  const pill = screen.getByRole('button', { name: '가상정 복용 종료 완료' });
  await waitFor(() => expect(pill).not.toHaveAttribute('aria-disabled'));
  fireEvent.click(pill);
  await screen.findByText('가상정 복용 종료 알림을 완료로 표시했습니다.');
  answerSecondRead(json(listOf([{ ...appointment, dueOn: '2026-03-18', daysLeft: 3 }, lastPill])));
  expect(await screen.findByText('3일 뒤')).toBeInTheDocument();
  expect(screen.queryByText('가상정 복용 종료')).not.toBeInTheDocument();
});

test('any other failure keeps the reminder for another try', async () => {
  serve((url) =>
    url === '/api/reminders/done'
      ? json({ error: '서버에 연결할 수 없습니다' }, 503)
      : json(listOf([appointment])),
  );
  show();
  const button = await screen.findByRole('button', { name: '가상피부과 · 피부과 예약 완료' });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  expect(button).toBeInTheDocument();
  expect(button).not.toHaveAttribute('aria-disabled');
});

test('a failed load can be tried again, and focus stays in the card', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: '서버에 연결할 수 없습니다' }, 503) : json(listOf([later]))));
  show();
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  fail = false;
  retry.focus();
  fireEvent.click(retry);
  expect(await screen.findByText('가상내과 예약')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '다가오는 일정' }).parentElement).toHaveFocus(),
  );
});

test('a visit just saved elsewhere is waited for before the list is read', async () => {
  let land: () => void = () => {};
  void trackWrite('/api/visits/', new Promise<void>((resolve) => (land = resolve)));
  const fetchMock = serve(() => json(listOf([])));
  show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads(fetchMock)).toHaveLength(0);
  land();
  await screen.findByText('7일 안에 다가오는 병원 예약이나 약 복용 종료가 없습니다.');
  expect(reads(fetchMock)).toHaveLength(1);
});

// Only the dashboard here; the daily page is in daily.test.tsx with its other cards.
const app = (path: string) => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/reminders'
        ? json(listOf([appointment]))
        : url.startsWith('/api/report')
          ? json({ error: '리포트 없음' }, 500)
          : json({ today: '2026-03-15', record: null, visits: [], medications: [] }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', path);
  render(<App />);
  return fetchMock;
};

test('the dashboard shows what is coming up', async () => {
  app('/');
  expect(await screen.findByText('가상피부과 · 피부과 예약')).toBeInTheDocument();
});
