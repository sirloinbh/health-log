import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

const today = '2026-11-05';
const empty = {
  sleep: { days: 0, averageMinutes: null },
  calories: { days: 0, incompleteDays: 0, average: null },
  drinking: { days: 0, drinkingDays: 0 },
  smoking: { days: 0, cigarettes: null, averagePerDay: null },
  diet: { days: 0, yes: 0 },
  sleepGood: { days: 0, yes: 0 },
};
const week = { from: '2026-11-02', to: '2026-11-08' };
const weekDays = ['02', '03', '04', '05', '06', '07', '08'].map((day) => `2026-11-${day}`);

const reportOf = (overrides: Record<string, unknown> = {}) => ({
  period: 'week',
  current: {
    ...week,
    sleep: { days: 4, averageMinutes: 450 },
    calories: { days: 3, incompleteDays: 1, average: 1850 },
    drinking: { days: 5, drinkingDays: 2 },
    smoking: { days: 2, cigarettes: 9, averagePerDay: 4.5 },
    diet: { days: 4, yes: 3 },
    sleepGood: { days: 3, yes: 2 },
  },
  previous: {
    from: '2026-10-26',
    to: '2026-11-01',
    ...empty,
    sleep: { days: 5, averageMinutes: 420 },
    diet: { days: 2, yes: 2 },
  },
  days: weekDays.map((date, index) => ({
    date,
    sleepMinutes: index === 1 ? null : 400 + index * 10,
    calories: index < 3 ? 1800 + index * 50 : null,
    drank: index % 2 === 0,
  })),
  sleepAfterDrinking: {
    afterDrinking: { nights: 2, averageMinutes: 360 },
    afterNoDrinking: { nights: 6, averageMinutes: 450 },
  },
  ...overrides,
});

// The dashboard also shows what is coming up (#48).
const noReminders = { today: today, until: '2026-11-12', leadDays: 7, reminders: [] };

const serve = (report: (url: string) => Response | Promise<Response>) => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith('/api/report')
        ? report(url)
        : url === '/api/reminders'
          ? json(noReminders)
          : new Response(JSON.stringify({ today })),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

const reportCalls = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/report'));

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;

test('the dashboard asks for this week from the server date and shows each average with its days', async () => {
  const fetchMock = serve(() => json(reportOf()));
  render(<App />);
  expect(await screen.findByText('Nov 2 – Nov 8')).toBeInTheDocument();
  expect(reportCalls(fetchMock)).toEqual([`/api/report?period=week&date=${today}`]);

  expect(stat('Average sleep')).toHaveTextContent('7 h 30 min');
  expect(stat('Average sleep')).toHaveTextContent(
    '4 days recorded · +30 min vs last week (5 days)',
  );
  expect(stat('Average daily calories')).toHaveTextContent('1,850kcal');
  expect(stat('Average daily calories')).toHaveTextContent('excludes 1 day with unknown calories');
  expect(stat('Average daily calories')).toHaveTextContent('No records last week');
  expect(stat('Days with drinking')).toHaveTextContent('2 days (40%)');
  expect(stat('Average daily smoking')).toHaveTextContent('4.5 cigarettes');
  expect(stat('Average daily smoking')).toHaveTextContent('total 9 cigarettes');
  expect(stat('Diet kept')).toHaveTextContent('75%');
  expect(stat('Diet kept')).toHaveTextContent('4 days checked · -25%p vs last week (2 days)');
  expect(stat('Sleep good')).toHaveTextContent('67%');
});

test('a period with no record says so instead of showing zero', async () => {
  serve(() =>
    json(
      reportOf({
        current: { ...week, ...empty },
        days: weekDays.map((date) => ({ date, sleepMinutes: null, calories: null, drank: null })),
        sleepAfterDrinking: {
          afterDrinking: { nights: 0, averageMinutes: null },
          afterNoDrinking: { nights: 0, averageMinutes: null },
        },
      }),
    ),
  );
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  for (const label of [
    'Average sleep',
    'Average daily calories',
    'Days with drinking',
    'Average daily smoking',
    'Diet kept',
    'Sleep good',
  ]) {
    expect(stat(label)).toHaveTextContent('No records');
    expect(stat(label)).not.toHaveTextContent('0%');
  }
  expect(screen.getByRole('img', { name: 'Sleep time: no days recorded' })).toBeInTheDocument();
});

