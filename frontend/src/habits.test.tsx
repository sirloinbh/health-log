import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, expect, test, vi } from 'vitest';

import { toast } from './components/ui/sonner';
import { HabitsCard } from './habits';

// jsdom lacks pointer capture and scrolling, which Radix Select calls.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const choose = (trigger: HTMLElement, option: string) => {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
};

const date = '2026-11-04';
type Period = {
  smoking: { days: number; cigarettes: number | null };
  drinking: { days: number; drinkingDays: number; totals: unknown[] };
};
const emptyPeriod: Period = {
  smoking: { days: 0, cigarettes: null },
  drinking: { days: 0, drinkingDays: 0, totals: [] },
};
const dayOf = (record: unknown, period = emptyPeriod) => ({
  record,
  week: { from: '2026-11-02', to: '2026-11-08', ...period },
  month: { from: '2026-11-01', to: '2026-11-30', ...period },
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

const card = () =>
  screen
    .getByRole('heading', { name: 'Alcohol and tobacco' })
    .closest<HTMLElement>('[data-slot=card]')!;

test('a day with nothing recorded shows the form and says the periods have no record', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByLabelText('Cigarettes')).toHaveValue('');
  expect(request(fetchMock, 0).url).toBe(`/api/habits/${date}`);
  const week = screen.getByRole('region', { name: 'This week' });
  expect(within(week).getByText('Nov 2 – Nov 8')).toBeInTheDocument();
  expect(within(week).getByText('Cigarettes: No records')).toBeInTheDocument();
  expect(within(week).getByText('Drinks: No records')).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'This month' })).getByText('Nov 1 – Nov 30'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('zero cigarettes and no drinking are saved as recorded none, not left blank', async () => {
  const saved = { date, cigarettes: 0, drinks: [] };
  const fetchMock = server(
    { body: dayOf(null) },
    {
      body: dayOf(saved, {
        smoking: { days: 1, cigarettes: 0 },
        drinking: { days: 1, drinkingDays: 0, totals: [] },
      }),
    },
  );
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Cigarettes'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'No drinking' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('No smoking')).toBeInTheDocument();
  expect(screen.getByText('No drinking')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/habits/${date}`,
    method: 'PUT',
    body: { cigarettes: 0, drinks: [] },
  });
  const week = screen.getByRole('region', { name: 'This week' });
  expect(within(week).getByText('Cigarettes: 0 cigarettes (1 day recorded)')).toBeInTheDocument();
  expect(within(week).getByText('Drinks: Drank on 0 days / 1 day recorded')).toBeInTheDocument();
});

test('drinks are listed one per row, and a blank cigarette field stays unrecorded', async () => {
  const drinks = [
    { kind: 'soju', unit: 'bottle', amount: 1.5 },
    { kind: 'beer', unit: 'bottle', amount: 1 },
  ];
  const fetchMock = server(
    { body: dayOf(null) },
    { body: dayOf({ date, cigarettes: null, drinks }) },
  );
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('Cigarettes');
  fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
  fireEvent.change(screen.getByLabelText('Drink 1 amount'), { target: { value: '1.5' } });
  // A new row starts on a kind not used yet.
  fireEvent.click(screen.getByRole('button', { name: 'Add drink' }));
  expect(screen.getByLabelText('Drink 2 type')).toHaveTextContent('Beer');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Soju 1.5 bottles, Beer 1 bottle')).toBeInTheDocument();
  expect(screen.getByText('Not recorded')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ cigarettes: null, drinks });
});

test('a removed drink row is not sent', async () => {
  const fetchMock = server(
    { body: dayOf(null) },
    {
      body: dayOf({
        date,
        cigarettes: null,
        drinks: [{ kind: 'beer', unit: 'bottle', amount: 1 }],
      }),
    },
  );
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('Cigarettes');
  fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add drink' }));
  fireEvent.click(screen.getByRole('button', { name: 'Drink 1 remove' }));
  expect(screen.queryByLabelText('Drink 2 amount')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Beer 1 bottle');
  expect(request(fetchMock, 1).body.drinks).toEqual([{ kind: 'beer', unit: 'bottle', amount: 1 }]);
});

test.each([
  [{ cigarettes: '' }, 'Record at least one drink or cigarette count'],
  [{ cigarettes: '1.5' }, 'whole number'],
  [{ cigarettes: '3,5' }, 'Cigarettes'],
  [{ cigarettes: '201' }, '200 or fewer'],
  [{ cigarettes: '', drinks: true, amount: '99.5' }, '99 or less'],
  [{ cigarettes: '', drinks: true, amount: '0.125' }, '2 decimal places'],
  [{ cigarettes: '', drinks: true, amount: '0' }, 'Drink 1 amount must be a number greater than 0'],
  [{ cigarettes: '', drinks: true, amount: '1,5' }, 'Drink 1 amount'],
])('%j is refused before anything is sent', async (input, message) => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Cigarettes'), {
    target: { value: input.cigarettes },
  });
  if ('drinks' in input) {
    fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
    fireEvent.change(screen.getByLabelText('Drink 1 amount'), { target: { value: input.amount } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(message));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('drinking with every row removed asks for one', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('Cigarettes');
  fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
  fireEvent.click(screen.getByRole('button', { name: 'Drink 1 remove' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one drink');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a saved day opens its own values for editing', async () => {
  const record = { date, cigarettes: 7, drinks: [{ kind: 'wine', unit: 'glass', amount: 2 }] };
  const fetchMock = server({ body: dayOf(record) }, { body: dayOf({ ...record, cigarettes: 5 }) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByText('7 cigarettes')).toBeInTheDocument();
  expect(screen.getByText('Wine 2 glasses')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Cigarettes')).toHaveValue('7');
  expect(screen.getByRole('button', { name: 'Drank' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Drink 1 amount')).toHaveValue('2');
  expect(screen.getByLabelText('Drink 1 type')).toHaveTextContent('Wine');
  fireEvent.change(screen.getByLabelText('Cigarettes'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('5 cigarettes')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ cigarettes: 5, drinks: record.drinks });
  await waitFor(() => expect(screen.getByText('Alcohol and tobacco').parentElement).toHaveFocus());
});

test('cancelling an edit keeps the saved values', async () => {
  server({ body: dayOf({ date, cigarettes: 7, drinks: null }) });
  render(<HabitsCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Cigarettes'), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('7 cigarettes')).toBeInTheDocument();
});

test('deleting asks first, then reloads the totals without the day', async () => {
  const fetchMock = server(
    {
      body: dayOf(
        { date, cigarettes: 3, drinks: null },
        { smoking: { days: 1, cigarettes: 3 }, drinking: emptyPeriod.drinking },
      ),
    },
    { status: 204 },
    { body: dayOf(null) },
  );
  render(<HabitsCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Delete this alcohol and tobacco record?',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByLabelText('Cigarettes')).toHaveValue('');
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/habits/${date}`,
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).method).toBe('GET');
  expect(
    within(screen.getByRole('region', { name: 'This week' })).getByText('Cigarettes: No records'),
  ).toBeInTheDocument();
});

