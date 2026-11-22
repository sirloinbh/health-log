import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { findLive } from './test/live';

// The settings page loads the goals along with it.
const noGoals = {
  today: '2026-10-26',
  week: { from: '2026-10-26', to: '2026-11-01' },
  current: { calories: null, protein: null, sleep: null, sober_days: null },
  history: [],
};

// The dashboard also shows what is coming up (#48).
const noReminders = { today: '2026-10-26', until: '2026-11-02', leadDays: 7, reminders: [] };

const health = (body: object, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url === '/api/goals' ? noGoals : url === '/api/reminders' ? noReminders : body,
          ),
          { status },
        ),
      ),
    ),
  );

test('shows the server date from /api/health on the overview', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
});

test('reports a server error as an alert', async () => {
  health({ error: 'Cannot connect to the database' }, 503);
  render(<App />);
  expect(await findLive('alert')).toHaveTextContent('Cannot connect to the database');
});

test('each page has its own address and is marked in the main menu', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Settings' }));
  expect(window.location.pathname).toBe('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Goals are set here (#45).
  expect(await screen.findByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument();
});

test('an unknown address falls back to the overview', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
});

// Answers /api/health with each date in turn (the last one repeats), and the other pages' reads as above.
const days = (...todays: string[]) => {
  const healthCalls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/health') healthCalls.push(url);
      const today = todays[Math.min(healthCalls.length, todays.length) - 1];
      const body =
        url === '/api/goals' ? noGoals : url === '/api/reminders' ? noReminders : { today };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  return healthCalls;
};

test('an app left open past midnight shows the new date within a minute', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const healthCalls = days('2026-10-26', '2026-10-27');
  render(<App />);
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(await screen.findByText('Server connected · 2026-10-27')).toBeInTheDocument();
  expect(healthCalls).toHaveLength(2);
});

test('coming back to the page checks the server again', async () => {
  const healthCalls = days('2026-10-26', '2026-10-27');
  render(<App />);
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await screen.findByText('Server connected · 2026-10-27')).toBeInTheDocument();
  expect(healthCalls).toHaveLength(2);
});

test('an answer without a date is reported instead of a blank date', async () => {
  health({});
  render(<App />);
  expect(await findLive('alert')).toHaveTextContent('Cannot check the server status');
});
