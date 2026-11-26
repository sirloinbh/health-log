import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { findLive } from './test/live';
import { unexpectedRequest } from './test/requests';

// The settings page loads the goals along with it.
const noGoals = {
  today: '2026-10-26',
  week: { from: '2026-10-26', to: '2026-11-01' },
  current: { calories: null, protein: null, sleep: null, sober_days: null },
  history: [],
};

// The dashboard also shows what is coming up (#48).
const noReminders = { today: '2026-10-26', until: '2026-11-02', leadDays: 7, reminders: [] };

// The overview's report of the week of 2026-10-26, with nothing recorded.
const none = {
  sleep: { days: 0, averageMinutes: null },
  calories: { days: 0, incompleteDays: 0, average: null },
  drinking: { days: 0, drinkingDays: 0 },
  smoking: { days: 0, cigarettes: null, averagePerDay: null },
  diet: { days: 0, yes: 0 },
  sleepGood: { days: 0, yes: 0 },
};
const noScore = { days: 0, average: null };
const noGroup = { days: 0, mood: noScore, energy: noScore, stress: noScore };
const noReport = {
  period: 'week',
  current: { from: '2026-10-26', to: '2026-11-01', ...none },
  previous: { from: '2026-10-19', to: '2026-10-25', ...none },
  days: [],
  sleepAfterDrinking: {
    afterDrinking: { nights: 0, averageMinutes: null },
    afterNoDrinking: { nights: 0, averageMinutes: null },
  },
  sleepAfterCaffeine: {
    none: { nights: 0, averageMinutes: null },
    low: { nights: 0, averageMinutes: null },
    high: { nights: 0, averageMinutes: null },
  },
  conditionAfter: Object.fromEntries(
    ['shortSleep', 'drinking', 'junkFood'].map((key) => [key, { with: noGroup, without: noGroup }]),
  ),
};

const noDrinks = { count: 0, amount: 0 };
const noIntake = {
  date: '2026-10-26',
  kinds: Object.fromEntries(
    ['water', 'coffee', 'tea', 'energy', 'other_caffeine'].map((kind) => [kind, noDrinks]),
  ),
  waterMl: 0,
  caffeineMg: 0,
};

// The other reads the pages make. Anything else fails the test (#214).
const otherRead = (url: string) =>
  url === '/api/goals'
    ? noGoals
    : url === '/api/reminders'
      ? noReminders
      : url.startsWith('/api/report?period=')
        ? noReport
        : url === '/api/foods/recent'
          ? { foods: [] }
          : url.startsWith('/api/intake/')
            ? noIntake
            : null;

const answerOther = (url: string, init?: RequestInit) => {
  const body = otherRead(url);
  return body ? Promise.resolve(new Response(JSON.stringify(body))) : unexpectedRequest(url, init);
};

// Answers /api/health with `body` and `status`; the status is the server's alone, not the other reads'.
const health = (body: object, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url === '/api/health'
        ? Promise.resolve(new Response(JSON.stringify(body), { status }))
        : answerOther(url, init),
    ),
  );

test('shows the server date from /api/health on the dashboard', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/dashboard');
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

test('the main menu follows the shared order: day log, Quick entry, Week, 12 weeks, ..., Dashboard, Settings', async () => {
  health({ today: '2026-10-26' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  const names = within(menu)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label') ?? link.textContent);
  expect(names).toEqual([
    'Daily record',
    'Quick entry',
    'Week',
    '12 weeks',
    'Foods',
    'Combos',
    'Clinic',
    'Medication',
    'Lab results',
    'Dashboard',
    'Settings',
  ]);
  fireEvent.click(within(menu).getByRole('link', { name: 'Quick entry' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Quick entry' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { level: 2, name: 'Water' })).toBeInTheDocument();
});

// Runs the app as the installed app (PWA) does: in the standalone display mode.
const installed = () =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );

// Answers /api/health and leaves every other read pending: enough to see which page opens.
const healthOnly = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/api/health'
        ? Promise.resolve(new Response(JSON.stringify({ today: '2026-10-26' })))
        : new Promise<Response>(() => {}),
    ),
  );

test('the start page is the day log, in the browser and in the installed app (#350)', async () => {
  healthOnly();
  render(<App />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Daily record' }),
  ).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe('/daily/2026-10-26'));
  cleanup();
  window.history.replaceState(null, '', '/');
  installed();
  render(<App />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Daily record' }),
  ).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe('/daily/2026-10-26'));
});

test('an old dashboard link at "/" goes to the dashboard with its period and date', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/?period=week&date=2026-10-20');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard');
  expect(window.location.search).toBe('?period=week&date=2026-10-20');
});

test('Week and 12 weeks are pages of their own, without period buttons', async () => {
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/week');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Week' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Monthly' })).not.toBeInTheDocument();
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: '12 weeks' }));
  expect(await screen.findByRole('heading', { level: 1, name: '12 weeks' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/weeks');
});

test('the installed app opened at another address stays there', async () => {
  installed();
  health({ today: '2026-10-26' });
  window.history.replaceState(null, '', '/settings');
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/settings');
});

test('an unknown address falls back to the start page', async () => {
  healthOnly();
  window.history.replaceState(null, '', '/no-such-page');
  render(<App />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Daily record' }),
  ).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe('/daily/2026-10-26'));
});

// Answers /api/health with each date in turn (the last one repeats), and the other pages' reads as above.
const days = (...todays: string[]) => {
  const healthCalls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url !== '/api/health') return answerOther(url, init);
      healthCalls.push(url);
      const today = todays[Math.min(healthCalls.length, todays.length) - 1];
      return Promise.resolve(new Response(JSON.stringify({ today })));
    }),
  );
  return healthCalls;
};

test('an app left open past midnight shows the new date within a minute', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const healthCalls = days('2026-10-26', '2026-10-27');
  window.history.replaceState(null, '', '/dashboard');
  render(<App />);
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(await screen.findByText('Server connected · 2026-10-27')).toBeInTheDocument();
  expect(healthCalls).toHaveLength(2);
});

test('coming back to the page checks the server again', async () => {
  const healthCalls = days('2026-10-26', '2026-10-27');
  window.history.replaceState(null, '', '/dashboard');
  render(<App />);
  expect(await screen.findByText('Server connected · 2026-10-26')).toBeInTheDocument();
  // Browsers fire it at the document, and it bubbles up to the window.
  act(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  expect(await screen.findByText('Server connected · 2026-10-27')).toBeInTheDocument();
  expect(healthCalls).toHaveLength(2);
});

test('an answer without a date is reported instead of a blank date', async () => {
  health({});
  window.history.replaceState(null, '', '/dashboard');
  render(<App />);
  expect(await findLive('alert')).toHaveTextContent('Cannot check the server status');
});
