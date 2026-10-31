import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

test('a server error is reported instead of guessing today', async () => {
  health({ error: '서버 오류가 발생했습니다' }, 500);
  open('/daily');
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(window.location.pathname).toBe('/daily');
});

test('an unreachable server is reported instead of guessing today', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
  open('/daily');
  expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  expect(window.location.pathname).toBe('/daily');
});

test('an app left open past midnight picks up the new today', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  await screen.findByText('2026년 3월 15일 일요일');
  await act(() => Promise.resolve());
  expect(screen.queryByRole('link', { name: '오늘' })).not.toBeInTheDocument();

  health({ today: '2026-03-16' });
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  fireEvent.click(await screen.findByRole('link', { name: '오늘' }));
  expect(await screen.findByText('2026년 3월 16일 월요일')).toBeInTheDocument();
});

test('returning to the tab checks today again', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  await act(() => Promise.resolve());

  health({ today: '2026-03-16' });
  fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByRole('link', { name: '오늘' })).toHaveAttribute(
    'href',
    '/daily/2026-03-16',
  );
});

test('a slow older response does not overwrite a newer today', async () => {
  const respond = (today: string) => new Response(JSON.stringify({ today }));
  let finishFirst = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementation(() => Promise.resolve(respond('2026-03-16'))),
  );
  open('/daily/2026-03-16');
  fireEvent(document, new Event('visibilitychange'));
  await act(() => Promise.resolve());

  await act(async () => {
    finishFirst(respond('2026-03-15'));
    await Promise.resolve();
  });
  await act(() => Promise.resolve());
  expect(screen.queryByRole('link', { name: '오늘' })).not.toBeInTheDocument();
});

test('moving to another day is announced to screen readers', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  // A live region announces changes only if the same element stays and its text changes.
  const region = screen.getByText('2026년 3월 15일 일요일');
  expect(region).toHaveAttribute('aria-live', 'polite');
  fireEvent.click(screen.getByRole('link', { name: '다음 날' }));
  await screen.findByText('2026년 3월 16일 월요일');
  expect(region).toBeInTheDocument();
  expect(region).toHaveTextContent('2026년 3월 16일 월요일');
});

test('going back ends a typed edit, so the field matches the page and history stays intact', async () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('날짜 선택');
  fireEvent.change(input, { target: { value: '2026-12-25' } });
  await screen.findByText('2026년 12월 25일 금요일');

  window.history.back();
  await screen.findByText('2026년 3월 15일 일요일');
  expect(input).toHaveValue('2026-03-15');

  // A new edit must add an entry, not replace the day we came back to.
  fireEvent.change(input, { target: { value: '2026-03-20' } });
  await screen.findByText('2026년 3월 20일 금요일');
  window.history.back();
  await screen.findByText('2026년 3월 15일 일요일');
  window.history.forward();
  await screen.findByText('2026년 3월 20일 금요일');
});

test('the date input limits the year to four digits', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  expect(screen.getByLabelText('날짜 선택')).toHaveAttribute('max', '9999-12-31');
});

test('typing the date already shown leaves no history entry', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('날짜 선택');
  const before = window.history.length;
  fireEvent.change(input, { target: { value: '0202-03-15' } });
  fireEvent.change(input, { target: { value: '2026-03-15' } });
  expect(window.history.length).toBe(before);
  expect(input).toHaveValue('2026-03-15');
});

test('typing a date leaves one history entry and blur starts a new one', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  const input = screen.getByLabelText('날짜 선택');
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

test('a day shows a place for each record kind', () => {
  health({ today: '2026-03-15' });
  open('/daily/2026-03-15');
  for (const name of ['수면', '식단', '술·담배', '하루 체크', '병원·약']) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  }
});
