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
  // 2026-11-06 is a Friday.
  week: { from: '2026-11-02', to: '2026-11-08' },
  current: { calories: null, protein: null, sleep: null, sober_days: null, ...current },
  history,
});

test('the sober card shows the goal this week is judged by, and a change later this week is not "to come"', async () => {
  // Today is Friday; the sober change from Saturday already judges this week, a daily one does not.
  const goals = goalsOf(
    { protein: { from, target: 100 }, sober_days: { from: '2026-11-07', target: 6 } },
    [
      { item: 'protein', from: '2026-11-07', target: 120 },
      { item: 'protein', from, target: 100 },
      { item: 'sober_days', from: '2026-11-09', target: 7 },
      { item: 'sober_days', from: '2026-11-07', target: 6 },
      { item: 'sober_days', from, target: 5 },
    ],
  );
  server({ body: goals });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '금주' });
  expect(
    within(cardOf('금주')).getByText(
      '이번 주(11.02~11.08) 목표: 주 6일 이상 금주 (2026-11-07부터)',
    ),
  ).toBeInTheDocument();
  const sober = screen.getByRole('region', { name: '금주 목표 변경 기록' });
  expect(within(sober.querySelector('li') as HTMLElement).getByText('(예정)')).toBeInTheDocument();
  expect(within(sober).getAllByText('(예정)')).toHaveLength(1);
  // The daily goal from Saturday is still to come.
  const protein = screen.getByRole('region', { name: '단백질 목표 변경 기록' });
  expect(within(protein).getAllByText('(예정)')).toHaveLength(1);
  expect(
    within(cardOf('단백질')).getByText('지금 목표: 하루 100g 이상 (2026-11-01부터)'),
  ).toBeInTheDocument();
});

const cardOf = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('[data-slot="card"]') as HTMLElement;

test('a sleep goal is typed in hours and minutes and sent in minutes from the chosen date', async () => {
  const saved = goalsOf({ sleep: { from: '2026-11-03', target: 430 } }, [
    { item: 'sleep', from: '2026-11-03', target: 430 },
  ]);
  const fetchMock = server({ body: goalsOf() }, { body: saved });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '수면' });
  const sleep = cardOf('수면');
  expect(within(sleep).getByText('지금 목표 없음')).toBeInTheDocument();
  // The start date begins at the server's today.
  expect(within(sleep).getByLabelText('적용 시작일')).toHaveValue('2026-11-06');
  fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (시간)'), {
    target: { value: '7' },
  });
  fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (분)'), {
    target: { value: '10' },
  });
  fireEvent.change(within(sleep).getByLabelText('적용 시작일'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.click(within(sleep).getByRole('button', { name: '저장' }));

  await waitFor(() =>
    expect(
      within(cardOf('수면')).getByText('지금 목표: 7시간 10분 이상 (2026-11-03부터)'),
    ).toBeInTheDocument(),
  );
  expect(request(fetchMock, 1)).toEqual({
    url: '/api/goals/sleep',
    method: 'PUT',
    body: { from: '2026-11-03', target: 430 },
  });
  // The form is refilled from what was saved.
  expect(within(cardOf('수면')).getByLabelText('하루 수면 시간 (시간)')).toHaveValue('7');
  expect(within(cardOf('수면')).getByLabelText('하루 수면 시간 (분)')).toHaveValue('10');
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

const over = dayOf({
  calories: { goal: { from, target: 2000 }, status: 'missed', actual: meals(2, 2300) },
});

test('a save in another card of the same day judges again without a button', async () => {
  const fetchMock = server(
    {
      body: dayOf({
        calories: { goal: { from, target: 2000 }, status: 'met', actual: meals(1, 900) },
      }),
    },
    { body: over },
  );
  renderCard();
  expect(await screen.findByText('달성')).toBeInTheDocument();
  // The meal card's save of this day.
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  expect(await screen.findByText('미달')).toBeInTheDocument();
  expect(screen.getByText('2,300kcal · 목표 하루 2,000kcal 이하')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(request(fetchMock, 1).url).toBe(`/api/goals/days/${date}`);
});

test('only saves that can change this day read again', async () => {
  // The first read, then one for each of the three saves below that count.
  const fetchMock = server(...Array.from({ length: 4 }, () => ({ body: dayOf() })));
  renderCard();
  await screen.findByRole('region', { name: '식단' });
  const settle = async (path: string) => {
    await trackWrite(path, Promise.resolve({}));
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  // Another day's meals and sleep, drinks outside this Monday-to-Sunday week, and a food edit.
  await settle('/api/meals/2026-11-05');
  await settle('/api/sleep/2026-11-03');
  await settle('/api/habits/2026-11-09');
  await settle('/api/habits/2026-11-01');
  await settle('/api/foods/12');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Any day of this week's drinks counts toward sober days; so do this day's checks and the goals.
  await settle('/api/habits/2026-11-08');
  await settle('/api/checks/2026-11-04');
  await settle('/api/goals');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  // Exactly one read each, not more after a while.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('a read started by a save is quiet; one asked for with the button says so', async () => {
  const replies: ((body: unknown) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          replies.push((body) => resolve(new Response(JSON.stringify(body))));
        }),
    ),
  );
  renderCard();
  await waitFor(() => expect(replies).toHaveLength(1));
  replies[0](dayOf());
  await screen.findByRole('region', { name: '식단' });

  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));
  // Reading, but nothing announced while the person works in the meal card.
  expect(screen.queryByRole('status', { name: '다시 판정하는 중' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다시 판정' })).not.toHaveAttribute('aria-busy');
  // Waits for the answer on screen, so the quiet read is over before the button is pressed.
  replies[1](over);
  expect(await screen.findByText('미달')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다시 판정' }));
  await waitFor(() => expect(replies).toHaveLength(3));
  expect(screen.getByRole('status', { name: '다시 판정하는 중' })).toBeInTheDocument();
  replies[2](dayOf());
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: '다시 판정하는 중' })).not.toBeInTheDocument(),
  );
});

