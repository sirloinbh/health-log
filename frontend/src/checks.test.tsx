import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ChecksCard } from './checks';
import { toast } from './components/ui/sonner';

const date = '2026-11-04';
type Rate = { days: number; yes: number };
const noRate: Rate = { days: 0, yes: 0 };
const dayOf = (record: unknown, diet = noRate, sleep = noRate) => ({
  record,
  week: { from: '2026-11-02', to: '2026-11-08', diet, sleep },
  month: { from: '2026-11-01', to: '2026-11-30', diet, sleep },
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

const group = (name: string) => screen.getByRole('group', { name });

test('a day with no check starts with both questions unchecked and no rate', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  const diet = await screen.findByRole('group', { name: 'Did you keep your diet?' });
  expect(within(diet).getByRole('button', { name: 'Not checked' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    within(group('Did you sleep well?')).getByRole('button', { name: 'Not checked' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(request(fetchMock, 0).url).toBe(`/api/checks/${date}`);
  const week = screen.getByRole('region', { name: 'This week' });
  expect(within(week).getByText('Nov 2 – Nov 8')).toBeInTheDocument();
  expect(within(week).getByText('Diet: No records')).toBeInTheDocument();
  expect(within(week).getByText('Sleep: No records')).toBeInTheDocument();
});

test('one answered question is sent with the other left unchecked, not as a no', async () => {
  const saved = { date, dietKept: true, sleepGood: null, memo: null };
  const fetchMock = server({ body: dayOf(null) }, { body: dayOf(saved, { days: 1, yes: 1 }) });
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: 'Did you keep your diet?' })).getByRole(
      'button',
      {
        name: 'Kept',
      },
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  // The form closes once the save is back; the view shows the answers.
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Kept')).toBeInTheDocument();
  expect(screen.getByText('Not checked')).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/checks/${date}`,
    method: 'PUT',
    body: { dietKept: true, sleepGood: null, memo: null },
  });
  const week = screen.getByRole('region', { name: 'This week' });
  expect(within(week).getByText('Diet: Kept on 1/1 days (100%)')).toBeInTheDocument();
  expect(within(week).getByText('Sleep: No records')).toBeInTheDocument();
});

test('no answers and a memo are saved as they are, the memo trimmed', async () => {
  const saved = { date, dietKept: false, sleepGood: false, memo: '야근' };
  const fetchMock = server(
    { body: dayOf(null) },
    { body: dayOf(saved, { days: 1, yes: 0 }, { days: 1, yes: 0 }) },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: 'Did you keep your diet?' })).getByRole(
      'button',
      {
        name: 'Not kept',
      },
    ),
  );
  fireEvent.click(
    within(group('Did you sleep well?')).getByRole('button', { name: 'Slept badly' }),
  );
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: '  야근  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('야근')).toBeInTheDocument();
  expect(screen.getByText('Not kept')).toBeInTheDocument();
  expect(screen.getByText('Slept badly')).toBeInTheDocument();
  expect(request(fetchMock, 1).body).toEqual({ dietKept: false, sleepGood: false, memo: '야근' });
  expect(
    within(screen.getByRole('region', { name: 'This week' })).getByText(
      'Diet: Kept on 0/1 days (0%)',
    ),
  ).toBeInTheDocument();
});

test('nothing checked and no memo is refused before anything is sent', async () => {
  const fetchMock = server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Note'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one check or a note');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a saved day opens its own answers for editing, and an answer can be taken back', async () => {
  const record = { date, dietKept: true, sleepGood: false, memo: 'Note' };
  const fetchMock = server(
    { body: dayOf(record, { days: 1, yes: 1 }, { days: 1, yes: 0 }) },
    { body: dayOf({ ...record, sleepGood: null }, { days: 1, yes: 1 }) },
  );
  render(<ChecksCard date={date} />);
  expect(await screen.findByText('Kept')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(
    within(group('Did you keep your diet?')).getByRole('button', { name: 'Kept' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    within(group('Did you sleep well?')).getByRole('button', { name: 'Slept badly' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Note')).toHaveValue('Note');
  fireEvent.click(
    within(group('Did you sleep well?')).getByRole('button', { name: 'Not checked' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(),
  );
  expect(request(fetchMock, 1).body).toEqual({ dietKept: true, sleepGood: null, memo: 'Note' });
  await waitFor(() => expect(screen.getByText('Daily check').parentElement).toHaveFocus());
});

test('cancelling an edit keeps the saved answers', async () => {
  server({ body: dayOf({ date, dietKept: true, sleepGood: null, memo: null }) });
  render(<ChecksCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.click(
    within(group('Did you keep your diet?')).getByRole('button', { name: 'Not kept' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Kept')).toBeInTheDocument();
});

test('deleting asks first, then reloads the rates without the day', async () => {
  const fetchMock = server(
    { body: dayOf({ date, dietKept: true, sleepGood: null, memo: null }, { days: 1, yes: 1 }) },
    { status: 204 },
    { body: dayOf(null) },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete this daily check?' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(request(fetchMock, 1)).toEqual({
    url: `/api/checks/${date}`,
    method: 'DELETE',
    body: undefined,
  });
  expect(request(fetchMock, 2).method).toBe('GET');
  expect(
    within(screen.getByRole('region', { name: 'This week' })).getByText('Diet: No records'),
  ).toBeInTheDocument();
});

test('a server refusal is shown and the answers stay', async () => {
  server(
    { body: dayOf(null) },
    { status: 400, body: { error: 'The note must be 200 characters or fewer' } },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: 'Did you keep your diet?' })).getByRole(
      'button',
      {
        name: 'Kept',
      },
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('200 characters or fewer');
  expect(
    within(group('Did you keep your diet?')).getByRole('button', { name: 'Kept' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
});

test('a failed load can be tried again', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: dayOf(null) });
  render(<ChecksCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(screen.queryByRole('region', { name: 'This week' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('group', { name: 'Did you keep your diet?' })).toBeInTheDocument();
});

test('while saving, the answers and the memo cannot change under the save', async () => {
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve(new Response(JSON.stringify(dayOf(null)))),
    ),
  );
  render(<ChecksCard date={date} />);
  const diet = await screen.findByRole('group', { name: 'Did you keep your diet?' });
  fireEvent.click(within(diet).getByRole('button', { name: 'Kept' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(within(diet).getByRole('button', { name: 'Not kept' })).toBeDisabled(),
  );
  expect(screen.getByLabelText('Note')).toHaveAttribute('readonly');
  finish(new Response(JSON.stringify({ error: 'Server error occurred' }), { status: 500 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(within(diet).getByRole('button', { name: 'Not kept' })).toBeEnabled();
  expect(screen.getByLabelText('Note')).not.toHaveAttribute('readonly');
});

test('the memo field says how long it may be', async () => {
  server({ body: dayOf(null) });
  render(<ChecksCard date={date} />);
  const memo = await screen.findByLabelText('Note');
  expect(memo).toHaveAccessibleDescription('Up to 200 characters.');
  // A maxLength would count an emoji twice and stop typing at 100 of them.
  expect(memo).not.toHaveAttribute('maxLength');
});

test('200 emoji are sent as the hint says, and one more is refused before sending', async () => {
  const memo = '🍙'.repeat(200);
  const fetchMock = server(
    { body: dayOf(null) },
    { body: dayOf({ date, dietKept: null, sleepGood: null, memo }) },
  );
  render(<ChecksCard date={date} />);
  const field = await screen.findByLabelText('Note');

  fireEvent.change(field, { target: { value: memo + '🍙' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The note must be 200 characters or fewer',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.change(field, { target: { value: memo } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(request(fetchMock, 1).body).toEqual({ dietKept: null, sleepGood: null, memo });
});

test('a save that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let failSave = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Promise((resolve) => (failSave = resolve))
        : Promise.resolve(new Response(JSON.stringify(dayOf(null)))),
    ),
  );
  const { unmount } = render(<ChecksCard date={date} />);
  fireEvent.click(
    within(await screen.findByRole('group', { name: 'Did you keep your diet?' })).getByRole(
      'button',
      {
        name: 'Kept',
      },
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  unmount();

  failSave(new Response(JSON.stringify({ error: 'Server error occurred' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      `Could not save the daily check for ${date}: Server error occurred`,
    ),
  );
});

test('pressing Enter in the memo keeps the focus there when the save fails', async () => {
  server({ body: dayOf(null) }, { status: 500, body: { error: 'Server error occurred' } });
  render(<ChecksCard date={date} />);
  const memo = await screen.findByLabelText('Note');
  fireEvent.change(memo, { target: { value: 'Note' } });
  memo.focus();
  fireEvent.submit(memo.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(memo).toHaveFocus();
});

test('coming back while a save is on its way shows the saved check, not a blank form', async () => {
  const check = { date, dietKept: null, sleepGood: null, memo: '야식 참음' };
  let saved = false;
  let finishSave = () => {};
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return new Promise<Response>((resolve) => {
        finishSave = () => {
          saved = true;
          resolve(new Response(JSON.stringify(dayOf(check))));
        };
      });
    }
    return Promise.resolve(new Response(JSON.stringify(dayOf(saved ? check : null))));
  });
  vi.stubGlobal('fetch', fetchMock);
  const first = render(<ChecksCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Note'), { target: { value: '야식 참음' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  first.unmount();
  render(<ChecksCard date={date} />);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
  finishSave();
  expect(await screen.findByText('야식 참음')).toBeInTheDocument();
  expect(screen.queryByLabelText('Note')).not.toBeInTheDocument();
});

test('a failed delete says why and keeps the check and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server(
    { body: dayOf({ date, dietKept: true, sleepGood: null, memo: '야식 참음' }) },
    { status: 500, body: { error: 'Server error occurred' } },
  );
  render(<ChecksCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('Server error occurred');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('야식 참음')).toBeInTheDocument();
  shown.mockRestore();
});

test('trying again moves focus to the card, as the button it was on goes away', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: dayOf(null) });
  render(<ChecksCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByRole('group', { name: 'Did you keep your diet?' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Daily check' }).parentElement).toHaveFocus(),
  );
});

test('a retry cannot be started twice, so no older answer can land after a newer one', async () => {
  const finishers: ((response: Response) => void)[] = [];
  const fetchMock = server({ status: 500, body: { error: 'Server error occurred' } });
  render(<ChecksCard date={date} />);
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
