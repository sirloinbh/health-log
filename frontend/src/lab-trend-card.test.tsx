import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import type { TrendPoint } from './lab-trend';
import { testQueryClient } from './test/query';

// Made-up values only.
const point = (id: number, date: string, value: number, overrides: Partial<TrendPoint> = {}) => ({
  id,
  date,
  value,
  unit: 'mg/dL',
  refLow: 0,
  refHigh: 200,
  ...overrides,
});

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

type Names = { name: string; count: number; latest: string }[];

const serve = (names: Names, trends: Record<string, TrendPoint[]>) => {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/labs/names')) return Promise.resolve(json({ names }));
    if (url.startsWith('/api/labs/trend')) {
      const name = new URL(url, 'http://x').searchParams.get('name') ?? '';
      return Promise.resolve(json({ name, points: trends[name] ?? [] }));
    }
    if (url.startsWith('/api/labs')) return Promise.resolve(json({ results: [], more: false }));
    if (url.startsWith('/api/visits')) return Promise.resolve(json({ visits: [], more: false }));
    return Promise.resolve(json({ today: '2026-03-15' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = () => {
  window.history.replaceState(null, '', '/labs');
  render(<App queryClient={testQueryClient({ today: '2026-03-15' })} />);
};

const choose = async (name: string) => {
  const select = await screen.findByLabelText('Test');
  await within(select).findByRole('option', { name: new RegExp(name) });
  fireEvent.change(select, { target: { value: name } });
};

test('without any result the card says what to do instead of showing a selector', async () => {
  serve([], {});
  open();
  expect(
    await screen.findByText('Record a result to see how a test changes over time.'),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Test')).not.toBeInTheDocument();
});

test('a chosen test shows its values oldest first with the change, the range and a chart', async () => {
  const fetchMock = serve([{ name: '가상콜레스테롤', count: 3, latest: '2026-03-01' }], {
    가상콜레스테롤: [
      point(1, '2022-03-01', 180),
      point(2, '2024-03-01', 190.5),
      point(3, '2026-03-01', 210),
    ],
  });
  open();
  await choose('가상콜레스테롤');

  const table = await screen.findByRole('table', { name: /가상콜레스테롤/ });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((row) => row.textContent)).toEqual([
    '2022-03-01180 mg/dL—In range',
    '2024-03-01190.5 mg/dL+10.5 mg/dLIn range',
    '2026-03-01210 mg/dL+19.5 mg/dLAbove range',
  ]);
  expect(
    screen.getByRole('img', {
      name: '가상콜레스테롤: 3 results from 2022-03-01 to 2026-03-01, latest 210 mg/dL',
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Reference 0 - 200 mg\/dL/)).toBeInTheDocument();
  expect(screen.queryByText(/Only one result/)).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
    '/api/labs/trend?name=%EA%B0%80%EC%83%81%EC%BD%9C%EB%A0%88%EC%8A%A4%ED%85%8C%EB%A1%A4',
  );
});

test('one result says there is no trend yet', async () => {
  serve([{ name: '가상혈당', count: 1, latest: '2026-03-01' }], {
    가상혈당: [point(1, '2026-03-01', 90, { refLow: null, refHigh: null })],
  });
  open();
  await choose('가상혈당');
  expect(
    await screen.findByText('Only one result so far, so there is no trend yet.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/shaded band/)).not.toBeInTheDocument();
});

test('a test recorded with different units warns and compares only like with like', async () => {
  serve([{ name: '가상혈당', count: 3, latest: '2026-03-01' }], {
    가상혈당: [
      point(1, '2024-03-01', 90),
      point(2, '2025-03-01', 5, { unit: 'mmol/L' }),
      point(3, '2026-03-01', 6, { unit: 'mmol/L' }),
    ],
  });
  open();
  await choose('가상혈당');
  expect(await screen.findByRole('note')).toHaveTextContent('different units (mg/dL, mmol/L)');
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual([
    '—',
    '—',
    '+1 mmol/L',
  ]);
});

test('a failed trend read shows its reason', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith('/api/labs/names')
          ? json({ names: [{ name: '가상혈당', count: 1, latest: '2026-03-01' }] })
          : url.startsWith('/api/labs/trend')
            ? json({ error: 'The trend could not be read' }, 400)
            : url.startsWith('/api/labs')
              ? json({ results: [], more: false })
              : url.startsWith('/api/visits')
                ? json({ visits: [], more: false })
                : json({ today: '2026-03-15' }),
      ),
    ),
  );
  open();
  await choose('가상혈당');
  expect(await screen.findByText('The trend could not be read')).toBeInTheDocument();
});