test('pressing the button during a quiet read asks again and says so', async () => {
  const replies: ((body: unknown) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          replies.push((body) => resolve(new Response(JSON.stringify(body))));
        }),
    ),
  );
  renderCard();
  await waitFor(() => expect(replies).toHaveLength(1));
  replies[0](dayOf());
  await screen.findByRole('region', { name: '식단' });
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));

  // The quiet read is still out; the press starts its own.
  fireEvent.click(screen.getByRole('button', { name: '다시 판정' }));
  await waitFor(() => expect(replies).toHaveLength(3));
  expect(screen.getByRole('status', { name: '다시 판정하는 중' })).toBeInTheDocument();
  replies[2](over);
  expect(await screen.findByText('미달')).toBeInTheDocument();
  // The quiet read's late answer is dropped.
  replies[1](dayOf());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByText('미달')).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: '다시 판정하는 중' })).not.toBeInTheDocument();
});

test('when reads overlap, a late answer to the older one is not shown', async () => {
  const replies: ((body: unknown) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          replies.push((body) => resolve(new Response(JSON.stringify(body))));
        }),
    ),
  );
  renderCard();
  await waitFor(() => expect(replies).toHaveLength(1));
  replies[0](dayOf());
  await screen.findByRole('region', { name: '식단' });
  // Two saves in a row start two reads.
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));
  await trackWrite(`/api/sleep/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(3));
  replies[2](over);
  expect(await screen.findByText('미달')).toBeInTheDocument();
  // The first save's read answers last, with what was true before the second save.
  replies[1](
    dayOf({
      calories: { goal: { from, target: 2000 }, status: 'met', actual: meals(1, 900) },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByText('미달')).toBeInTheDocument();
  expect(screen.queryByText('달성')).not.toBeInTheDocument();
});

test('a card that is gone stops listening', async () => {
  const fetchMock = server({ body: dayOf() });
  const { unmount } = renderCard();
  await screen.findByRole('region', { name: '식단' });
  unmount();
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await new Promise((resolve) => setTimeout(resolve, 20));
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

test('a start date outside the days the daily page shows is refused', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '단백질' });
  const protein = cardOf('단백질');
  fireEvent.change(within(protein).getByLabelText('하루 단백질 하한 (g)'), {
    target: { value: '100' },
  });
  fireEvent.change(within(protein).getByLabelText('적용 시작일'), {
    target: { value: '2100-01-01' },
  });
  fireEvent.click(within(protein).getByRole('button', { name: '저장' }));
  expect(
    await within(protein).findByText(
      '적용 시작일은 2000-01-01부터 2099-12-31까지 고를 수 있습니다',
    ),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('unreadable sleep minutes are refused, not saved as no minutes', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: '수면' });
  const sleep = cardOf('수면');
  fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (시간)'), {
    target: { value: '7' },
  });
  for (const value of ['3O', '-10', '30분']) {
    fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (분)'), { target: { value } });
    fireEvent.click(within(sleep).getByRole('button', { name: '저장' }));
    expect(
      await within(sleep).findByText(/하루 수면 시간\(분\): 숫자만 입력해 주세요/),
    ).toBeInTheDocument();
  }
  fireEvent.change(within(sleep).getByLabelText('하루 수면 시간 (분)'), {
    target: { value: '75' },
  });
  fireEvent.click(within(sleep).getByRole('button', { name: '저장' }));
  expect(
    await within(sleep).findByText('수면 시간: 분은 0~59로 입력해 주세요'),
  ).toBeInTheDocument();
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
  // The pressed button is gone with its row, so focus goes to the card's title.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(cardOf('단백질')).getByRole('heading', { name: '단백질' }).parentElement,
    ),
  );
});

test('a deleted change stays gone even if reading the goals again fails', async () => {
  const goals = goalsOf({ sleep: { from: '2026-11-05', target: 480 } }, [
    { item: 'sleep', from: '2026-11-05', target: 480 },
    { item: 'sleep', from, target: 420 },
  ]);
  server({ body: goals }, { status: 204 }, { status: 500, body: { error: '서버 오류' } });
  render(<GoalsSettings />);
  const history = await screen.findByRole('region', { name: '수면 목표 변경 기록' });
  fireEvent.click(within(history).getByRole('button', { name: '2026-11-05 수면 목표 변경 삭제' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }));

  expect(await screen.findByText('서버 오류')).toBeInTheDocument();
  expect(within(history).queryByText(/2026-11-05부터/)).not.toBeInTheDocument();
  // The goal before it holds again.
  expect(
    within(cardOf('수면')).getByText('지금 목표: 7시간 이상 (2026-11-01부터)'),
  ).toBeInTheDocument();
});
