import { fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { renderWithQuery } from './test/query';
import { WorkoutsCard } from './workouts';

const date = '2026-11-04';
type Reply = { status?: number; body?: unknown };
const server = (...replies: Reply[]) => {
  const fetchMock = vi.fn(() => {
    const { status = 200, body } = replies.shift() ?? {};
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

test('shows the mocked workouts of the day with sets and top weight', async () => {
  const fetchMock = server({
    body: {
      state: 'ok',
      workouts: [
        {
          id: 7,
          title: 'Push day',
          exercises: [
            { exercise: 'Bench press', sets: 3, topWeightKg: 62.5 },
            { exercise: 'Dips', sets: 1, topWeightKg: 0 },
          ],
        },
      ],
    },
  });
  renderWithQuery(<WorkoutsCard date={date} />);
  expect(await screen.findByRole('heading', { name: 'Push day' })).toBeInTheDocument();
  expect(screen.getByText('Bench press')).toBeInTheDocument();
  expect(screen.getByText('3 sets, top 62.5 kg')).toBeInTheDocument();
  expect(screen.getByText('1 set')).toBeInTheDocument();
  expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(`/api/workout-memo/${date}`);
  // Read-only: nothing here changes a workout.
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('a day without workouts says so', async () => {
  server({ body: { state: 'ok', workouts: [] } });
  renderWithQuery(<WorkoutsCard date={date} />);
  expect(
    await screen.findByText('No workouts recorded in workout-memo for this day.'),
  ).toBeInTheDocument();
});

test('when workout-memo cannot be reached it says so quietly and Try again reads again', async () => {
  const fetchMock = server(
    { body: { state: 'unavailable' } },
    { body: { state: 'ok', workouts: [{ id: 1, title: 'Legs', exercises: [] }] } },
  );
  renderWithQuery(<WorkoutsCard date={date} />);
  expect(
    await screen.findByText('Workouts from workout-memo cannot be shown right now.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Legs' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a failed request to our own API gets the same quiet message', async () => {
  server({ status: 500, body: { error: 'Server error' } }, { status: 500, body: {} });
  renderWithQuery(<WorkoutsCard date={date} />);
  expect(
    await screen.findByText('Workouts from workout-memo cannot be shown right now.'),
  ).toBeInTheDocument();
});