test('the drinking comparison shows how many nights each side has, and warns when few', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const card = (
    await screen.findByRole('heading', { name: 'Drinking and sleep that night' })
  ).closest<HTMLElement>('[data-slot=card]')!;
  expect(
    within(card).getByText('This shows a relationship only; it does not establish a cause.'),
  ).toBeInTheDocument();
  const drank = within(card).getByText('Nights after drinking').closest('div')!;
  expect(drank).toHaveTextContent('Sample: 2 nights');
  expect(drank).toHaveTextContent('6 h');
  expect(within(card).getByText('Nights without drinking').closest('div')!).toHaveTextContent(
    'Sample: 6 nights',
  );
  expect(within(card).getByText(/One sample has fewer than 5 nights/)).toBeInTheDocument();
});

test('enough nights on both sides drop the warning', async () => {
  serve(() =>
    json(
      reportOf({
        sleepAfterDrinking: {
          afterDrinking: { nights: 5, averageMinutes: 360 },
          afterNoDrinking: { nights: 9, averageMinutes: 450 },
        },
      }),
    ),
  );
  render(<App />);
  await screen.findByRole('heading', { name: 'Drinking and sleep that night' });
  expect(screen.queryByText(/One sample has/)).not.toBeInTheDocument();
});

test('a day without a record is a gap in the chart and says so in the table', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const chart = await screen.findByRole('img', { name: /Sleep time: 6 of 7 days recorded/ });
  expect(chart).toHaveAccessibleName('Sleep time: 6 of 7 days recorded, highest day 7 h 40 min');
  const figure = chart.closest('figure')!;
  const rows = within(figure).getAllByRole('row');
  // Header, then one row per day; 11/3 has no sleep record.
  expect(rows).toHaveLength(8);
  expect(rows[2]).toHaveTextContent('11/3No record');
  expect(rows[1]).toHaveTextContent('11/26 h 40 min');
});

test('switching to months and stepping back asks for those periods', async () => {
  const fetchMock = serve((url) =>
    json(
      url.includes('period=month')
        ? reportOf({
            period: 'month',
            current: { ...reportOf().current, from: '2026-11-01', to: '2026-11-30' },
          })
        : reportOf(),
    ),
  );
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2026-10-26'),
  );
  expect(window.location.search).toBe('?period=week&date=2026-10-26');

  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=month&date=2026-10-26'),
  );
  expect(await screen.findByText('Nov 1 – Nov 30')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true');
});

test('moving between periods keeps the row and the pressed button focused while loading (#138)', async () => {
  // The first answer comes at once; the later ones wait to be answered by hand.
  const answers: (() => void)[] = [];
  let calls = 0;
  serve((url) =>
    ++calls === 1
      ? json(reportOf())
      : new Promise<Response>((resolve) => {
          answers.push(() =>
            resolve(
              json(
                url.includes('period=month')
                  ? reportOf({
                      period: 'month',
                      current: { ...reportOf().current, from: '2026-10-01', to: '2026-10-31' },
                    })
                  : reportOf({
                      current: { ...reportOf().current, from: '2026-10-26', to: '2026-11-01' },
                    }),
              ),
            ),
          );
        }),
  );
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');

  const previous = screen.getByRole('button', { name: 'Previous week' });
  previous.focus();
  fireEvent.click(previous);
  await waitFor(() => expect(answers).toHaveLength(1));
  // While the next week is on its way the row stays, the earlier report marked busy.
  expect(previous).toBeInTheDocument();
  expect(previous).toHaveFocus();
  expect(screen.getByText('Nov 2 – Nov 8').closest('[aria-busy]')).toBeNull();
  expect(stat('Average sleep').closest('[aria-busy="true"]')).not.toBeNull();
  answers[0]();
  expect(await screen.findByText('Oct 26 – Nov 1')).toBeInTheDocument();
  expect(previous).toHaveFocus();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();

  const monthly = screen.getByRole('button', { name: 'Monthly' });
  monthly.focus();
  fireEvent.click(monthly);
  await waitFor(() => expect(answers).toHaveLength(2));
  expect(monthly).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
  answers[1]();
  expect(await screen.findByText('Oct 1 – Oct 31')).toBeInTheDocument();
  expect(monthly).toHaveFocus();
});

