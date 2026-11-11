import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

const noSleep = () => new Response(JSON.stringify({ record: null }));
const noMeals = () =>
  new Response(
    JSON.stringify({
      entries: [],
      totals: Object.fromEntries(
        ['calories', 'carbs', 'protein', 'fat', 'sugars', 'sodium'].map((key) => [
          key,
          { value: null, missing: 0 },
        ]),
      ),
      junk: Object.fromEntries(
        ['week', 'month'].map((key) => [
          key,
          {
            from: '2026-03-01',
            to: '2026-03-31',
            times: 0,
            days: 0,
            calories: { value: null, missing: 0 },
          },
        ]),
      ),
    }),
  );

const emptyPeriod = {
  smoking: { days: 0, cigarettes: null },
  drinking: { days: 0, drinkingDays: 0, totals: [] },
};
const noHabits = () =>
  new Response(
    JSON.stringify({
      record: null,
      week: { from: '2026-03-09', to: '2026-03-15', ...emptyPeriod },
      month: { from: '2026-03-01', to: '2026-03-31', ...emptyPeriod },
    }),
  );
const noRate = { days: 0, yes: 0 };
const noChecks = () =>
  new Response(
    JSON.stringify({
      record: null,
      week: { from: '2026-03-09', to: '2026-03-15', diet: noRate, sleep: noRate },
      month: { from: '2026-03-01', to: '2026-03-31', diet: noRate, sleep: noRate },
    }),
  );

const noGoals = (url: string) =>
  new Response(
    JSON.stringify({
      date: url.slice(-10),
      items: ['calories', 'protein', 'sleep', 'sober_days'].map((item) => ({
        item,
        goal: null,
        status: null,
        actual:
          item === 'sleep'
            ? { minutes: null }
            : item === 'sober_days'
              ? { from: '2026-03-09', to: '2026-03-15', recordedDays: 0, soberDays: 0 }
              : { entries: 0, total: null, missing: 0 },
      })),
      checks: null,
    }),
  );

// Today's page shows what is coming up (#48).
const noReminders = { today: '2026-03-15', until: '2026-03-22', leadDays: 7, reminders: [] };

// The day's cards load along with the page.
const dayCard = (url: string) =>
  url.startsWith('/api/sleep')
    ? noSleep()
    : url.startsWith('/api/meals')
      ? noMeals()
      : url.startsWith('/api/habits')
        ? noHabits()
        : url.startsWith('/api/checks')
          ? noChecks()
          : url.startsWith('/api/goals/days/')
            ? noGoals(url)
            : url === '/api/foods/recent'
              ? new Response(JSON.stringify({ foods: [] }))
              : url === '/api/reminders'
                ? new Response(JSON.stringify(noReminders))
                : null;

const health = (body: object, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(dayCard(url) ?? new Response(JSON.stringify(body), { status })),
    ),
  );

const open = (path: string) => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

