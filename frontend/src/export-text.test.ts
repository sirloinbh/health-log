import { afterEach, expect, test, vi } from 'vitest';

import { downloadExport, exportKinds, exportUrl, fileNameOf, rangeProblem } from './export-text';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('the kinds match what the API offers, each once, in the order shown', () => {
  expect(exportKinds.map((kind) => kind.key)).toEqual([
    'meals',
    'sleep',
    'body',
    'habits',
    'checks',
    'intake',
    'visits',
    'procedures',
    'medications',
    'labs',
  ]);
});

test('two dates in order are fine, anything else says what is wrong', () => {
  expect(rangeProblem('2026-03-01', '2026-03-31')).toBeNull();
  expect(rangeProblem('2026-03-01', '2026-03-01')).toBeNull();
  expect(rangeProblem('', '2026-03-31')).toBe('Choose a start date');
  expect(rangeProblem('2026-03-01', '')).toBe('Choose an end date');
  expect(rangeProblem('2026-02-30', '2026-03-31')).toBe('Choose a start date');
  expect(rangeProblem('1999-12-31', '2026-03-31')).toMatch(/^Start date: /);
  expect(rangeProblem('2026-03-01', '2100-01-01')).toMatch(/^End date: /);
  expect(rangeProblem('2026-03-31', '2026-03-01')).toBe(
    'The start date cannot be after the end date',
  );
});

test('the address carries the kind and both dates', () => {
  expect(exportUrl('meals', '2026-03-01', '2026-03-31')).toBe(
    '/api/export?kind=meals&from=2026-03-01&to=2026-03-31',
  );
});

test('the file name comes from the server, with or without quotes, else a fallback', () => {
  expect(fileNameOf('attachment; filename=a_b.csv', 'x.csv')).toBe('a_b.csv');
  expect(fileNameOf('attachment; filename="a b.csv"', 'x.csv')).toBe('a b.csv');
  expect(fileNameOf(null, 'x.csv')).toBe('x.csv');
  expect(fileNameOf('attachment', 'x.csv')).toBe('x.csv');
});

/** Stubs the parts of the browser a download uses and records the link that was clicked. */
const browser = () => {
  const clicked: { href: string; download: string }[] = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:made', revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
  return clicked;
};

test('a file is handed to the browser under the name the server gave', async () => {
  const clicked = browser();
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response('date\r\n', {
        headers: { 'content-disposition': 'attachment; filename=health-log-body-a_b.csv' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const name = await downloadExport('body', '2026-03-01', '2026-03-31');
  expect(name).toBe('health-log-body-a_b.csv');
  expect(fetchMock).toHaveBeenCalledWith('/api/export?kind=body&from=2026-03-01&to=2026-03-31', {
    credentials: 'same-origin',
  });
  expect(clicked).toEqual([{ href: 'blob:made', download: 'health-log-body-a_b.csv' }]);
  expect(document.querySelector('a[download]')).toBeNull();
});

test('without a name from the server the zip and CSV names are made from the choice', async () => {
  const clicked = browser();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('x'))),
  );
  await downloadExport('all', '2026-03-01', '2026-03-31');
  await downloadExport('labs', '2026-03-01', '2026-03-31');
  expect(clicked.map((link) => link.download)).toEqual([
    'health-log-all-2026-03-01_2026-03-31.zip',
    'health-log-labs-2026-03-01_2026-03-31.csv',
  ]);
});

test('a refusal is explained and nothing is downloaded', async () => {
  const clicked = browser();
  const answerWith = (response: Response) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response)),
    );

  answerWith(new Response(null, { status: 401 }));
  await expect(downloadExport('meals', '2026-03-01', '2026-03-31')).rejects.toThrow(
    'Your sign-in has ended. Reload the page and sign in again.',
  );
  answerWith(
    new Response(JSON.stringify({ error: 'The start date is not valid' }), { status: 400 }),
  );
  await expect(downloadExport('meals', '2026-03-01', '2026-03-31')).rejects.toThrow(
    'The start date is not valid',
  );
  answerWith(new Response('<html>', { status: 502 }));
  await expect(downloadExport('meals', '2026-03-01', '2026-03-31')).rejects.toThrow(
    'Could not make the file',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('failed'))),
  );
  await expect(downloadExport('meals', '2026-03-01', '2026-03-31')).rejects.toThrow(
    'Cannot reach the server',
  );
  expect(clicked).toEqual([]);
});
