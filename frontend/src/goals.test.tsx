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

  const diet = await screen.findByRole('region', { name: 'Diet' });
  expect(request(fetchMock, 0).url).toBe(`/api/goals/days/${date}`);
  expect(within(diet).getByText('Met')).toBeInTheDocument();
  expect(within(diet).getByText('1,850kcal · Goal: Up to 2,000kcal a day')).toBeInTheDocument();
  expect(within(diet).getByText('Missed')).toBeInTheDocument();
  expect(within(diet).getByText('80g · Goal: At least 100g a day')).toBeInTheDocument();
  // The person's own answer sits next to the automatic one, and can disagree with it.
  expect(within(diet).getByText('Not kept')).toBeInTheDocument();

  // No sleep recorded is "No records", not a miss.
  const sleep = screen.getByRole('region', { name: 'Sleep' });
  expect(within(sleep).getByText('No records')).toBeInTheDocument();
  expect(within(sleep).queryByText('Missed')).not.toBeInTheDocument();
  expect(within(sleep).getByText('Not checked')).toBeInTheDocument();

  const sober = screen.getByRole('region', { name: 'Alcohol-free' });
  expect(within(sober).getByText('No goal')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Set goals in Settings' })).not.toBeInTheDocument();
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
  const diet = await screen.findByRole('region', { name: 'Diet' });
  expect(within(diet).getByText('Undetermined')).toBeInTheDocument();
  expect(
    within(diet).getByText('Some foods have unknown values, so it cannot be judged'),
  ).toBeInTheDocument();
  const sober = screen.getByRole('region', { name: 'Alcohol-free' });
  expect(
    within(sober).getByText(
      'This week (Nov 2 – Nov 8): 1 alcohol-free day / 2 days recorded · Goal: At least 5 alcohol-free days a week',
    ),
  ).toBeInTheDocument();
  expect(within(sober).getByText('It depends on days not recorded yet')).toBeInTheDocument();
});

test('with no goal at all the card points to the settings', async () => {
  server({ body: dayOf() });
  renderCard();
  expect(await screen.findByRole('link', { name: 'Set goals in Settings' })).toHaveAttribute(
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
  fireEvent.click(await screen.findByRole('button', { name: 'Re-judge' }));
  expect(await screen.findByText('Missed')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: 'Server error' } }, { body: dayOf() });
  renderCard();
  expect(await screen.findByText('Server error')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('region', { name: 'Diet' })).toBeInTheDocument();
});

