import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';

import { toast } from './components/ui/sonner';
import type { IntakeDay } from './intake-text';
import type { FoodOption } from './meal-entry';
import { QuickEntryPage } from './quick-entry';
import { renderWithQuery } from './test/query';

const today = '2026-11-26';

const intakeDay = (water: number): IntakeDay => {
  const none = { count: 0, amount: 0 };
  return {
    date: today,
    kinds: {
      water: { count: water, amount: water * 250 },
      coffee: none,
      tea: none,
      energy: none,
      other_caffeine: none,
    },
    waterMl: water * 250,
    caffeineMg: 0,
  };
};

const food = (id: number, name: string, calories: number | null, isJunk = false): FoodOption => ({
  id,
  name,
  brand: null,
  servingSize: 1,
  servingUnit: 'bowl',
  calories,
  isJunk,
});
const recent = [food(7, 'Kimchi stew', 450), food(9, 'Ramen', 500, true)];

// The meal day the add answers with; the page only needs it to be a day.
const mealDay = {
  date: today,
  entries: [],
  times: { breakfast: null, lunch: null, dinner: null, snack: null },
  totals: {},
  junk: { week: {}, month: {} },
};

type Sent = { url: string; method: string; body: unknown; headers: Headers };

/** Answers the page's reads and writes; `sent` keeps every request in order. */
const serve = ({
  foods = recent,
  water = 0,
  failMeal = false,
}: { foods?: FoodOption[]; water?: number; failMeal?: boolean } = {}) => {
  const sent: Sent[] = [];
  let cups = water;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      sent.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });
      const reply = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (url === '/api/foods/recent') return reply({ foods });
      if (url === `/api/intake/${today}` && method === 'GET') return reply(intakeDay(cups));
      if (url === `/api/intake/${today}` && method === 'POST') return reply(intakeDay(++cups), 201);
      if (url === `/api/intake/${today}/water` && method === 'DELETE')
        return reply(intakeDay(--cups));
      if (url === `/api/meals/${today}` && method === 'POST')
        return failMeal ? reply({ error: 'Server broke' }, 500) : reply(mealDay, 201);
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }),
  );
  return sent;
};

const renderPage = (
  health: Parameters<typeof QuickEntryPage>[0]['health'] = { state: 'ok', today },
) =>
  renderWithQuery(
    <MemoryRouter>
      <QuickEntryPage health={health} />
    </MemoryRouter>,
  );

/** The device clock at `time` in Seoul; only Date is faked, so timers and promises run as usual. */
const at = (time: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${today}T${time}:00+09:00`));
};

afterEach(() => {
  vi.useRealTimers();
});

test('the meal for the time of day is chosen, and a tap records one serving in it', async () => {
  at('12:30');
  const success = vi.spyOn(toast, 'success').mockImplementation(() => '');
  const sent = serve();
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Quick entry' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Breakfast' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Add Kimchi stew to lunch' }));
  await waitFor(() => expect(success).toHaveBeenCalledWith('Recorded'));
  const add = sent.find(({ method, url }) => method === 'POST' && url === `/api/meals/${today}`)!;
  expect(add.body).toEqual({ meal: 'lunch', servings: 1, foodId: 7 });
  // Sent with a key, so a retry after no answer is not recorded twice (#196).
  expect(add.headers.get('Idempotency-Key')).toBeTruthy();
});

test('another meal can be chosen before the tap', async () => {
  at('22:10');
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  const sent = serve();
  renderPage();
  expect(screen.getByRole('button', { name: 'Snack' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Dinner' }));
  expect(screen.getByText('A tap records one serving in dinner for today.')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Add Ramen to dinner' }));
  await waitFor(() =>
    expect(
      sent.some(
        ({ method, body }) => method === 'POST' && (body as { meal?: string })?.meal === 'dinner',
      ),
    ).toBe(true),
  );
});

test('a failed add says why next to the foods', async () => {
  at('08:00');
  serve({ failMeal: true });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Add Kimchi stew to breakfast' }));
  expect(await screen.findByText(/Server broke/)).toBeInTheDocument();
});

test('water goes up and down one cup at a time, and minus is off at 0', async () => {
  const sent = serve();
  renderPage();
  const water = (await screen.findByRole('heading', { name: 'Water' })).closest<HTMLElement>(
    '[data-slot=card]',
  )!;
  expect(await within(water).findByText('0 cups · 0 ml')).toBeInTheDocument();
  expect(within(water).getByRole('button', { name: 'Remove one water' })).toBeDisabled();
  fireEvent.click(within(water).getByRole('button', { name: 'Add one water' }));
  expect(await within(water).findByText('1 cup · 250 ml')).toBeInTheDocument();
  expect(sent.find(({ method }) => method === 'POST')).toMatchObject({
    url: `/api/intake/${today}`,
    body: { kind: 'water' },
  });
  fireEvent.click(within(water).getByRole('button', { name: 'Remove one water' }));
  expect(await within(water).findByText('0 cups · 0 ml')).toBeInTheDocument();
});

test('with no recent foods it points to the daily record', async () => {
  serve({ foods: [] });
  renderPage();
  expect(await screen.findByText(/No recent foods yet/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'daily record' })).toHaveAttribute(
    'href',
    `/daily/${today}`,
  );
});

test('before the server gives today, nothing can be recorded', () => {
  serve();
  renderPage({ state: 'loading' });
  expect(screen.getByText('Checking server…')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Water' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Meal' })).not.toBeInTheDocument();
});