test('the main menu opens the day the server counts as today', async () => {
  // Far from any real clock, so a browser-computed "today" would fail this.
  health({ today: '2026-03-15' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Daily record' }));
  expect(await screen.findByText('Sunday, March 15, 2026')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-15');
  expect(within(menu).getByRole('link', { name: 'Daily record' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the previous and next day links move across a month boundary', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-02-28');
  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  expect(await screen.findByText('Sunday, March 1, 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Previous day' }));
  expect(await screen.findByText('Saturday, February 28, 2026')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-02-28');
});

test('the today link returns to the server date and hides once there', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-01-01');
  fireEvent.click(await screen.findByRole('link', { name: 'Today' }));
  expect(await screen.findByText('Sunday, March 15, 2026')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Today' })).not.toBeInTheDocument();
});

test('picking a date opens that day', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  fireEvent.change(screen.getByLabelText('Choose date'), { target: { value: '2026-03-02' } });
  expect(await screen.findByText('Monday, March 2, 2026')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-02');
});

test('a year still being typed does not change the page', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  fireEvent.change(input, { target: { value: '0002-03-15' } });
  expect(window.location.pathname).toBe('/daily/2026-03-15');
  expect(input).toHaveValue('0002-03-15');
  fireEvent.blur(input);
  expect(input).toHaveValue('2026-03-15');
});

test('a date that does not exist shows an error with a way back', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-02-30');
  expect(screen.getByRole('alert')).toHaveTextContent('Not a real date: 2026-02-30');
  expect(screen.queryByRole('heading', { level: 2, name: 'Sleep' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: "Go to today's record" }));
  expect(await screen.findByText('Sunday, March 15, 2026')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-15');
});

test('a server error is reported instead of guessing today', async () => {
  health({ error: 'Server error occurred' }, 500);
  open('/daily');
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(window.location.pathname).toBe('/daily');
});

test('an unreachable server is reported instead of guessing today', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
  open('/daily');
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  expect(window.location.pathname).toBe('/daily');
});

test('an app left open past midnight picks up the new today', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  await screen.findByText('Sunday, March 15, 2026');
  await act(() => Promise.resolve());
  expect(screen.queryByRole('link', { name: 'Today' })).not.toBeInTheDocument();

  health({ today: '2026-03-16' });
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  fireEvent.click(await screen.findByRole('link', { name: 'Today' }));
  expect(await screen.findByText('Monday, March 16, 2026')).toBeInTheDocument();
});

test('returning to the tab checks today again', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  await act(() => Promise.resolve());

  health({ today: '2026-03-16' });
  fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByRole('link', { name: 'Today' })).toHaveAttribute(
    'href',
    '/daily/2026-03-16',
  );
});

test('a slow older response does not overwrite a newer today', async () => {
  const respond = (today: string) => new Response(JSON.stringify({ today }));
  let finishFirst = (_response: Response) => {};
  let healthCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const card = dayCard(url);
      if (card) return Promise.resolve(card);
      healthCalls += 1;
      return healthCalls === 1
        ? new Promise((resolve) => (finishFirst = resolve))
        : Promise.resolve(respond('2026-03-16'));
    }),
  );
  open('/daily/2026-03-16');
  fireEvent(document, new Event('visibilitychange'));
  await act(() => Promise.resolve());

  await act(async () => {
    finishFirst(respond('2026-03-15'));
    await Promise.resolve();
  });
  await act(() => Promise.resolve());
  expect(screen.queryByRole('link', { name: 'Today' })).not.toBeInTheDocument();
});

test('moving to another day is announced to screen readers', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  // A live region announces changes only if the same element stays and its text changes.
  const region = screen.getByText('Sunday, March 15, 2026');
  expect(region).toHaveAttribute('aria-live', 'polite');
  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  await screen.findByText('Monday, March 16, 2026');
  expect(region).toBeInTheDocument();
  expect(region).toHaveTextContent('Monday, March 16, 2026');
});

test('going back ends a typed edit, so the field matches the page and history stays intact', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  fireEvent.change(input, { target: { value: '2026-12-25' } });
  await screen.findByText('Friday, December 25, 2026');

  window.history.back();
  await screen.findByText('Sunday, March 15, 2026');
  expect(input).toHaveValue('2026-03-15');

  // A new edit must add an entry, not replace the day we came back to.
  fireEvent.change(input, { target: { value: '2026-03-20' } });
  await screen.findByText('Friday, March 20, 2026');
  window.history.back();
  await screen.findByText('Sunday, March 15, 2026');
  window.history.forward();
  await screen.findByText('Friday, March 20, 2026');
});

test('the date input offers the range the page opens', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  expect(input).toHaveAttribute('min', '2000-01-01');
  // A max also keeps Chrome from taking a sixth digit into the year.
  expect(input).toHaveAttribute('max', '2099-12-31');
});

test('typing the date already shown leaves no history entry', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  const before = window.history.length;
  fireEvent.change(input, { target: { value: '0202-03-15' } });
  fireEvent.change(input, { target: { value: '2026-03-15' } });
  expect(window.history.length).toBe(before);
  expect(input).toHaveValue('2026-03-15');
});

