import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { toast } from './components/ui/sonner';
import { SleepCard } from './sleep';

const date = '2026-03-15';
const record = {
  date,
  bedAt: '2026-03-14T14:30:00.000Z',
  wakeAt: '2026-03-14T22:00:00.000Z',
  durationMinutes: 450,
  source: 'manual',
};

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

const sentBody = (fetchMock: ReturnType<typeof server>, call: number) => {
  const init = (fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1];
  return JSON.parse(String(init.body)) as unknown;
};

const typeTimes = (bed: string, wake: string) => {
  fireEvent.change(screen.getByLabelText('Bedtime'), { target: { value: bed } });
  fireEvent.change(screen.getByLabelText('Wake-up time'), { target: { value: wake } });
};

test('a day without a record asks for times and files a night under the day of waking', async () => {
  const fetchMock = server({ body: { record: null } }, { body: record });
  render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');

  typeTimes('23:30', '07:00');
  expect(screen.getByText('Asleep at 23:30 the day before for 7 h 30 min')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
  expect(screen.getByText('Day before 23:30')).toBeInTheDocument();
  expect(screen.getByText('07:00')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1]).toEqual([
    `/api/sleep/${date}`,
    expect.objectContaining({ method: 'PUT' }),
  ]);
  expect(sentBody(fetchMock, 1)).toEqual({
    bedAt: '2026-03-14T23:30:00+09:00',
    wakeAt: '2026-03-15T07:00:00+09:00',
  });
});

test('the preview region is there before it has anything to say, so it gets announced', async () => {
  server({ body: { record: null } });
  const { container } = render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  const region = container.querySelector('form [aria-live="polite"]');
  expect(region).toBeEmptyDOMElement();
  typeTimes('23:30', '07:00');
  expect(container.querySelector('form [aria-live="polite"]')).toBe(region);
  expect(region).toHaveTextContent('Asleep at 23:30 the day before for 7 h 30 min');
});

test('saving without both times explains itself and sends nothing', async () => {
  const fetchMock = server({ body: { record: null } });
  render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a bedtime and a wake-up time');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('the server refusing the times shows its reason and keeps what was typed', async () => {
  server(
    { body: { record: null } },
    { status: 400, body: { error: 'The wake-up time must be after the bedtime' } },
  );
  render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  typeTimes('07:00', '07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The wake-up time must be after the bedtime',
  );
  expect(screen.getByLabelText('Bedtime')).toHaveValue('07:00');
  expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
});

test('editing starts from the saved times and cancel changes nothing', async () => {
  server({ body: { record } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Bedtime')).toHaveValue('23:30');
  expect(screen.getByLabelText('Wake-up time')).toHaveValue('07:00');
  typeTimes('01:00', '07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('7 h 30 min')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('Sleep').parentElement).toHaveFocus());
});

test('deleting asks first, then the form returns with focus on the card', async () => {
  const fetchMock = server({ body: { record } }, { status: 204 });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const dialog = screen.getByRole('dialog', { name: 'Delete this sleep record?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByLabelText('Bedtime')).toHaveValue('');
  expect(fetchMock.mock.calls[1]).toEqual([
    `/api/sleep/${date}`,
    expect.objectContaining({ method: 'DELETE' }),
  ]);
  await waitFor(() => expect(screen.getByText('Sleep').parentElement).toHaveFocus());
});

test('a record already gone counts as deleted', async () => {
  server({ body: { record } }, { status: 404, body: { error: 'Sleep record not found' } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(await screen.findByLabelText('Bedtime')).toBeInTheDocument();
});

test('a failed delete says why and keeps the record and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server({ body: { record } }, { status: 500, body: { error: 'Server error occurred' } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('Server error occurred');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('7 h 30 min')).toBeInTheDocument();
  shown.mockRestore();
});

test('an imported sleep says where it came from', async () => {
  server({ body: { record: { ...record, source: 'garmin' } } });
  render(<SleepCard date={date} />);
  expect(await screen.findByText('Garmin')).toBeInTheDocument();
});

test('a failed load offers another try, with no form to overwrite an unseen record', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: { record } });
  render(<SleepCard date={date} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(screen.queryByLabelText('Bedtime')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('pressing edit moves focus to the card instead of losing it', async () => {
  server({ body: { record } });
  render(<SleepCard date={date} />);
  const edit = await screen.findByRole('button', { name: 'Edit' });
  edit.focus();
  fireEvent.click(edit);
  await waitFor(() => expect(screen.getByText('Sleep').parentElement).toHaveFocus());
});

test('saving unchanged times sends nothing, so an imported record stays as it is', async () => {
  const fetchMock = server({ body: { record: { ...record, source: 'garmin' } } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(screen.getByText(/erases the sleep stages and score/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Garmin')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a directly entered record has no such warning', async () => {
  server({ body: { record } });
  render(<SleepCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(screen.queryByText(/erases the sleep stages and score/)).not.toBeInTheDocument();
});

test('a save in flight cannot be sent twice', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ record: null })))
    .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  vi.stubGlobal('fetch', fetchMock);
  render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  typeTimes('23:30', '07:00');
  const save = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(save);
  await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
  expect(screen.getByRole('status', { name: 'Saving' })).toBeInTheDocument();
  fireEvent.click(save);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  finish(new Response(JSON.stringify(record)));
  expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
});

test('a save that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let finish = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ record: null })))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))),
  );
  const { unmount } = render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  typeTimes('23:30', '07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  unmount();
  finish(new Response(JSON.stringify({ error: 'Server error occurred' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      'Could not save the sleep record for 2026-03-15: Server error occurred',
    ),
  );
  shown.mockRestore();
});

test('coming back while a save is on its way shows the saved night, not a blank form', async () => {
  let saved = false;
  let finishSave = () => {};
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return new Promise<Response>((resolve) => {
        finishSave = () => {
          saved = true;
          resolve(new Response(JSON.stringify(record)));
        };
      });
    }
    return Promise.resolve(new Response(JSON.stringify({ record: saved ? record : null })));
  });
  vi.stubGlobal('fetch', fetchMock);
  const first = render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  typeTimes('23:30', '07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  first.unmount();
  render(<SleepCard date={date} />);

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText('Bedtime')).not.toBeInTheDocument();
  finishSave();
  expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
  expect(screen.queryByLabelText('Bedtime')).not.toBeInTheDocument();
});

test('leaving again while waiting for a save sends no read for the day left', async () => {
  let finishSave = () => {};
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return new Promise<Response>((resolve) => {
        finishSave = () => resolve(new Response(JSON.stringify(record)));
      });
    }
    return Promise.resolve(new Response(JSON.stringify({ record: null })));
  });
  vi.stubGlobal('fetch', fetchMock);
  const first = render(<SleepCard date={date} />);
  await screen.findByLabelText('Bedtime');
  typeTimes('23:30', '07:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  first.unmount();
  render(<SleepCard date={date} />).unmount();

  finishSave();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('trying again moves focus to the card, as the button it was on goes away', async () => {
  server({ status: 500, body: { error: 'Server error occurred' } }, { body: { record } });
  render(<SleepCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Sleep' }).parentElement).toHaveFocus(),
  );
});

test('a retry cannot be started twice, so no older answer can land after a newer one', async () => {
  const finishers: ((response: Response) => void)[] = [];
  const fetchMock = server({ status: 500, body: { error: 'Server error occurred' } });
  render(<SleepCard date={date} />);
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
