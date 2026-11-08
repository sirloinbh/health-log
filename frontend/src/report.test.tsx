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
  expect(await screen.findByText('11월 2일 ~ 11월 8일')).toBeInTheDocument();
  expect(reportCalls(fetchMock)).toEqual([`/api/report?period=week&date=${today}`]);

  expect(stat('평균 수면')).toHaveTextContent('7시간 30분');
  expect(stat('평균 수면')).toHaveTextContent('기록한 날 4일 · 지난주(5일)보다 +30분');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('1,850kcal');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('칼로리를 모르는 날 1일 제외');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('지난주 기록 없음');
  expect(stat('술 마신 날')).toHaveTextContent('2일 (40%)');
  expect(stat('하루 평균 흡연')).toHaveTextContent('4.5개비');
  expect(stat('하루 평균 흡연')).toHaveTextContent('합계 9개비');
  expect(stat('식단 지킴')).toHaveTextContent('75%');
  expect(stat('식단 지킴')).toHaveTextContent('체크한 날 4일 · 지난주(2일)보다 -25%p');
  expect(stat('수면 만족')).toHaveTextContent('67%');
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
  await screen.findByText('11월 2일 ~ 11월 8일');
  for (const label of [
    '평균 수면',
    '하루 평균 칼로리',
    '술 마신 날',
    '하루 평균 흡연',
    '식단 지킴',
    '수면 만족',
  ]) {
    expect(stat(label)).toHaveTextContent('기록 없음');
    expect(stat(label)).not.toHaveTextContent('0%');
  }
  expect(screen.getByRole('img', { name: '수면 시간: 기록한 날이 없습니다' })).toBeInTheDocument();
});

test('the drinking comparison shows how many nights each side has, and warns when few', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const card = (
    await screen.findByRole('heading', { name: '술과 그날 밤 수면' })
  ).closest<HTMLElement>('[data-slot=card]')!;
  expect(
    within(card).getByText('관련성을 보여 줄 뿐, 원인을 판정하지 않습니다.'),
  ).toBeInTheDocument();
  const drank = within(card).getByText('술 마신 날 밤').closest('div')!;
  expect(drank).toHaveTextContent('표본 2일');
  expect(drank).toHaveTextContent('6시간');
  expect(within(card).getByText('안 마신 날 밤').closest('div')!).toHaveTextContent('표본 6일');
  expect(within(card).getByText(/한쪽 표본이 5일보다 적어/)).toBeInTheDocument();
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
  await screen.findByRole('heading', { name: '술과 그날 밤 수면' });
  expect(screen.queryByText(/한쪽 표본이/)).not.toBeInTheDocument();
});

test('a day without a record is a gap in the chart and says so in the table', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const chart = await screen.findByRole('img', { name: /수면 시간: 7일 중 6일 기록/ });
  expect(chart).toHaveAccessibleName('수면 시간: 7일 중 6일 기록, 가장 높은 날 7시간 40분');
  const figure = chart.closest('figure')!;
  const rows = within(figure).getAllByRole('row');
  // Header, then one row per day; 11/3 has no sleep record.
  expect(rows).toHaveLength(8);
  expect(rows[2]).toHaveTextContent('11/3기록 없음');
  expect(rows[1]).toHaveTextContent('11/26시간 40분');
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
  await screen.findByText('11월 2일 ~ 11월 8일');
  fireEvent.click(screen.getByRole('button', { name: '이전 주' }));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2026-10-26'),
  );
  expect(window.location.search).toBe('?period=week&date=2026-10-26');

  fireEvent.click(screen.getByRole('button', { name: '월간' }));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=month&date=2026-10-26'),
  );
  expect(await screen.findByText('11월 1일 ~ 11월 30일')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '월간' })).toHaveAttribute('aria-pressed', 'true');
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
  await screen.findByText('11월 2일 ~ 11월 8일');

  const previous = screen.getByRole('button', { name: '이전 주' });
  previous.focus();
  fireEvent.click(previous);
  await waitFor(() => expect(answers).toHaveLength(1));
  // While the next week is on its way the row stays, the earlier report marked busy.
  expect(previous).toBeInTheDocument();
  expect(previous).toHaveFocus();
  expect(screen.getByText('11월 2일 ~ 11월 8일').closest('[aria-busy]')).toBeNull();
  expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  answers[0]();
  expect(await screen.findByText('10월 26일 ~ 11월 1일')).toBeInTheDocument();
  expect(previous).toHaveFocus();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();

  const monthly = screen.getByRole('button', { name: '월간' });
  monthly.focus();
  fireEvent.click(monthly);
  await waitFor(() => expect(answers).toHaveLength(2));
  expect(monthly).toHaveFocus();
  expect(screen.getByRole('button', { name: '이전 달' })).toBeInTheDocument();
  answers[1]();
  expect(await screen.findByText('10월 1일 ~ 10월 31일')).toBeInTheDocument();
  expect(monthly).toHaveFocus();
});

