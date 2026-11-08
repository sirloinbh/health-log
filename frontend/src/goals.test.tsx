import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { GoalsCard, GoalsSettings } from './goals';
import { trackWrite } from './pending-writes';

const date = '2026-11-04';
const week = { from: '2026-11-02', to: '2026-11-08' };
const from = '2026-11-01';

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

const meals = (entries: number, total: number | null, missing = 0) => ({
  entries,
  total,
  missing,
});

const dayOf = (overrides: Record<string, unknown> = {}, checks: unknown = null) => ({
  date,
  items: [
    { item: 'calories', goal: null, status: null, actual: meals(0, null) },
    { item: 'protein', goal: null, status: null, actual: meals(0, null) },
    { item: 'sleep', goal: null, status: null, actual: { minutes: null } },
    {
      item: 'sober_days',
      goal: null,
      status: null,
      actual: { ...week, recordedDays: 0, soberDays: 0 },
    },
  ].map((entry) => ({ ...entry, ...(overrides[entry.item] as object) })),
  checks,
});

const renderCard = () =>
  render(
    <MemoryRouter>
      <GoalsCard date={date} />
    </MemoryRouter>,
  );

test('each goal shows its verdict beside the day check of the same kind', async () => {
  const fetchMock = server({
    body: dayOf(
      {
        calories: { goal: { from, target: 2000 }, status: 'met', actual: meals(3, 1850) },
        protein: { goal: { from, target: 100 }, status: 'missed', actual: meals(3, 80) },
        sleep: { goal: { from, target: 420 }, status: 'none' },
      },
      { dietKept: false, sleepGood: null },
    ),
  });
  renderCard();

  const diet = await screen.findByRole('region', { name: '식단' });
  expect(request(fetchMock, 0).url).toBe(`/api/goals/days/${date}`);
  expect(within(diet).getByText('달성')).toBeInTheDocument();
  expect(within(diet).getByText('1,850kcal · 목표 하루 2,000kcal 이하')).toBeInTheDocument();
  expect(within(diet).getByText('미달')).toBeInTheDocument();
  expect(within(diet).getByText('80g · 목표 하루 100g 이상')).toBeInTheDocument();
  // The person's own answer sits next to the automatic one, and can disagree with it.
  expect(within(diet).getByText('못 지킴')).toBeInTheDocument();

  // No sleep recorded is "기록 없음", not a miss.
  const sleep = screen.getByRole('region', { name: '수면' });
  expect(within(sleep).getByText('기록 없음')).toBeInTheDocument();
  expect(within(sleep).queryByText('미달')).not.toBeInTheDocument();
  expect(within(sleep).getByText('체크 안 함')).toBeInTheDocument();

  const sober = screen.getByRole('region', { name: '금주' });
  expect(within(sober).getByText('목표 없음')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '설정에서 목표 정하기' })).not.toBeInTheDocument();
});

test('a held verdict says why', async () => {
  server({
    body: dayOf({
      protein: { goal: { from, target: 100 }, status: 'unknown', actual: meals(2, 40, 1) },
      sober_days: {
        goal: { from, target: 5 },
        status: 'unknown',
        actual: { ...week, recordedDays: 2, soberDays: 1 },
      },
    }),
  });
  renderCard();
  const diet = await screen.findByRole('region', { name: '식단' });
  expect(within(diet).getByText('판정 보류')).toBeInTheDocument();
  expect(within(diet).getByText('값을 모르는 음식이 있어 판정할 수 없습니다')).toBeInTheDocument();
  const sober = screen.getByRole('region', { name: '금주' });
  expect(
    within(sober).getByText('이 주(11.02~11.08) 금주 1일 / 기록 2일 · 목표 주 5일 이상 금주'),
  ).toBeInTheDocument();
  expect(within(sober).getByText('아직 기록하지 않은 날에 따라 달라집니다')).toBeInTheDocument();
});

test('with no goal at all the card points to the settings', async () => {
  server({ body: dayOf() });
  renderCard();
  expect(await screen.findByRole('link', { name: '설정에서 목표 정하기' })).toHaveAttribute(
    'href',
    '/settings',
  );
});

test('the verdicts can be asked again after records change elsewhere', async () => {
  const fetchMock = server(
    { body: dayOf() },
    {
      body: dayOf({
        calories: { goal: { from, target: 2000 }, status: 'missed', actual: meals(1, 2500) },
      }),
    },
  );
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: '다시 판정' }));
  expect(await screen.findByText('미달')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: '서버 오류' } }, { body: dayOf() });
  renderCard();
  expect(await screen.findByText('서버 오류')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('region', { name: '식단' })).toBeInTheDocument();
});

const goalsOf = (
  current: Record<string, unknown> = {},
  history: unknown[] = [],
  today = '2026-11-06',
) => ({
  today,
  current: { calories: null, protein: null, sleep: null, sober_days: null, ...current },
  history,
});