test('pressing a period button twice before the answer moves two periods (#138)', async () => {
  let calls = 0;
  const fetchMock = serve(() =>
    ++calls === 1 ? json(reportOf()) : new Promise<Response>(() => {}),
  );
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  const previous = screen.getByRole('button', { name: 'Previous week' });
  fireEvent.click(previous);
  await waitFor(() => expect(window.location.search).toBe('?period=week&date=2026-10-26'));
  fireEvent.click(previous);
  await waitFor(() => expect(window.location.search).toBe('?period=week&date=2026-10-19'));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2026-10-19'),
  );
});

test('"This week" goes once the week is shown, and its focus moves to the period (#138)', async () => {
  serve((url) =>
    json(
      url.endsWith(`date=${today}`)
        ? reportOf()
        : reportOf({ current: { ...reportOf().current, from: '2026-10-26', to: '2026-11-01' } }),
    ),
  );
  window.history.replaceState(null, '', '/?period=week&date=2026-10-28');
  render(<App />);
  await screen.findByText('Oct 26 – Nov 1');
  const thisWeek = screen.getByRole('button', { name: 'This week' });
  thisWeek.focus();
  fireEvent.click(thisWeek);
  const span = await screen.findByText('Nov 2 – Nov 8');
  expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument();
  await waitFor(() => expect(span).toHaveFocus());
});

test('"This week" keeps its focus while the week loads (#138 review)', async () => {
  let answer: () => void = () => {};
  serve((url) =>
    url.endsWith(`date=${today}`)
      ? new Promise<Response>((resolve) => {
          answer = () => resolve(json(reportOf()));
        })
      : json(
          reportOf({ current: { ...reportOf().current, from: '2026-10-26', to: '2026-11-01' } }),
        ),
  );
  window.history.replaceState(null, '', '/?period=week&date=2026-10-28');
  render(<App />);
  await screen.findByText('Oct 26 – Nov 1');
  const thisWeek = screen.getByRole('button', { name: 'This week' });
  thisWeek.focus();
  fireEvent.click(thisWeek);
  await waitFor(() => expect(window.location.search).toBe(`?period=week&date=${today}`));
  expect(thisWeek).toBeInTheDocument();
  expect(thisWeek).toHaveFocus();
  answer();
  const span = await screen.findByText('Nov 2 – Nov 8');
  await waitFor(() => expect(span).toHaveFocus());
});

test('a move whose report fails puts focus on Try again (#138 review)', async () => {
  let calls = 0;
  serve(() => (++calls === 1 ? json(reportOf()) : json({ error: 'Server error occurred' }, 500)));
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  const previous = screen.getByRole('button', { name: 'Previous week' });
  previous.focus();
  fireEvent.click(previous);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  await waitFor(() => expect(retry).toHaveFocus());
});

test('a failed "This week" does not move focus on a later report (#138 review)', async () => {
  serve((url) =>
    url.endsWith(`date=${today}`) && url.includes('period=week')
      ? json({ error: 'Server error occurred' }, 500)
      : json(
          url.includes('period=month')
            ? reportOf({
                period: 'month',
                current: { ...reportOf().current, from: '2026-11-01', to: '2026-11-30' },
              })
            : reportOf({
                current: { ...reportOf().current, from: '2026-10-26', to: '2026-11-01' },
              }),
        ),
  );
  window.history.replaceState(null, '', '/?period=week&date=2026-10-28');
  render(<App />);
  await screen.findByText('Oct 26 – Nov 1');
  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  await screen.findByRole('alert');
  // Pressing Monthly without focusing it, as Safari does: the month's arrival must not take focus.
  const outside = document.createElement('input');
  document.body.append(outside);
  outside.focus();
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
  outside.remove();
  const span = await screen.findByText('Nov 1 – Nov 30');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(span).not.toHaveFocus();
});

