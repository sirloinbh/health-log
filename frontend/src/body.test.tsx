import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { BodyCard } from './body';
import { toast } from './components/ui/sonner';
import { answered } from './test/answered';
import { findLive, queryLive } from './test/live';
import { renderWithQuery } from './test/query';

const date = '2026-03-15';
const record = {
  date,
  weightKg: 70.5,
  bodyFatPercent: null,
  waistCm: null,
  systolicMmhg: 120,
  diastolicMmhg: 80,
  memo: 'Fasting',
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
  renderWithQuery(<BodyCard date={date} />);

  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(screen.queryByText('Blood pressure')).not.toBeInTheDocument();
  expect(screen.queryByText('Note')).not.toBeInTheDocument();
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
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  const row = await screen.findByRole('row', { name: /Weight.*−1\.5kg/ });
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['−1.5kg3/10~3/15', '−1.5kg3/10~3/15', '−1.5kg3/10~3/15']);
});

test('the trend asks for the 90 days ending on the day shown', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  renderWithQuery(<BodyCard date={date} />);
  await screen.findByLabelText('Weight (kg)');
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
  renderWithQuery(<BodyCard date={date} />);
  const row = await screen.findByRole('row', { name: /Weight/ });
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['−0.5kg3/14~3/15', '−0.5kg3/14~3/15', '−4.5kg1/10~3/15']);
  expect(screen.queryByRole('row', { name: /Waist/ })).not.toBeInTheDocument();
});

test('a window with one measurement says there is not enough', async () => {
  server({
    recordReplies: [{ body: { record } }],
    history: [{ body: { records: [{ ...record, date: '2026-01-10', weightKg: 75 }, record] } }],
  });
  renderWithQuery(<BodyCard date={date} />);
  const row = await screen.findByRole('row', { name: /Weight/ });
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['Not enough records', 'Not enough records', '−4.5kg1/10~3/15']);
});

test('a trend that fails to load leaves today usable and can be retried', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 72 };
  server({
    recordReplies: [{ body: { record: null } }],
    history: [
      { status: 500, body: { error: 'Server error occurred' } },
      { body: { records: [earlier, record] } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  expect(await screen.findByLabelText('Weight (kg)')).toBeEnabled();
  expect(await findLive('alert')).toHaveTextContent('Could not load the changes over time');

  fireEvent.click(screen.getByRole('button', { name: 'Reload changes' }));
  expect(await screen.findByRole('row', { name: /Weight/ })).toBeInTheDocument();
  expect(queryLive('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload changes' })).not.toBeInTheDocument();
});

test('numbers from before a failed reload do not stay on screen', async () => {
  const earlier = { ...record, date: '2026-03-10', weightKg: 75 };
  const saved = { ...record, weightKg: 60 };
  server({
    recordReplies: [{ body: { record } }, { body: saved }],
    history: [
      { body: { records: [earlier, record] } },
      { status: 500, body: { error: 'Server error occurred' } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  await screen.findByRole('row', { name: /Weight.*−4\.5kg/ });

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await findLive('alert')).toHaveTextContent('Could not load the changes over time');
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
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reload changes' }));

  const retry = await screen.findByRole('button', { name: /Reload changes/ });
  expect(retry).toBeDisabled();
  expect(retry).toHaveAttribute('aria-busy', 'true');
  expect(queryLive('alert')).not.toBeInTheDocument();
  fireEvent.click(retry);
  expect(historyCalls).toBe(2);

  finishRetry(new Response(JSON.stringify({ error: 'x' }), { status: 500 }));
  expect(await findLive('alert')).toHaveTextContent('Could not load the changes over time');
  expect(screen.getByRole('button', { name: 'Reload changes' })).toBeEnabled();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Body' }).parentElement,
    ),
  );
});

test('a value too long to read is refused and the stored value stays', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record } }] });
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '9'.repeat(400) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await findLive('alert')).toHaveTextContent('enter digits only');
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
      { status: 500, body: { error: 'Server error occurred' } },
      { body: { record } },
    ],
    history: [
      { status: 500, body: { error: 'Server error occurred' } },
      { body: { records: [earlier, record] } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  await screen.findByText('Could not load the changes over time');
  await screen.findByText('Server error occurred');
  expect(screen.queryByRole('button', { name: 'Reload changes' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(await screen.findByRole('row', { name: /Weight/ })).toBeInTheDocument();
  expect(queryLive('alert')).not.toBeInTheDocument();
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
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('row', { name: /Weight.*−1\.5kg/ });

  const late = new Response(JSON.stringify({ records: [earlier] }));
  finishFirst(late);
  await answered(late);
  expect(screen.getByRole('row', { name: /Weight.*−1\.5kg/ })).toBeInTheDocument();
});

test('a save that fails after leaving the day still says so', async () => {
  const shown = vi.spyOn(toast, 'error');
  let failSave = (_response: Response) => {};
  let saveSent = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        saveSent = true;
        return new Promise((resolve) => (failSave = resolve));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(url.startsWith('/api/body?') ? { records: [] } : { record: null }),
        ),
      );
    }),
  );
  const { unmount } = renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  unmount();
  // React Query sends the save a moment after the click.
  await waitFor(() => expect(saveSent).toBe(true));

  failSave(new Response(JSON.stringify({ error: 'Server error occurred' }), { status: 500 }));
  await waitFor(() =>
    expect(shown).toHaveBeenCalledWith(
      `Could not save the body record for ${date}: Server error occurred`,
    ),
  );
});