// Today and its week as the server would answer them: 2026-11-06 is a Friday.
const goalsOf = (current: Record<string, unknown> = {}, history: unknown[] = []) => ({
  today: '2026-11-06',
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
  await screen.findByRole('heading', { name: 'Alcohol-free' });
  expect(
    within(cardOf('Alcohol-free')).getByText(
      "This week's goal (Nov 2 – Nov 8): At least 6 alcohol-free days a week (from 2026-11-07)",
    ),
  ).toBeInTheDocument();
  const sober = screen.getByRole('region', { name: 'Alcohol-free goal changes' });
  expect(
    within(sober.querySelector('li') as HTMLElement).getByText('(upcoming)'),
  ).toBeInTheDocument();
  expect(within(sober).getAllByText('(upcoming)')).toHaveLength(1);
  // The daily goal from Saturday is still to come.
  const protein = screen.getByRole('region', { name: 'Protein goal changes' });
  expect(within(protein).getAllByText('(upcoming)')).toHaveLength(1);
  expect(
    within(cardOf('Protein')).getByText('Current goal: At least 100g a day (from 2026-11-01)'),
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
  await screen.findByRole('heading', { name: 'Sleep' });
  const sleep = cardOf('Sleep');
  expect(within(sleep).getByText('Current goal: not set')).toBeInTheDocument();
  // The start date begins at the server's today.
  expect(within(sleep).getByLabelText('Start date')).toHaveValue('2026-11-06');
  fireEvent.change(within(sleep).getByLabelText('Daily sleep time (hours)'), {
    target: { value: '7' },
  });
  fireEvent.change(within(sleep).getByLabelText('Daily sleep time (minutes)'), {
    target: { value: '10' },
  });
  fireEvent.change(within(sleep).getByLabelText('Start date'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.click(within(sleep).getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(
      within(cardOf('Sleep')).getByText('Current goal: At least 7 h 10 min (from 2026-11-03)'),
    ).toBeInTheDocument(),
  );
  expect(request(fetchMock, 1)).toEqual({
    url: '/api/goals/sleep',
    method: 'PUT',
    body: { from: '2026-11-03', target: 430 },
  });
  // The form is refilled from what was saved.
  expect(within(cardOf('Sleep')).getByLabelText('Daily sleep time (hours)')).toHaveValue('7');
  expect(within(cardOf('Sleep')).getByLabelText('Daily sleep time (minutes)')).toHaveValue('10');
  // The refilled form has a new Save button, so focus goes to the card's title instead of the page.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(cardOf('Sleep')).getByRole('heading', { name: 'Sleep' }).parentElement,
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
  expect(await screen.findByRole('region', { name: 'Diet' })).toBeInTheDocument();
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
  expect(await screen.findByText('Met')).toBeInTheDocument();
  // The meal card's save of this day.
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  expect(await screen.findByText('Missed')).toBeInTheDocument();
  expect(screen.getByText('2,300kcal · Goal: Up to 2,000kcal a day')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(request(fetchMock, 1).url).toBe(`/api/goals/days/${date}`);
});

test('only saves that can change this day read again', async () => {
  // The first read, then one for each of the three saves below that count.
  const fetchMock = server(...Array.from({ length: 4 }, () => ({ body: dayOf() })));
  renderCard();
  await screen.findByRole('region', { name: 'Diet' });
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
  await screen.findByRole('region', { name: 'Diet' });

  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));
  // Reading, but nothing announced while the person works in the meal card.
  expect(screen.queryByRole('status', { name: 'Re-judging' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Re-judge' })).not.toHaveAttribute('aria-busy');
  // Waits for the answer on screen, so the quiet read is over before the button is pressed.
  replies[1](over);
  expect(await screen.findByText('Missed')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Re-judge' }));
  await waitFor(() => expect(replies).toHaveLength(3));
  expect(screen.getByRole('status', { name: 'Re-judging' })).toBeInTheDocument();
  replies[2](dayOf());
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: 'Re-judging' })).not.toBeInTheDocument(),
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
  await screen.findByRole('region', { name: 'Diet' });
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));

  // The quiet read is still out; the press starts its own.
  fireEvent.click(screen.getByRole('button', { name: 'Re-judge' }));
  await waitFor(() => expect(replies).toHaveLength(3));
  expect(screen.getByRole('status', { name: 'Re-judging' })).toBeInTheDocument();
  replies[2](over);
  expect(await screen.findByText('Missed')).toBeInTheDocument();
  // The quiet read's late answer is dropped.
  replies[1](dayOf());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByText('Missed')).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Re-judging' })).not.toBeInTheDocument();
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
  await screen.findByRole('region', { name: 'Diet' });
  // Two saves in a row start two reads.
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(2));
  await trackWrite(`/api/sleep/${date}`, Promise.resolve({}));
  await waitFor(() => expect(replies).toHaveLength(3));
  replies[2](over);
  expect(await screen.findByText('Missed')).toBeInTheDocument();
  // The first save's read answers last, with what was true before the second save.
  replies[1](
    dayOf({
      calories: { goal: { from, target: 2000 }, status: 'met', actual: meals(1, 900) },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByText('Missed')).toBeInTheDocument();
  expect(screen.queryByText('Met')).not.toBeInTheDocument();
});

test('a card that is gone stops listening', async () => {
  const fetchMock = server({ body: dayOf() });
  const { unmount } = renderCard();
  await screen.findByRole('region', { name: 'Diet' });
  unmount();
  await trackWrite(`/api/meals/${date}`, Promise.resolve({}));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a value the goal cannot take is refused before sending', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: 'Calories' });
  const calories = cardOf('Calories');
  const field = within(calories).getByLabelText('Daily calorie limit (kcal)');
  const save = within(calories).getByRole('button', { name: 'Save' });

  fireEvent.click(save);
  expect(await within(calories).findByText('Enter daily calorie limit')).toBeInTheDocument();
  fireEvent.change(field, { target: { value: '1800.5' } });
  fireEvent.click(save);
  expect(
    await within(calories).findByText('Daily calorie limit: enter a whole number'),
  ).toBeInTheDocument();
  fireEvent.change(field, { target: { value: '2천' } });
  fireEvent.click(save);
  expect(await within(calories).findByText(/enter digits only/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a start date outside the days the daily page shows is refused', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: 'Protein' });
  const protein = cardOf('Protein');
  fireEvent.change(within(protein).getByLabelText('Daily protein minimum (g)'), {
    target: { value: '100' },
  });
  fireEvent.change(within(protein).getByLabelText('Start date'), {
    target: { value: '2100-01-01' },
  });
  fireEvent.click(within(protein).getByRole('button', { name: 'Save' }));
  expect(
    await within(protein).findByText('The start date must be between 2000-01-01 and 2099-12-31'),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('unreadable sleep minutes are refused, not saved as no minutes', async () => {
  const fetchMock = server({ body: goalsOf() });
  render(<GoalsSettings />);
  await screen.findByRole('heading', { name: 'Sleep' });
  const sleep = cardOf('Sleep');
  fireEvent.change(within(sleep).getByLabelText('Daily sleep time (hours)'), {
    target: { value: '7' },
  });
  for (const value of ['3O', '-10', '30 min']) {
    fireEvent.change(within(sleep).getByLabelText('Daily sleep time (minutes)'), {
      target: { value },
    });
    fireEvent.click(within(sleep).getByRole('button', { name: 'Save' }));
    expect(
      await within(sleep).findByText(/Daily sleep time \(minutes\): enter digits only/),
    ).toBeInTheDocument();
  }
  fireEvent.change(within(sleep).getByLabelText('Daily sleep time (minutes)'), {
    target: { value: '75' },
  });
  fireEvent.click(within(sleep).getByRole('button', { name: 'Save' }));
  expect(
    await within(sleep).findByText('Sleep time: enter minutes from 0 to 59'),
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
  await screen.findByRole('heading', { name: 'Calories' });
  expect(within(cardOf('Calories')).getByLabelText('Daily calorie limit (kcal)')).toHaveValue(
    '2000',
  );
  fireEvent.click(
    within(cardOf('Calories')).getByRole('button', {
      name: 'Turn the goal off from the start date',
    }),
  );

  const history = await screen.findByRole('region', { name: 'Calories goal changes' });
  await waitFor(() =>
    expect(within(history).getByText('From 2026-11-06 Goal off')).toBeInTheDocument(),
  );
  expect(within(history).getByText('From 2026-11-01 Up to 2,000kcal a day')).toBeInTheDocument();
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
  const history = await screen.findByRole('region', { name: 'Protein goal changes' });
  expect(within(history).getByText('(upcoming)')).toBeInTheDocument();
  fireEvent.click(
    within(history).getByRole('button', { name: 'Delete 2026-12-01 Protein goal change' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(screen.queryByText('(upcoming)')).not.toBeInTheDocument());
  expect(request(fetchMock, 1)).toEqual({
    url: '/api/goals/protein/2026-12-01',
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).url).toBe('/api/goals');
  // The pressed button is gone with its row, so focus goes to the card's title.
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(cardOf('Protein')).getByRole('heading', { name: 'Protein' }).parentElement,
    ),
  );
});

test('a deleted change stays gone even if reading the goals again fails', async () => {
  const goals = goalsOf({ sleep: { from: '2026-11-05', target: 480 } }, [
    { item: 'sleep', from: '2026-11-05', target: 480 },
    { item: 'sleep', from, target: 420 },
  ]);
  server({ body: goals }, { status: 204 }, { status: 500, body: { error: 'Server error' } });
  render(<GoalsSettings />);
  const history = await screen.findByRole('region', { name: 'Sleep goal changes' });
  fireEvent.click(
    within(history).getByRole('button', { name: 'Delete 2026-11-05 Sleep goal change' }),
  );
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );

  expect(await screen.findByText('Server error')).toBeInTheDocument();
  expect(within(history).queryByText(/From 2026-11-05/)).not.toBeInTheDocument();
  // The goal before it holds again.
  expect(
    within(cardOf('Sleep')).getByText('Current goal: At least 7 h (from 2026-11-01)'),
  ).toBeInTheDocument();
});

test('deleting a sober change says it stops counting from the week of its date', async () => {
  server({
    body: goalsOf({ sober_days: { from, target: 5 }, sleep: { from, target: 420 } }, [
      { item: 'sober_days', from, target: 5 },
      { item: 'sleep', from, target: 420 },
    ]),
  });
  render(<GoalsSettings />);
  const sober = await screen.findByRole('region', { name: 'Alcohol-free goal changes' });
  fireEvent.click(
    within(sober).getByRole('button', { name: `Delete ${from} Alcohol-free goal change` }),
  );
  expect(
    await screen.findByText(
      'Deleting it judges weeks from the week containing that date by the previous goal.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  const sleep = screen.getByRole('region', { name: 'Sleep goal changes' });
  fireEvent.click(within(sleep).getByRole('button', { name: `Delete ${from} Sleep goal change` }));
  expect(
    await screen.findByText('Deleting it judges days from that date by the previous goal.'),
  ).toBeInTheDocument();
});
