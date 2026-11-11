import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

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
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot connect to the database');
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