test('typing a date leaves one history entry and blur starts a new one', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  const before = window.history.length;
  fireEvent.change(input, { target: { value: '2026-01-15' } });
  fireEvent.change(input, { target: { value: '2026-12-15' } });
  fireEvent.change(input, { target: { value: '2026-12-25' } });
  expect(window.location.pathname).toBe('/daily/2026-12-25');
  expect(window.history.length).toBe(before + 1);

  fireEvent.blur(input);
  fireEvent.change(input, { target: { value: '2026-12-26' } });
  expect(window.history.length).toBe(before + 2);
});

test('each day loads its own sleep record', async () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(dayCard(url) ?? new Response(JSON.stringify({ today: '2026-03-15' }))),
  );
  vi.stubGlobal('fetch', fetchMock);
  open('/daily/2026-03-15');
  await screen.findByLabelText('Bedtime');
  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  await screen.findByText('Monday, March 16, 2026');
  await screen.findByLabelText('Bedtime');
  const sleepCalls = fetchMock.mock.calls
    .map(([url]) => url)
    .filter((url) => url.startsWith('/api/sleep'));
  expect(sleepCalls).toEqual(['/api/sleep/2026-03-15', '/api/sleep/2026-03-16']);
});

test('a slow reply for the day just left does not fill in the new day', async () => {
  const replies = new Map<string, (response: Response) => void>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/sleep')
        ? new Promise((resolve) => replies.set(url, resolve))
        : Promise.resolve(dayCard(url) ?? new Response(JSON.stringify({ today: '2026-03-15' }))),
    ),
  );
  open('/daily/2026-03-15');
  await waitFor(() => expect(replies.has('/api/sleep/2026-03-15')).toBe(true));
  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  await screen.findByText('Monday, March 16, 2026');
  await waitFor(() => expect(replies.has('/api/sleep/2026-03-16')).toBe(true));

  replies.get('/api/sleep/2026-03-16')?.(noSleep());
  await screen.findByLabelText('Bedtime');
  replies.get('/api/sleep/2026-03-15')?.(
    new Response(
      JSON.stringify({
        record: {
          date: '2026-03-15',
          bedAt: '2026-03-14T14:30:00.000Z',
          wakeAt: '2026-03-14T22:00:00.000Z',
          durationMinutes: 450,
          source: 'manual',
        },
      }),
    ),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(screen.queryByText('7 h 30 min')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Bedtime')).toHaveValue('');
});

test('a slow meal reply for the day just left does not fill in the new day', async () => {
  const replies = new Map<string, (response: Response) => void>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/meals')
        ? new Promise((resolve) => replies.set(url, resolve))
        : Promise.resolve(dayCard(url) ?? new Response(JSON.stringify({ today: '2026-03-15' }))),
    ),
  );
  open('/daily/2026-03-15');
  await waitFor(() => expect(replies.has('/api/meals/2026-03-15')).toBe(true));
  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  await screen.findByText('Monday, March 16, 2026');
  await waitFor(() => expect(replies.has('/api/meals/2026-03-16')).toBe(true));

  replies.get('/api/meals/2026-03-16')?.(noMeals());
  await screen.findByText('No meals recorded yet.');
  const eaten = {
    id: 1,
    meal: 'lunch',
    name: '어제의 김밥',
    brand: null,
    servings: 1,
    servingSize: null,
    servingUnit: null,
    calories: 300,
  };
  const body = (await noMeals().json()) as { totals: object; junk: object };
  replies.get('/api/meals/2026-03-15')?.(
    new Response(JSON.stringify({ entries: [eaten], totals: body.totals, junk: body.junk })),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(screen.queryByText('어제의 김밥')).not.toBeInTheDocument();
});

test('a day shows a place for each record kind', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  for (const name of [
    'Sleep',
    'Diet',
    'Body',
    'Alcohol and tobacco',
    'Daily check',
    'Clinic and medication',
  ]) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  }
});

