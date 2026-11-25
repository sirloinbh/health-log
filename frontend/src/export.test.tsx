import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';
import { ExportCard } from './export';
import { testQueryClient } from './test/query';

afterEach(() => {
  vi.restoreAllMocks();
});

// The device's clock decides the starting range, so it is fixed (the setup puts it back).
const clockAt = (instant: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
};

/** Records the files handed to the browser, and answers every export request with `answer`. */
const setup = (answer: () => Response | Promise<Response>) => {
  const downloads: string[] = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:made', revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  const fetchMock = vi.fn((url: string) =>
    url.startsWith('/api/export') ? Promise.resolve(answer()) : Promise.resolve(new Response('{}')),
  );
  vi.stubGlobal('fetch', fetchMock);
  const urls = () =>
    fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/export'));
  return { downloads, urls };
};

const fileResponse = (name: string) =>
  new Response('date\r\n', { headers: { 'content-disposition': `attachment; filename=${name}` } });

test('it starts with the last 30 days and lists every kind with its own button', () => {
  clockAt('2026-03-31T03:00:00Z');
  setup(() => fileResponse('x.csv'));
  render(<ExportCard />);
  expect(screen.getByLabelText('From')).toHaveValue('2026-03-02');
  expect(screen.getByLabelText('To')).toHaveValue('2026-03-31');
  const buttons = screen.getAllByRole('button', { name: /^Download .* as CSV$/ });
  expect(buttons).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Download Lab results as CSV' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download everything (zip)' })).toBeInTheDocument();
});

test('one kind is asked for with the chosen dates and then downloaded', async () => {
  clockAt('2026-03-31T03:00:00Z');
  const success = vi.spyOn(toast, 'success').mockImplementation(() => '');
  const { downloads, urls } = setup(() => fileResponse('health-log-meals-a_b.csv'));
  render(<ExportCard />);
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-02-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download Meals as CSV' }));
  await waitFor(() => expect(downloads).toEqual(['health-log-meals-a_b.csv']));
  expect(urls()).toEqual(['/api/export?kind=meals&from=2026-01-01&to=2026-02-15']);
  expect(success).toHaveBeenCalledWith('Downloaded health-log-meals-a_b.csv');
});

test('everything comes as a zip', async () => {
  clockAt('2026-03-31T03:00:00Z');
  const { downloads, urls } = setup(() => fileResponse('health-log-all-a_b.zip'));
  render(<ExportCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Download everything (zip)' }));
  await waitFor(() => expect(downloads).toEqual(['health-log-all-a_b.zip']));
  expect(urls()).toEqual(['/api/export?kind=all&from=2026-03-02&to=2026-03-31']);
});

test('dates that cannot be sent are explained and nothing is requested', () => {
  clockAt('2026-03-31T03:00:00Z');
  const { urls } = setup(() => fileResponse('x.csv'));
  render(<ExportCard />);
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download Sleep as CSV' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The start date cannot be after the end date',
  );
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download Sleep as CSV' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a start date');
  expect(urls()).toEqual([]);
});

test('a refusal shows its reason on the page and a later try can succeed', async () => {
  clockAt('2026-03-31T03:00:00Z');
  let calls = 0;
  const { downloads } = setup(() =>
    ++calls === 1
      ? new Response(JSON.stringify({ error: 'Could not read the records' }), { status: 400 })
      : fileResponse('ok.csv'),
  );
  render(<ExportCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Download Body as CSV' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the records');
  expect(downloads).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Download Body as CSV' }));
  await waitFor(() => expect(downloads).toEqual(['ok.csv']));
  // The live region stays in the page; only its text goes.
  await waitFor(() => expect(screen.getByRole('alert')).toBeEmptyDOMElement());
});

test('while a file is being made another press does nothing', async () => {
  clockAt('2026-03-31T03:00:00Z');
  let release: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const { downloads, urls } = setup(() => pending);
  render(<ExportCard />);
  const meals = screen.getByRole('button', { name: 'Download Meals as CSV' });
  fireEvent.click(meals);
  await waitFor(() => expect(meals).toHaveAttribute('aria-busy', 'true'));
  expect(meals).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(meals);
  fireEvent.click(screen.getByRole('button', { name: 'Download Sleep as CSV' }));
  expect(urls()).toHaveLength(1);
  release(fileResponse('done.csv'));
  await waitFor(() => expect(downloads).toEqual(['done.csv']));
  await waitFor(() => expect(meals).not.toHaveAttribute('aria-disabled'));
});

test('the settings page has the download card', async () => {
  setup(() => fileResponse('x.csv'));
  window.history.replaceState(null, '', '/settings');
  render(<App queryClient={testQueryClient({ today: '2026-03-15' })} />);
  expect(
    await screen.findByRole('heading', { level: 2, name: 'Download my records' }),
  ).toBeInTheDocument();
});
