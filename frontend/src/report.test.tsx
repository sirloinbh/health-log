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

const serve = (report: (url: string) => Response | Promise<Response>) => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith('/api/report') ? report(url) : new Response(JSON.stringify({ today })),
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
  expect(stat('평균 수면')).toHaveTextContent('기록한 날 4일 · 지난주보다 +30분');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('1,850kcal');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('칼로리를 모르는 날 1일 제외');
  expect(stat('하루 평균 칼로리')).toHaveTextContent('지난주 기록 없음');
  expect(stat('술 마신 날')).toHaveTextContent('2일');
  expect(stat('하루 평균 흡연')).toHaveTextContent('4.5개비');
  expect(stat('하루 평균 흡연')).toHaveTextContent('합계 9개비');
  expect(stat('식단 지킴')).toHaveTextContent('75%');
  expect(stat('식단 지킴')).toHaveTextContent('체크한 날 4일 · 지난주보다 -25%p');
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
    await screen.findByRole('heading', { name: '술과 다음 날 수면' })
  ).closest<HTMLElement>('[data-slot=card]')!;
  expect(
    within(card).getByText('관련성을 보여 줄 뿐, 원인을 판정하지 않습니다.'),
  ).toBeInTheDocument();
  const drank = within(card).getByText('술 마신 다음 날 밤').closest('div')!;
  expect(drank).toHaveTextContent('표본 2일');
  expect(drank).toHaveTextContent('6시간');
  expect(within(card).getByText('안 마신 다음 날 밤').closest('div')!).toHaveTextContent(
    '표본 6일',
  );
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
  await screen.findByRole('heading', { name: '술과 다음 날 수면' });
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

test('a failed report can be tried again', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: '서버 오류가 발생했습니다' }, 500) : json(reportOf())));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('11월 2일 ~ 11월 8일')).toBeInTheDocument();
});