const cardOf = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('[data-slot="card"]') as HTMLElement;

test('a sleep goal is typed in hours and sent in minutes from the chosen date', async () => {
  const saved = goalsOf({ sleep: { from: '2026-11-03', target: 450 } }, [
    { item: 'sleep', from: '2026-11-03', target: 450 },
  ]);
  const fetchMock = server({ body: goalsOf() }, { body: saved });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '수면' });
  const sleep = cardOf('수면');
  expect(within(sleep).getByText('지금 목표 없음')).toBeInTheDocument();
  // The start date begins at the server's today.
  expect(within(sleep).getByLabelText('적용 시작일')).toHaveValue('2026-11-06');
  fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (시간)'), {
    target: { value: '7.5' },
  });
  fireEvent.change(within(sleep).getByLabelText('적용 시작일'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.click(within(sleep).getByRole('button', { name: '저장' }));

  await waitFor(() =>
    expect(
      within(cardOf('수면')).getByText('지금 목표: 7시간 30분 이상 (2026-11-03부터)'),
    ).toBeInTheDocument(),
  );
  expect(request(fetchMock, 1)).toEqual({
    url: '/api/goals/sleep',
    method: 'PUT',
    body: { from: '2026-11-03', target: 450 },
  });
  // The form is refilled from what was saved.
  expect(within(cardOf('수면')).getByLabelText('하루 수면 시간 (시간)')).toHaveValue('7.5');
  // The refilled form has a new Save button, so focus goes to the card's title instead of the page.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(cardOf('수면')).getByRole('heading', { name: '수면' }).parentElement,
    ),
  );
});

test('the card reads only after a save of the same day has landed', async () => {
  let land: (value: unknown) => void = () => undefined;
  const save = trackWrite(
    `/api/meals/${date}`,
    new Promise((resolve) => {
      land = resolve;
    }),
  );
  const fetchMock = server({ body: dayOf() });
  renderCard();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetchMock).not.toHaveBeenCalled();
  land(undefined);
  await save;
  expect(await screen.findByRole('region', { name: '식단' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a value the goal cannot take is refused before sending', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '칼로리' });
  const calories = cardOf('칼로리');
  const field = within(calories).getByLabelText('하루 칼로리 상한 (kcal)');
  const save = within(calories).getByRole('button', { name: '저장' });

  fireEvent.click(save);
  expect(
    await within(calories).findByText('하루 칼로리 상한을(를) 입력해 주세요'),
  ).toBeInTheDocument();
  fireEvent.change(field, { target: { value: '1800.5' } });
  fireEvent.click(save);
  expect(
    await within(calories).findByText('하루 칼로리 상한: 정수로 입력해 주세요'),
  ).toBeInTheDocument();
  fireEvent.change(field, { target: { value: '2천' } });
  fireEvent.click(save);
  expect(await within(calories).findByText(/숫자만 입력해 주세요/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a goal can be turned off from a date, and the change shows in its history', async () => {
  const on = goalsOf({ calories: { from, target: 2000 } }, [
    { item: 'calories', from, target: 2000 },
  ]);
  const off = goalsOf({ calories: null }, [
    { item: 'calories', from: '2026-11-06', target: null },
    { item: 'calories', from, target: 2000 },
  ]);
  const fetchMock = server({ body: on }, { body: off });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '칼로리' });
  expect(within(cardOf('칼로리')).getByLabelText('하루 칼로리 상한 (kcal)')).toHaveValue('2000');
  fireEvent.click(within(cardOf('칼로리')).getByRole('button', { name: '시작일부터 목표 끄기' }));

  const history = await screen.findByRole('region', { name: '칼로리 목표 변경 기록' });
  await waitFor(() =>
    expect(within(history).getByText('2026-11-06부터 목표 끔')).toBeInTheDocument(),
  );
  expect(within(history).getByText('2026-11-01부터 하루 2,000kcal 이하')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ from: '2026-11-06', target: null });
});

test('a change after today is marked as coming, and one change can be deleted', async () => {
  const goals = goalsOf({ protein: { from, target: 100 } }, [
    { item: 'protein', from: '2026-12-01', target: 120 },
    { item: 'protein', from, target: 100 },
  ]);
  const fetchMock = server(
    { body: goals },
    { status: 204 },
    { body: goalsOf({ protein: { from, target: 100 } }, [{ item: 'protein', from, target: 100 }]) },
  );
  render(<GoalsSettings />);
  const history = await screen.findByRole('region', { name: '단백질 목표 변경 기록' });
  expect(within(history).getByText('(예정)')).toBeInTheDocument();
  fireEvent.click(
    within(history).getByRole('button', { name: '2026-12-01 단백질 목표 변경 삭제' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));

  await waitFor(() => expect(screen.queryByText('(예정)')).not.toBeInTheDocument());
  expect(request(fetchMock, 1)).toEqual({
    url: '/api/goals/protein/2026-12-01',
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).url).toBe('/api/goals');
});
