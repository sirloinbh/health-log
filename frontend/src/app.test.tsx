import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

// The other reads the pages make. Anything else fails the test (#214).
const otherRead = (url: string) =>
  url === '/api/goals'
    ? noGoals
    : url === '/api/reminders'
      ? noReminders
      : url.startsWith('/api/report?period=week&date=2026-10-2')
        ? noReport
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
  // Browsers fire it at the document, and it bubbles up to the window.
  act(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  expect(await screen.findByText('Server connected · 2026-10-27')).toBeInTheDocument();
  expect(healthCalls).toHaveLength(2);
});

test('an answer without a date is reported instead of a blank date', async () => {
  health({});
  render(<App />);
  expect(await findLive('alert')).toHaveTextContent('Cannot check the server status');
});
