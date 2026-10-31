import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';

const health = (body: object, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );

const open = (path: string) => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

test('the main menu opens the day the server counts as today', async () => {
  // Far from any real clock, so a browser-computed "today" would fail this.
  health({ today: '2026-03-15' });
  render(<App />);
  const menu = screen.getByRole('navigation', { name: '주 메뉴' });
  fireEvent.click(within(menu).getByRole('link', { name: '하루 기록' }));
  expect(await screen.findByText('2026년 3월 15일 일요일')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-15');
  expect(within(menu).getByRole('link', { name: '하루 기록' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the previous and next day links move across a month boundary', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-02-28');
  fireEvent.click(screen.getByRole('link', { name: '다음 날' }));
  expect(await screen.findByText('2026년 3월 1일 일요일')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '이전 날' }));
  expect(await screen.findByText('2026년 2월 28일 토요일')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-02-28');
});

test('the today link returns to the server date and hides once there', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-01-01');
  fireEvent.click(await screen.findByRole('link', { name: '오늘' }));
  expect(await screen.findByText('2026년 3월 15일 일요일')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '오늘' })).not.toBeInTheDocument();
});

test('picking a date opens that day', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  fireEvent.change(screen.getByLabelText('날짜 선택'), { target: { value: '2026-03-02' } });
  expect(await screen.findByText('2026년 3월 2일 월요일')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-02');
});

test('a year still being typed does not change the page', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('날짜 선택');
  fireEvent.change(input, { target: { value: '0002-03-15' } });
  expect(window.location.pathname).toBe('/daily/2026-03-15');
  expect(input).toHaveValue('0002-03-15');
  fireEvent.blur(input);
  expect(input).toHaveValue('2026-03-15');
});

test('a date that does not exist shows an error with a way back', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-02-30');
  expect(screen.getByRole('alert')).toHaveTextContent('없는 날짜입니다: 2026-02-30');
  expect(screen.queryByRole('heading', { level: 2, name: '수면' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '오늘 기록으로 이동' }));
  expect(await screen.findByText('2026년 3월 15일 일요일')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/daily/2026-03-15');
});

test('without the server, today is reported as an error instead of guessed', async () => {
  health({ error: '데이터베이스에 연결할 수 없습니다' }, 503);
  open('/daily');
  expect(await screen.findByRole('alert')).toHaveTextContent('데이터베이스에 연결할 수 없습니다');
  expect(window.location.pathname).toBe('/daily');
});

test('a day shows a place for each record kind', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  for (const name of ['수면', '식단', '술·담배', '하루 체크', '병원·약']) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  }
});