test('a server refusal is shown and the form keeps what was typed', async () => {
  server(
    { body: dayOf(null) },
    { status: 400, body: { error: 'Cigarettes must be 200 or fewer' } },
  );
  render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Cigarettes'), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('200 or fewer');
  expect(screen.getByLabelText('Cigarettes')).toHaveValue('300');
  expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: dayOf(null) });
  render(<HabitsCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(within(card()).queryByRole('region', { name: 'This week' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Cigarettes')).toBeInTheDocument();
});

test('the same kind and unit twice is refused before anything is sent', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('Cigarettes');
  fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add drink' }));
  choose(screen.getByLabelText('Drink 2 type'), 'Soju');
  expect(screen.getByLabelText('Drink 2 type')).toHaveTextContent('Soju');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Soju (bottle) appears twice');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('once every kind is listed, a new row takes a unit not used yet', async () => {
  server({ body: dayOf(null) });
  render(<HabitsCard date={date} />);
  await screen.findByLabelText('Cigarettes');
  fireEvent.click(screen.getByRole('button', { name: 'Drank' }));
  for (let row = 2; row <= 7; row += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Add drink' }));
  }
  const kinds = [1, 2, 3, 4, 5, 6].map(
    (row) => screen.getByLabelText(`Drink ${row} type`).textContent,
  );
  expect(kinds).toEqual(['Soju', 'Beer', 'Wine', 'Makgeolli', 'Spirits', 'Other']);
  expect(screen.getByLabelText('Drink 7 type')).toHaveTextContent('Soju');
  expect(screen.getByLabelText('Drink 7 unit')).toHaveTextContent('glass');
});

test('coming back while a save is on its way shows the saved day, not a blank form', async () => {
  const smoked = { date, cigarettes: 3, drinks: null };
  let saved = false;
  let finishSave = () => {};
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return new Promise<Response>((resolve) => {
        finishSave = () => {
          saved = true;
          resolve(new Response(JSON.stringify(dayOf(smoked))));
        };
      });
    }
    return Promise.resolve(new Response(JSON.stringify(dayOf(saved ? smoked : null))));
  });
  vi.stubGlobal('fetch', fetchMock);
  const first = render(<HabitsCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Cigarettes'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  first.unmount();
  render(<HabitsCard date={date} />);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('Cigarettes')).not.toBeInTheDocument();
  finishSave();
  expect(await screen.findByText('3 cigarettes')).toBeInTheDocument();
  expect(screen.queryByLabelText('Cigarettes')).not.toBeInTheDocument();
});

test('a failed delete says why and keeps the day and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server(
    { body: dayOf({ date, cigarettes: 3, drinks: null }) },
    { status: 500, body: { error: 'Server error occurred' } },
  );
  render(<HabitsCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('Server error occurred');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('3 cigarettes')).toBeInTheDocument();
  shown.mockRestore();
});

test('trying again moves focus to the card, as the button it was on goes away', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: dayOf(null) });
  render(<HabitsCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByLabelText('Cigarettes')).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Alcohol and tobacco' }).parentElement,
    ).toHaveFocus(),
  );
});

test('a retry cannot be started twice, so no older answer can land after a newer one', async () => {
  const finishers: ((response: Response) => void)[] = [];
  const fetchMock = server({ status: 500, body: { error: 'Server error occurred' } });
  render(<HabitsCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => finishers.push(resolve)));
  const before = fetchMock.mock.calls.length;
  fireEvent.click(again);
  fireEvent.click(again);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The button goes with the first press; the second reaches nothing.
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.length - before).toBe(1);
  for (const finish of finishers) {
    finish(new Response(JSON.stringify({ error: 'x' }), { status: 500 }));
  }
  // Settles before the test ends, so nothing updates the card afterwards.
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
