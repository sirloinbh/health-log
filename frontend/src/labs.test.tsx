import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import type { LabResult } from './lab-text';
import { testQueryClient } from './test/query';
import type { Visit } from './visit-text';

// Made-up values only: no real result belongs in tests.
const high: LabResult = {
  id: 3,
  date: '2026-03-10',
  name: '가상콜레스테롤',
  value: 230,
  unit: 'mg/dL',
  refLow: 0,
  refHigh: 200,
  note: '가상 메모',
  visit: { id: 7, date: '2026-03-10', clinic: '가상내과' },
};
const plain: LabResult = {
  ...high,
  id: 4,
  name: '가상혈당',
  value: 90,
  unit: null,
  refLow: null,
  refHigh: null,
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

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

const serve = (labs: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/labs')
        ? labs(url, init)
        : url.startsWith('/api/visits')
          ? json({ visits: [visit], more: false })
          : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

// A new result starts on this device's today in Asia/Seoul; the clock is fixed for that.
const clockAt = (instant: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
};

const open = () => {
  window.history.replaceState(null, '', '/labs');
  render(<App queryClient={testQueryClient({ today: '2026-03-15' })} />);
};

const labCalls = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/labs'));
const writes = (fetchMock: ReturnType<typeof serve>) =>
  labCalls(fetchMock).filter(([, init]) => (init?.method ?? 'GET') !== 'GET');
const sentBody = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as unknown;

const dialog = () => screen.getByRole('dialog');
const fill = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

test('the main menu opens the page and each result shows its value, range and status', async () => {
  serve(() => json({ results: [high, plain], more: false }));
  window.history.replaceState(null, '', '/');
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Lab results' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Lab results' })).toBeInTheDocument();

  const first = (await screen.findByRole('heading', { name: '가상콜레스테롤' })).closest(
    '[data-slot="card"]',
  ) as HTMLElement;
  expect(within(first).getByText('230 mg/dL')).toBeInTheDocument();
  expect(within(first).getByText('Above range')).toBeInTheDocument();
  expect(within(first).getByText('Reference 0 - 200 mg/dL')).toBeInTheDocument();
  expect(within(first).getByText('2026-03-10 가상내과')).toBeInTheDocument();
  const second = screen
    .getByRole('heading', { name: '가상혈당' })
    .closest('[data-slot="card"]') as HTMLElement;
  expect(within(second).getByText('90')).toBeInTheDocument();
  expect(within(second).queryByText(/Reference/)).not.toBeInTheDocument();
});

test('an empty list says so, and a search with no match says that instead', async () => {
  serve(() => json({ results: [], more: false }));
  open();
  expect(await screen.findByText('No test results recorded yet.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search by test name'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('No test result matches this search.')).toBeInTheDocument();
});

test('a new result is sent as typed with the visit link', async () => {
  clockAt('2026-03-15T03:00:00Z');
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(high, 201) : json({ results: [], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add test result' }));
  expect(within(dialog()).getByLabelText('Test date')).toHaveValue('2026-03-15');
  fill('Test name', '가상콜레스테롤');
  fill('Result', '230.5');
  fill('Unit', 'mg/dL');
  fill('Reference maximum', '200');
  await within(dialog()).findByRole('option', { name: '2026-03-10 가상내과' });
  fill('Clinic visit', '7');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/labs');
  expect(sentBody(post)).toEqual({
    date: '2026-03-15',
    name: '가상콜레스테롤',
    value: 230.5,
    unit: 'mg/dL',
    refLow: null,
    refHigh: 200,
    note: '',
    visitId: 7,
  });
});

test('invalid input is explained and never sent', async () => {
  const fetchMock = serve(() => json({ results: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add test result' }));
  const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  save();
  expect(await within(dialog()).findByText('Enter the test name')).toBeInTheDocument();
  fill('Test name', '가상혈당');
  save();
  expect(await within(dialog()).findByText('Enter the result')).toBeInTheDocument();
  fill('Result', '-3');
  save();
  expect(await within(dialog()).findByText(/Result: enter digits only/)).toBeInTheDocument();
  fill('Result', '90');
  fill('Reference minimum', '120');
  fill('Reference maximum', '100');
  save();
  expect(
    await within(dialog()).findByText('The reference minimum cannot be above the maximum'),
  ).toBeInTheDocument();
  fill('Reference minimum', '1,5');
  save();
  expect(await within(dialog()).findByText(/Reference minimum: enter digits/)).toBeInTheDocument();
  fill('Reference minimum', '');
  fill('Reference maximum', '');
  fill('Test date', '');
  save();
  expect(await within(dialog()).findByText('Choose a test date')).toBeInTheDocument();
  expect(writes(fetchMock)).toHaveLength(0);
});

test('editing sends a PUT with the changed value', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(high) : json({ results: [high], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 가상콜레스테롤 2026-03-10' }));
  expect(within(dialog()).getByLabelText('Result')).toHaveValue('230');
  fill('Result', '210');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/labs/3');
  expect(sentBody(put)).toMatchObject({ value: 210, visitId: 7, refHigh: 200 });
});

test('deleting asks first, then removes the result', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'DELETE' ? json(null, 204) : json({ results: [high], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 가상콜레스테롤 2026-03-10' }));
  expect(writes(fetchMock)).toHaveLength(0);
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Delete this test result?' })).getByRole('button', {
      name: 'Delete',
    }),
  );
  await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  expect(writes(fetchMock)[0][0]).toBe('/api/labs/3');
});

test('more results load after the ones shown', async () => {
  const fetchMock = serve((url) =>
    url.includes('offset=1')
      ? json({ results: [plain], more: false })
      : json({ results: [high], more: true }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
  expect(await screen.findByRole('heading', { name: '가상혈당' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '가상콜레스테롤' })).toBeInTheDocument();
  expect(labCalls(fetchMock).map(([url]) => url)).toContain('/api/labs?q=&offset=1');
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
});

test('a failed read shows the reason and can be tried again', async () => {
  let calls = 0;
  // Only the list read fails first; the trend card reads its own paths.
  serve((url) =>
    url.startsWith('/api/labs?') && ++calls === 1
      ? json({ error: 'The database is not ready' }, 400)
      : json({ results: [plain], more: false }),
  );
  open();
  expect(await screen.findByText('The database is not ready')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: '가상혈당' })).toBeInTheDocument();
});
