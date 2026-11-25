import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { toast } from './components/ui/sonner';
import { IntakeCard } from './intake';
import type { IntakeDay, IntakeKind } from './intake-text';
import { renderWithQuery } from './test/query';

const date = '2026-11-04';
const dayOf = (counts: Partial<Record<IntakeKind, number>>): IntakeDay => {
  const mg = { water: 250, coffee: 95, tea: 40, energy: 80, other_caffeine: 50 };
  const kinds = Object.fromEntries(
    Object.entries(mg).map(([kind, each]) => {
      const count = counts[kind as IntakeKind] ?? 0;
      return [kind, { count, amount: count * each }];
    }),
  ) as IntakeDay['kinds'];
  return {
    date,
    kinds,
    waterMl: kinds.water.amount,
    caffeineMg:
      kinds.coffee.amount + kinds.tea.amount + kinds.energy.amount + kinds.other_caffeine.amount,
  };
};

type Reply = { status?: number; body?: unknown };
const server = (...replies: Reply[]) => {
  const fetchMock = vi.fn(() => {
    const { status = 200, body } = replies.shift() ?? {};
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const call = (fetchMock: ReturnType<typeof server>, index: number) => {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

test('shows the counts and totals of the day, minus is off at 0', async () => {
  server({ body: dayOf({ water: 2, coffee: 1 }) });
  renderWithQuery(<IntakeCard date={date} />);
  expect(await screen.findByText('Water 500 ml · Caffeine 95 mg')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove one water' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Remove one tea' })).toBeDisabled();
});

test('plus adds a drink, minus removes one, and the answer replaces the counts', async () => {
  const fetchMock = server(
    { body: dayOf({}) },
    { status: 201, body: dayOf({ coffee: 1 }) },
    { body: dayOf({}) },
  );
  renderWithQuery(<IntakeCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add one coffee' }));
  expect(await screen.findByText('Water 0 ml · Caffeine 95 mg')).toBeInTheDocument();
  expect(call(fetchMock, 1)).toEqual({
    url: `/api/intake/${date}`,
    method: 'POST',
    body: { kind: 'coffee' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove one coffee' }));
  expect(await screen.findByText('Water 0 ml · Caffeine 0 mg')).toBeInTheDocument();
  expect(call(fetchMock, 2)).toMatchObject({
    url: `/api/intake/${date}/coffee`,
    method: 'DELETE',
  });
  expect(screen.getByRole('button', { name: 'Remove one coffee' })).toBeDisabled();
});

test('a failed tap shows the reason and keeps the counts', async () => {
  const error = vi.spyOn(toast, 'error').mockImplementation(() => '');
  server({ body: dayOf({ tea: 1 }) }, { status: 500, body: { error: 'Server broke' } });
  renderWithQuery(<IntakeCard date={date} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add one tea' }));
  await waitFor(() => expect(error).toHaveBeenCalledWith('Server broke'));
  expect(screen.getByText('Water 0 ml · Caffeine 40 mg')).toBeInTheDocument();
});

test('a failed read says why and Try again reads again', async () => {
  const fetchMock = server(
    { status: 400, body: { error: 'The date is not valid' } },
    { body: dayOf({ water: 1 }) },
  );
  renderWithQuery(<IntakeCard date={date} />);
  expect(await screen.findByText('The date is not valid')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Water 250 ml · Caffeine 0 mg')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