test('pressing a period button twice before the answer moves two periods (#138)', async () => {
  let calls = 0;
  const fetchMock = serve(() =>
    ++calls === 1 ? json(reportOf()) : new Promise<Response>(() => {}),
  );
  render(<App />);
  await screen.findByText('11월 2일 ~ 11월 8일');
  const previous = screen.getByRole('button', { name: '이전 주' });
  fireEvent.click(previous);
  await waitFor(() => expect(window.location.search).toBe('?period=week&date=2026-10-26'));
  fireEvent.click(previous);
  await waitFor(() => expect(window.location.search).toBe('?period=week&date=2026-10-19'));
  await waitFor(() =>
    expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2026-10-19'),
  );
});

test('"이번 주" goes once the week is shown, and its focus moves to the period (#138)', async () => {
  serve((url) =>
    json(
      url.endsWith(`date=${today}`)
        ? reportOf()
        : reportOf({ current: { ...reportOf().current, from: '2026-10-26', to: '2026-11-01' } }),
    ),
  );
  window.history.replaceState(null, '', '/?period=week&date=2026-10-28');
  render(<App />);
  await screen.findByText('10월 26일 ~ 11월 1일');
  const thisWeek = screen.getByRole('button', { name: '이번 주' });
  thisWeek.focus();
  fireEvent.click(thisWeek);
  const span = await screen.findByText('11월 2일 ~ 11월 8일');
  expect(screen.queryByRole('button', { name: '이번 주' })).not.toBeInTheDocument();
  await waitFor(() => expect(span).toHaveFocus());
});

test('a failed report can be tried again', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: '서버 오류가 발생했습니다' }, 500) : json(reportOf())));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  fail = false;
  const retry = screen.getByRole('button', { name: '다시 시도' });
  retry.focus();
  fireEvent.click(retry);
  const span = await screen.findByText('11월 2일 ~ 11월 8일');
  // The button is gone, so focus moves to the period shown, not to the page (#128).
  await waitFor(() => expect(span).toHaveFocus());
});

test('a retry that fails again keeps focus on its button', async () => {
  let answer: (response: Response) => void = () => {};
  let calls = 0;
  serve(() =>
    ++calls === 1
      ? json({ error: '서버 오류가 발생했습니다' }, 500)
      : new Promise<Response>((resolve) => {
          answer = resolve;
        }),
  );
  render(<App />);
  await screen.findByRole('alert');
  const retry = screen.getByRole('button', { name: '다시 시도' });
  retry.focus();
  fireEvent.click(retry);
  // While the retry is on its way the button stays, marked busy, and keeps focus.
  await waitFor(() => expect(retry).toHaveAttribute('aria-disabled', 'true'));
  expect(retry).toHaveFocus();
  answer(json({ error: '서버 오류가 발생했습니다' }, 500));
  await waitFor(() => expect(retry).not.toHaveAttribute('aria-disabled'));
  expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
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
  const failure = () => json({ error: '서버 오류가 발생했습니다' }, 500);
  render(<App />);
  await waitFor(() => expect(answers).toHaveLength(1));
  answers[0](failure());
  const weekRetry = await screen.findByRole('button', { name: '다시 시도' });
  fireEvent.click(weekRetry);
  await waitFor(() => expect(answers).toHaveLength(2));

  // Months while the week's retry is on its way: that retry is over, its button is free again.
  fireEvent.click(screen.getByRole('button', { name: '월간' }));
  await waitFor(() => expect(answers).toHaveLength(3));
  answers[2](failure());
  const monthRetry = await screen.findByRole('button', { name: '다시 시도' });
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
      ? json({ error: '서버 오류가 발생했습니다' }, 500)
      : new Promise<Response>((resolve) => {
          answer = resolve;
        }),
  );
  render(<App />);
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  fireEvent.click(retry);
  await waitFor(() => expect(calls).toBe(2));
  const weekly = screen.getByRole('button', { name: '주간' });
  weekly.focus();
  answer(json(reportOf()));
  await screen.findByText('11월 2일 ~ 11월 8일');
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
  await screen.findByText('1999년 12월 27일 ~ 2000년 1월 2일');
  const previous = screen.getByRole('button', { name: '이전 주' });
  expect(previous).toHaveAttribute('aria-disabled', 'true');
  expect(previous).toHaveAccessibleDescription('2000-01-01부터 2099-12-31까지 기록할 수 있습니다');
  expect(screen.getByRole('button', { name: '다음 주' })).not.toHaveAttribute('aria-disabled');
  const before = reportCalls(fetchMock).length;
  fireEvent.click(previous);
  expect(window.location.search).toBe('?period=week&date=2000-01-01');
  expect(reportCalls(fetchMock)).toHaveLength(before);

  fireEvent.click(screen.getByRole('button', { name: '월간' }));
  await screen.findByText('2000년 1월 1일 ~ 1월 31일');
  expect(screen.getByRole('button', { name: '이전 달' })).toHaveAttribute('aria-disabled', 'true');

  window.history.pushState({}, '', '/?period=week&date=2099-12-31');
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByText('2099년 12월 28일 ~ 2100년 1월 3일');
  expect(screen.getByRole('button', { name: '다음 주' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: '이전 주' })).not.toHaveAttribute('aria-disabled');
  fireEvent.click(screen.getByRole('button', { name: '월간' }));
  await screen.findByText('2099년 12월 1일 ~ 12월 31일');
  expect(screen.getByRole('button', { name: '다음 달' })).toHaveAttribute('aria-disabled', 'true');
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
  await screen.findByText('2000년 1월 3일 ~ 1월 9일');
  fireEvent.click(screen.getByRole('button', { name: '이전 주' }));
  expect(await screen.findByText('1999년 12월 27일 ~ 2000년 1월 2일')).toBeInTheDocument();
  expect(reportCalls(fetchMock).at(-1)).toBe('/api/report?period=week&date=2000-01-01');
  expect(screen.queryByText(/기록할 수 있습니다:/)).not.toBeInTheDocument();
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
  await screen.findByRole('status', { name: '리포트 불러오는 중' });
  window.history.pushState(null, '', '/?period=week&date=1999-06-01');
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByText('2000-01-01부터 2099-12-31까지 기록할 수 있습니다: 1999-06-01');
  answer(json(reportOf()));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText('11월 2일 ~ 11월 8일')).not.toBeInTheDocument();
});