test('a failed report can be tried again', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: 'Server error occurred' }, 500) : json(reportOf())));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  fail = false;
  const retry = screen.getByRole('button', { name: 'Try again' });
  retry.focus();
  fireEvent.click(retry);
  const span = await screen.findByText('Nov 2 – Nov 8');
  // The button is gone, so focus moves to the period shown, not to the page (#128).
  await waitFor(() => expect(span).toHaveFocus());
});

test('a retry that fails again keeps focus on its button', async () => {
  let answer: (response: Response) => void = () => {};
  let calls = 0;
  serve(() =>
    ++calls === 1
      ? json({ error: 'Server error occurred' }, 500)
      : new Promise<Response>((resolve) => {
          answer = resolve;
        }),
  );
  render(<App />);
  await screen.findByRole('alert');
  const retry = screen.getByRole('button', { name: 'Try again' });
  retry.focus();
  fireEvent.click(retry);
  // While the retry is on its way the button stays, marked busy, and keeps focus.
  await waitFor(() => expect(retry).toHaveAttribute('aria-disabled', 'true'));
  expect(retry).toHaveFocus();
  answer(json({ error: 'Server error occurred' }, 500));
  await waitFor(() => expect(retry).not.toHaveAttribute('aria-disabled'));
  expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred');
  expect(retry).toHaveFocus();
});

test('a retry for a period already left does not end a newer retry (#128 review)', async () => {
  // Every report request waits until answered by hand, in order.
  const answers: ((response: Response) => void)[] = [];
  serve(
    () =>
      new Promise<Response>((resolve) => {
        answers.push(resolve);
      }),
  );
  const failure = () => json({ error: 'Server error occurred' }, 500);
  render(<App />);
  await waitFor(() => expect(answers).toHaveLength(1));
  answers[0](failure());
  const weekRetry = await screen.findByRole('button', { name: 'Try again' });
  fireEvent.click(weekRetry);
  await waitFor(() => expect(answers).toHaveLength(2));

  // Months while the week's retry is on its way: that retry is over, its button is free again.
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
  await waitFor(() => expect(answers).toHaveLength(3));
  answers[2](failure());
  const monthRetry = await screen.findByRole('button', { name: 'Try again' });
  await waitFor(() => expect(monthRetry).not.toHaveAttribute('aria-disabled'));
  monthRetry.focus();
  fireEvent.click(monthRetry);
  await waitFor(() => expect(answers).toHaveLength(4));

  // The week's late answer must not take the month's retry button, and its focus, away.
  answers[1](json(reportOf()));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(monthRetry).toBeInTheDocument();
  expect(monthRetry).toHaveFocus();
  answers[3](failure());
  await waitFor(() => expect(monthRetry).not.toHaveAttribute('aria-disabled'));
  expect(monthRetry).toHaveFocus();
});

test('focus moved elsewhere during a retry stays there (#128 review)', async () => {
  let answer: (response: Response) => void = () => {};
  let calls = 0;
  serve(() =>
    ++calls === 1
      ? json({ error: 'Server error occurred' }, 500)
      : new Promise<Response>((resolve) => {
          answer = resolve;
        }),
  );
  render(<App />);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  fireEvent.click(retry);
  await waitFor(() => expect(calls).toBe(2));
  const weekly = screen.getByRole('button', { name: 'Weekly' });
  weekly.focus();
  answer(json(reportOf()));
  await screen.findByText('Nov 2 – Nov 8');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(weekly).toHaveFocus();
});