test('a failed load hides the form so an unseen record cannot be overwritten', async () => {
  server({
    recordReplies: [
      { status: 500, body: { error: 'Server error occurred' } },
      { body: { record } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  await screen.findByText('Server error occurred');
  expect(screen.queryByLabelText('Weight (kg)')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
});

test('a server rejection keeps the form and the typed values', async () => {
  server({
    recordReplies: [
      { body: { record: null } },
      { status: 400, body: { error: 'The request body is not valid' } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Systolic blood pressure (mmHg)'), {
    target: { value: '120' },
  });
  fireEvent.change(screen.getByLabelText('Diastolic blood pressure (mmHg)'), {
    target: { value: '80' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await findLive('alert')).toHaveTextContent('The request body is not valid');
  expect(screen.getByLabelText('Systolic blood pressure (mmHg)')).toHaveValue('120');
  expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
});

// #205: what the server would refuse is refused before sending, with the server's own words.
const systolic = 'Systolic blood pressure (mmHg)';
const diastolic = 'Diastolic blood pressure (mmHg)';
test.each([
  {
    name: 'three decimals',
    values: { 'Weight (kg)': '70.555' },
    message: 'Weight can have at most 2 decimal places',
  },
  { name: 'zero weight', values: { 'Weight (kg)': '0' }, message: 'Weight must be greater than 0' },
  {
    name: 'body fat over 100',
    values: { 'Body fat (%)': '100.5' },
    message: 'Body fat must be 100 or less',
  },
  { name: 'waist over 300', values: { 'Waist (cm)': '301' }, message: 'Waist must be 300 or less' },
  {
    name: 'fractional blood pressure',
    values: { [systolic]: '120.5', [diastolic]: '80' },
    message: 'Systolic blood pressure must be a whole number',
  },
  {
    name: 'diastolic below 20',
    values: { [systolic]: '120', [diastolic]: '19' },
    message: 'Diastolic blood pressure must be 20 or more',
  },
  {
    name: 'systolic alone',
    values: { [systolic]: '120' },
    message: 'Enter both systolic and diastolic blood pressure',
  },
  {
    name: 'diastolic alone',
    values: { [diastolic]: '80' },
    message: 'Enter both systolic and diastolic blood pressure',
  },
  {
    name: 'systolic not above diastolic',
    values: { [systolic]: '80', [diastolic]: '80' },
    message: 'Systolic blood pressure must be higher than diastolic',
  },
  {
    name: 'nothing but spaces',
    values: { Note: '   ' },
    message: 'Enter at least one value to save',
  },
  {
    name: 'a 501-character note',
    values: { Note: '가'.repeat(501) },
    message: 'The note must be 500 characters or fewer',
  },
])('$name is refused before anything is sent', async ({ values, message }) => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  renderWithQuery(<BodyCard date={date} />);
  await screen.findByLabelText('Weight (kg)');
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await findLive('alert')).toHaveTextContent(message);
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'PUT',
    ),
  ).toBe(false);
});

test('values at the edges the server takes are sent', async () => {
  const saved = {
    ...record,
    weightKg: 500,
    bodyFatPercent: 0.01,
    systolicMmhg: 300,
    diastolicMmhg: 200,
    memo: '가'.repeat(500),
  };
  const fetchMock = server({ recordReplies: [{ body: { record: null } }, { body: saved }] });
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText('Body fat (%)'), { target: { value: '0.01' } });
  fireEvent.change(screen.getByLabelText('Systolic blood pressure (mmHg)'), {
    target: { value: '300' },
  });
  fireEvent.change(screen.getByLabelText('Diastolic blood pressure (mmHg)'), {
    target: { value: '200' },
  });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: '가'.repeat(500) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('300/200mmHg')).toBeInTheDocument();
  expect(sent(fetchMock, 'PUT').body).toEqual({
    weightKg: 500,
    bodyFatPercent: 0.01,
    waistCm: null,
    systolicMmhg: 300,
    diastolicMmhg: 200,
    memo: '가'.repeat(500),
  });
});

test('a saved row with only one blood pressure value shows no blood pressure', async () => {
  server({ recordReplies: [{ body: { record: { ...record, diastolicMmhg: null } } }] });
  renderWithQuery(<BodyCard date={date} />);
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  expect(screen.queryByText('Blood pressure')).not.toBeInTheDocument();
  expect(screen.queryByText(/null/)).not.toBeInTheDocument();
});

test('a comma decimal is refused, never read as ten times the value', async () => {
  const fetchMock = server({ recordReplies: [{ body: { record: null } }] });
  renderWithQuery(<BodyCard date={date} />);
  const weight = await screen.findByLabelText('Weight (kg)');
  fireEvent.change(weight, { target: { value: '49,5' } });
  expect(weight).toHaveValue('49,5');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await findLive('alert')).toHaveTextContent(
    'Weight (kg): enter digits only. Use a period for the decimal point',
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
  renderWithQuery(<BodyCard date={date} />);
  expect(await screen.findByText('120/80mmHg')).toBeInTheDocument();
  expect(screen.getByText('Fasting')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const weight = screen.getByLabelText('Weight (kg)');
  expect(weight).toHaveValue('70.5');
  expect(screen.getByLabelText('Body fat (%)')).toHaveValue('');
  expect(screen.getByLabelText('Note')).toHaveValue('Fasting');
  fireEvent.change(weight, { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

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
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete this body record?' });
  expect(
    fetchMock.mock.calls.some(
      (args) => (args as unknown as [string, RequestInit])[1]?.method === 'DELETE',
    ),
  ).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByLabelText('Weight (kg)')).toHaveValue('');
  expect(success).toHaveBeenCalledWith('Deleted');
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
      { status: 404, body: { error: 'Body record not found' } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete this body record?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(await screen.findByLabelText('Weight (kg)')).toBeInTheDocument();
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

  const first = renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  first.unmount();
  renderWithQuery(<BodyCard date={date} />);

  // No form while the save is out: the server would still answer with the empty day.
  expect(screen.getByRole('status', { name: 'Loading body records' })).toBeInTheDocument();
  expect(reads()).toBe(1);
  expect(screen.queryByLabelText('Weight (kg)')).not.toBeInTheDocument();

  finishSave();
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  // The save's own answer is the record, so the day is not read again (#220).
  expect(reads()).toBe(1);
  expect(screen.queryByLabelText('Weight (kg)')).not.toBeInTheDocument();
  expect(await screen.findByRole('row', { name: /Weight/ })).toBeInTheDocument();
});

test('a failed delete says why and keeps the record and the dialog', async () => {
  const shown = vi.spyOn(toast, 'error');
  server({
    recordReplies: [
      { body: { record } },
      { status: 500, body: { error: 'Server error occurred' } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' });
  fireEvent.click(confirm);
  await waitFor(() => expect(confirm).toBeEnabled());
  expect(shown).toHaveBeenCalledWith('Server error occurred');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('70.5kg')).toBeInTheDocument();
  shown.mockRestore();
});

test('pressing edit moves focus to the card instead of losing it', async () => {
  server({ recordReplies: [{ body: { record } }] });
  renderWithQuery(<BodyCard date={date} />);
  const edit = await screen.findByRole('button', { name: 'Edit' });
  edit.focus();
  fireEvent.click(edit);
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Body' }).parentElement).toHaveFocus(),
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
  renderWithQuery(<BodyCard date={date} />);
  fireEvent.change(await screen.findByLabelText('Weight (kg)'), { target: { value: '70.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('row', { name: /Weight.*−1\.5kg/ });

  const late = new Response(JSON.stringify({ error: 'Server error occurred' }), { status: 500 });
  failFirst(late);
  await answered(late);
  expect(screen.queryByText('Could not load the changes over time')).not.toBeInTheDocument();
  expect(screen.getByRole('row', { name: /Weight.*−1\.5kg/ })).toBeInTheDocument();
});

test('trying again moves focus to the card, as the button it was on goes away', async () => {
  server({
    recordReplies: [
      { status: 500, body: { error: 'Server error occurred' } },
      { body: { record } },
    ],
  });
  renderWithQuery(<BodyCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByText('70.5kg')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Body' }).parentElement).toHaveFocus(),
  );
});

test('a retry cannot be started twice, so no older answer can land after a newer one', async () => {
  const finishers: ((response: Response) => void)[] = [];
  const fetchMock = server({
    recordReplies: [{ status: 500, body: { error: 'Server error occurred' } }],
  });
  renderWithQuery(<BodyCard date={date} />);
  const again = await screen.findByRole('button', { name: 'Try again' });
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => finishers.push(resolve)));
  const before = fetchMock.mock.calls.length;
  fireEvent.click(again);
  fireEvent.click(again);
  // The button goes with the first press; the second reaches nothing. (The body card also
  // reloads its trend, hence two requests there.)
  await waitFor(() => expect(again).not.toBeInTheDocument());
  expect(fetchMock.mock.calls.length - before).toBe(2);
  for (const finish of finishers) {
    finish(new Response(JSON.stringify({ error: 'x' }), { status: 500 }));
  }
  // Settles before the test ends, so nothing updates the card afterwards.
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