test('a date in the address outside the range is said, not shown as an empty report (#130)', async () => {
  const fetchMock = serve(() => json(reportOf()));
  window.history.replaceState(null, '', '/?period=week&date=1999-06-01');
  render(<App />);
  expect(
    await screen.findByText('2000-01-01부터 2099-12-31까지 기록할 수 있습니다: 1999-06-01'),
  ).toBeInTheDocument();
  expect(reportCalls(fetchMock)).toEqual([]);
  const move = await screen.findByRole('button', { name: '이번 주로 이동' });
  move.focus();
  fireEvent.click(move);
  const span = await screen.findByText('11월 2일 ~ 11월 8일');
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
  await screen.findByText('11월 2일 ~ 11월 8일');
  // Two of two against two of seven: the same count, but not the same share.
  expect(stat('술 마신 날')).toHaveTextContent('2일 (100%)');
  expect(stat('술 마신 날')).toHaveTextContent('지난주(7일)보다 +71%p');
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
  fireEvent.click(await screen.findByRole('button', { name: '월간' }));
  expect(await screen.findByText('11월 1일 ~ 11월 30일')).toBeInTheDocument();
  finishWeek(
    json(reportOf({ current: { ...reportOf().current, sleep: { days: 1, averageMinutes: 60 } } })),
  );
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByText('11월 1일 ~ 11월 30일')).toBeInTheDocument();
  expect(stat('평균 수면')).toHaveTextContent('7시간 30분');
});

test('a date in the address that does not exist falls back to the server date', async () => {
  const fetchMock = serve(() => json(reportOf()));
  window.history.replaceState(null, '', '/?period=week&date=2026-02-30');
  render(<App />);
  await screen.findByText('11월 2일 ~ 11월 8일');
  expect(reportCalls(fetchMock)).toEqual([`/api/report?period=week&date=${today}`]);
});

test('without the server date the page says why, instead of loading forever', async () => {
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve(
      new Response(JSON.stringify({ error: '데이터베이스에 연결할 수 없습니다' }), { status: 503 }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByText(/서버의 오늘 날짜를 알 수 없어/)).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: '리포트 불러오는 중' })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/report'))).toBe(false);
});

test('the tip of an edge bar hangs inward instead of past the card', async () => {
  serve(() => json(reportOf()));
  render(<App />);
  const chart = await screen.findByRole('img', { name: /수면 시간/ });
  const columns = [...chart.querySelectorAll('rect[fill="transparent"]')];
  fireEvent.mouseEnter(columns[0]);
  const tip = within(chart.closest('figure')!).getByText('11/2 · 6시간 40분');
  expect(tip.className).not.toContain('-translate-x-1/2');
  expect(tip.style.left).toBe('0%');
  fireEvent.mouseEnter(columns[6]);
  const last = within(chart.closest('figure')!).getByText('11/8 · 7시간 40분');
  expect(last.className).toContain('-translate-x-full');
  expect(last.style.left).toBe('100%');
  // The second bar from either end hangs inward too: the rule is the same on both sides.
  fireEvent.mouseEnter(columns[5]);
  expect(within(chart.closest('figure')!).getByText('11/7 · 7시간 30분').className).toContain(
    '-translate-x-full',
  );
  fireEvent.mouseEnter(columns[1]);
  expect(within(chart.closest('figure')!).getByText('11/3 · 기록 없음').className).not.toContain(
    '-translate-x',
  );
  fireEvent.mouseEnter(columns[3]);
  expect(within(chart.closest('figure')!).getByText('11/5 · 7시간 10분').className).toContain(
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
            : json({ error: '서버에 연결할 수 없습니다' }, 503),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByText('11월 2일 ~ 11월 8일');
  healthy = false;
  // Returning to the tab checks the server again.
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  expect(screen.getByText('11월 2일 ~ 11월 8일')).toBeInTheDocument();
  expect(stat('평균 수면')).toHaveTextContent('7시간 30분');
  expect(screen.queryByText(/서버의 오늘 날짜를 알 수 없어/)).not.toBeInTheDocument();
});