test('the first and last periods of the range do not move past it (#130)', async () => {
  const at = (from: string, to: string) => ({ ...reportOf().current, from, to });
  const fetchMock = serve((url) => {
    const month = url.includes('period=month');
    const date = new URL(url, 'http://test').searchParams.get('date')!;
    if (date.startsWith('2099')) {
      return json(
        reportOf({
          period: month ? 'month' : 'week',
          current: month ? at('2099-12-01', '2099-12-31') : at('2099-12-28', '2100-01-03'),
        }),
      );
    }
    return json(
      reportOf({
        period: month ? 'month' : 'week',
        current: month ? at('2000-01-01', '2000-01-31') : at('1999-12-27', '2000-01-02'),
      }),
    );
  });
  window.history.replaceState(null, '', '/?period=week&date=2000-01-01');
  render(<App />);
  await screen.findByText('Dec 27, 1999 – Jan 2, 2000');
  const previous = screen.getByRole('button', { name: 'Previous week' });
  expect(previous).toHaveAttribute('aria-disabled', 'true');
  expect(previous).toHaveAccessibleDescription('Records can be kept from 2000-01-01 to 2099-12-31');
  expect(screen.getByRole('button', { name: 'Next week' })).not.toHaveAttribute('aria-disabled');
  const before = reportCalls(fetchMock).length;
  fireEvent.click(previous);
  expect(window.location.search).toBe('?period=week&date=2000-01-01');
  expect(reportCalls(fetchMock)).toHaveLength(before);

  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
  await screen.findByText('Jan 1 – Jan 31, 2000');
  expect(screen.getByRole('button', { name: 'Previous month' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  window.history.pushState({}, '', '/?period=week&date=2099-12-31');
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByText('Dec 28, 2099 – Jan 3, 2100');
  expect(screen.getByRole('button', { name: 'Next week' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Previous week' })).not.toHaveAttribute(
    'aria-disabled',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
  await screen.findByText('Dec 1 – Dec 31, 2099');
  expect(screen.getByRole('button', { name: 'Next month' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('the week before the second week of 2000 is asked for by a day in range (#130 review)', async () => {
  const at = (from: string, to: string) => ({ ...reportOf().current, from, to });
  const fetchMock = serve((url) =>
    json(
      reportOf({
        current: url.endsWith('date=2000-01-05')
          ? at('2000-01-03', '2000-01-09')
          : at('1999-12-27', '2000-01-02'),
      }),
    ),
  );
  window.history.replaceState(null, '', '/?period=week&date=2000-01-05');
  render(<App />);
  await screen.findByText('Jan 3 – Jan 9, 2000');
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
  expect(await screen.findByText('Dec 27, 1999 – Jan 2, 2000')).toBeInTheDocument();
  expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2000-01-01');
  expect(screen.queryByText(/Records can be kept from/)).not.toBeInTheDocument();
});

test('a report still on its way does not land next to the word about a date out of range (#130 review)', async () => {
  let answer: (response: Response) => void = () => {};
  serve(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  render(<App />);
  await screen.findByRole('status', { name: 'Loading report' });
  window.history.pushState(null, '', '/?period=week&date=1999-06-01');
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByText('Records can be kept from 2000-01-01 to 2099-12-31: 1999-06-01');
  answer(json(reportOf()));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText('Nov 2 – Nov 8')).not.toBeInTheDocument();
});

test('a date in the address outside the range is said, not shown as an empty report (#130)', async () => {
  const fetchMock = serve(() => json(reportOf()));
  window.history.replaceState(null, '', '/?period=week&date=1999-06-01');
  render(<App />);
  expect(
    await screen.findByText('Records can be kept from 2000-01-01 to 2099-12-31: 1999-06-01'),
  ).toBeInTheDocument();
  expect(reportCalls(fetchMock)).toEqual([]);
  const move = await screen.findByRole('button', { name: 'Go to this week' });
  move.focus();
  fireEvent.click(move);
  const span = await screen.findByText('Nov 2 – Nov 8');
  // The button goes with the word; focus moves to the period shown, not to the page.
  await waitFor(() => expect(span).toHaveFocus());
  expect(reportCalls(fetchMock)).toEqual([`/api/report?period=week&date=${today}`]);
});

test('drinking compares the share of recorded days, since the periods may hold different numbers', async () => {
  serve(() =>
    json(
      reportOf({
        current: { ...reportOf().current, drinking: { days: 2, drinkingDays: 2 } },
        previous: { ...reportOf().previous, drinking: { days: 7, drinkingDays: 2 } },
      }),
    ),
  );
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  // Two of two against two of seven: the same count, but not the same share.
  expect(stat('Days with drinking')).toHaveTextContent('2 days (100%)');
  expect(stat('Days with drinking')).toHaveTextContent('+71%p vs last week (7 days)');
});

test('an answer for a period already left does not replace the one on screen', async () => {
  let finishWeek = (_response: Response) => {};
  let first = true;
  serve((url) => {
    if (url.includes('period=week') && first) {
      first = false;
      return new Promise((resolve) => (finishWeek = resolve));
    }
    return json(
      url.includes('period=month')
        ? reportOf({
            period: 'month',
            current: { ...reportOf().current, from: '2026-11-01', to: '2026-11-30' },
          })
        : reportOf(),
    );
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Monthly' }));
  expect(await screen.findByText('Nov 1 – Nov 30')).toBeInTheDocument();
  finishWeek(
    json(reportOf({ current: { ...reportOf().current, sleep: { days: 1, averageMinutes: 60 } } })),
  );
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByText('Nov 1 – Nov 30')).toBeInTheDocument();
  expect(stat('Average sleep')).toHaveTextContent('7 h 30 min');
});

test('a date in the address that does not exist falls back to the server date', async () => {
  const fetchMock = serve(() => json(reportOf()));
  window.history.replaceState(null, '', '/?period=week&date=2026-02-30');
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  expect(reportCalls(fetchMock)).toEqual([`/api/report?period=week&date=${today}`]);
});

test('without the server date the page says why, instead of loading forever', async () => {
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'Cannot connect to the database' }), { status: 503 }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByText(/today date is unknown/)).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Loading report' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/report'))).toBe(false);
});

test('the tip of an edge bar hangs inward instead of past the card', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const chart = await screen.findByRole('img', { name: /Sleep time/ });
  const columns = [...chart.querySelectorAll('rect[fill="transparent"]')];
  fireEvent.mouseEnter(columns[0]);
  const tip = within(chart.closest('figure')!).getByText('11/2 · 6 h 40 min');
  expect(tip.className).not.toContain('-translate-x-1/2');
  expect(tip.style.left).toBe('0%');
  fireEvent.mouseEnter(columns[6]);
  const last = within(chart.closest('figure')!).getByText('11/8 · 7 h 40 min');
  expect(last.className).toContain('-translate-x-full');
  expect(last.style.left).toBe('100%');
  // The second bar from either end hangs inward too: the rule is the same on both sides.
  fireEvent.mouseEnter(columns[5]);
  expect(within(chart.closest('figure')!).getByText('11/7 · 7 h 30 min').className).toContain(
    '-translate-x-full',
  );
  fireEvent.mouseEnter(columns[1]);
  expect(within(chart.closest('figure')!).getByText('11/3 · No record').className).not.toContain(
    '-translate-x',
  );
  fireEvent.mouseEnter(columns[3]);
  expect(within(chart.closest('figure')!).getByText('11/5 · 7 h 10 min').className).toContain(
    '-translate-x-1/2',
  );
});

test('one failed check of the server keeps the report already on screen', async () => {
  let healthy = true;
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith('/api/report')
        ? json(reportOf())
        : url === '/api/reminders'
          ? json(noReminders)
          : healthy
            ? json({ today })
            : json({ error: 'Cannot reach the server' }, 503),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByText('Nov 2 – Nov 8');
  healthy = false;
  // Returning to the tab checks the server again.
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  expect(screen.getByText('Nov 2 – Nov 8')).toBeInTheDocument();
  expect(stat('Average sleep')).toHaveTextContent('7 h 30 min');
  expect(screen.queryByText(/today date is unknown/)).not.toBeInTheDocument();
});