test('an address outside the range says which days can be recorded, with a way back', () => {
  health({ today: '2026-03-15' });
  for (const date of ['1999-12-31', '2100-01-01', '0002-03-15', '9999-12-31']) {
    open(`/daily/${date}`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Records can be kept from 2000-01-01 to 2099-12-31: ${date}`,
    );
    expect(screen.getByRole('link', { name: "Go to today's record" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sleep' })).not.toBeInTheDocument();
    cleanup();
  }
});

test('at either end of the range the previous or next day stays in place but goes nowhere', () => {
  health({ today: '2026-03-15' });
  open('/daily/2000-01-01');
  const previous = screen.getByRole('link', { name: 'Previous day' });
  expect(previous).toHaveAttribute('aria-disabled', 'true');
  expect(previous).toHaveAccessibleDescription('Records can be kept from 2000-01-01 to 2099-12-31');
  fireEvent.click(previous);
  expect(window.location.pathname).toBe('/daily/2000-01-01');
  expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
    'href',
    '/daily/2000-01-02',
  );
  expect(screen.getByRole('link', { name: 'Next day' })).not.toHaveAttribute('aria-disabled');
  cleanup();

  open('/daily/2099-12-31');
  expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
    'href',
    '/daily/2099-12-30',
  );
});

test('stepping onto the first day keeps keyboard focus on the previous day link', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2000-01-02');
  const previous = screen.getByRole('link', { name: 'Previous day' });
  previous.focus();
  fireEvent.click(previous);
  expect(await screen.findByText('Saturday, January 1, 2000')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.getByRole('link', { name: 'Previous day' })).toHaveFocus();
});

test('leaving the field on a date out of range says why, even for a year cut short', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  const message = () => screen.queryByText('Records can be kept from 2000-01-01 to 2099-12-31');
  // Chrome stops the year at the field's max, so typing 2100 can leave 0210.
  fireEvent.change(input, { target: { value: '0210-01-01' } });
  expect(message()).not.toBeInTheDocument();
  fireEvent.blur(input);
  expect(message()).toBeInTheDocument();
  expect(input).toHaveValue('2026-03-15');

  fireEvent.change(input, { target: { value: '2026-03' } });
  expect(message()).not.toBeInTheDocument();
});

test('a typed date outside the range is explained and does not change the page', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  const message = () => screen.queryByText('Records can be kept from 2000-01-01 to 2099-12-31');

  // A year still being typed is not worth a word yet.
  fireEvent.change(input, { target: { value: '0199-12-31' } });
  expect(message()).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: '1999-12-31' } });
  expect(message()).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-15');
  fireEvent.change(input, { target: { value: '2100-01-01' } });
  expect(message()).toBeInTheDocument();

  fireEvent.change(input, { target: { value: '2026-03-02' } });
  expect(message()).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-02');
});

test('a word about the range left on one day does not come back after going there and back', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('Choose date');
  const message = () => screen.queryByText('Records can be kept from 2000-01-01 to 2099-12-31');
  fireEvent.change(input, { target: { value: '0210-01-01' } });
  fireEvent.blur(input);
  expect(message()).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Next day' }));
  expect(await screen.findByText('Monday, March 16, 2026')).toBeInTheDocument();
  expect(message()).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Previous day' }));
  expect(await screen.findByText('Sunday, March 15, 2026')).toBeInTheDocument();
  expect(message()).not.toBeInTheDocument();
});

test("today's page shows what is coming up, and another day does not ask for it (#48)", async () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(dayCard(url) ?? new Response(JSON.stringify({ today: '2026-03-15' }))),
  );
  vi.stubGlobal('fetch', fetchMock);
  open('/daily/2026-03-15');
  expect(
    await screen.findByText('No clinic appointments or medication end dates in the next 7 days.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Previous day' }));
  await screen.findByText('Saturday, March 14, 2026');
  await screen.findByLabelText('Bedtime');
  expect(screen.queryByRole('heading', { name: 'Upcoming' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/reminders')).toHaveLength(1);
});

test("one failed check of the server keeps today's coming-up card (#48)", async () => {
  let healthy = true;
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      dayCard(url) ??
        (healthy
          ? new Response(JSON.stringify({ today: '2026-03-15' }))
          : new Response(JSON.stringify({ error: 'Cannot reach the server' }), { status: 503 })),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  open('/daily/2026-03-15');
  await screen.findByText('No clinic appointments or medication end dates in the next 7 days.');
  healthy = false;
  fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByText('Cannot reach the server')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/reminders')).toHaveLength(1);
});
