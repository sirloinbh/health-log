import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { findLive, getLive, queryLive } from './test/live';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

// /api/foods/mfds goes to `mfds`, the stored food list and saves to `foods`.
const serve = (mfds: Handler, foods: Handler = () => json({ foods: [] })) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/foods/mfds')
        ? mfds(url, init)
        : url.startsWith('/api/foods')
          ? foods(url, init)
          : json({ today: '2026-11-28' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const openAdd = async () => {
  window.history.replaceState(null, '', '/foods');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  return screen.findByRole('dialog');
};

const shinCup = {
  code: 'P108-001000300-0738',
  name: '신라면건면사발',
  maker: '(주)농심',
  group: '가공식품',
  basis: '100g',
  total: '77g',
  updatedOn: '2026-05-14',
  food: {
    name: '신라면건면사발 77g',
    brand: '농심',
    servingSize: 77,
    servingUnit: 'g',
    calories: 284.9,
    carbs: 54,
    protein: 7,
    fat: 4.4,
    sugars: null,
    sodium: 1630.09,
    sourceType: 'public',
    sourceUrl:
      'https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd=P108-001000300-0738&searchRegionCd=ZZ&searchMonthCd=AVG',
  },
};

const mfdsCalls = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/foods/mfds'));
const posts = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

test('a picked MFDS match fills the form, and nothing is saved until Save is pressed', async () => {
  const fetchMock = serve(
    () => json({ state: 'ok', total: 53, read: 20, results: [shinCup] }),
    (_url, init) =>
      init?.method === 'POST' ? json({ ...shinCup.food, id: 9 }, 201) : json({ foods: [] }),
  );
  const dialog = await openAdd();
  fireEvent.change(within(dialog).getByLabelText('MFDS food name'), {
    target: { value: ' 신라면 ' },
  });
  fireEvent.change(within(dialog).getByLabelText('MFDS maker (optional)'), {
    target: { value: '농심' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));

  const list = await within(dialog).findByRole('list', { name: 'MFDS matches' });
  expect(mfdsCalls(fetchMock).at(-1)?.[0]).toBe(
    `/api/foods/mfds?q=${encodeURIComponent('신라면')}&maker=${encodeURIComponent('농심')}`,
  );
  expect(
    within(list).getByText(
      '(주)농심 · 가공식품 · 77g · 284.9kcal · carbs 54g, protein 7g, fat 4.4g',
    ),
  ).toBeInTheDocument();
  expect(getLive('status', dialog)).toHaveTextContent(
    'The database has 53 matches and only the first 20 were read',
  );

  fireEvent.click(within(list).getByRole('button', { name: 'Use 신라면건면사발' }));
  const summary = getLive('status', dialog);
  expect(summary).toHaveTextContent('Filled in from the MFDS database: 신라면건면사발');
  expect(summary).toHaveTextContent('converted to the total content (77g)');
  expect(summary).toHaveTextContent('The database has no value for: Sugars');
  expect(within(dialog).getByLabelText('Food name')).toHaveValue('신라면건면사발 77g');
  expect(within(dialog).getByLabelText('Brand')).toHaveValue('농심');
  expect(within(dialog).getByLabelText('Serving size')).toHaveValue('77');
  expect(within(dialog).getByLabelText('Calories (kcal)')).toHaveValue('284.9');
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('');
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent(
    'Public data',
  );
  expect(within(dialog).getByLabelText('Verified date')).not.toHaveValue('');
  // Searching and picking save nothing.
  expect(posts(fetchMock)).toHaveLength(0);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
  expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toMatchObject({
    name: '신라면건면사발 77g',
    brand: '농심',
    servingSize: 77,
    servingUnit: 'g',
    calories: 284.9,
    sugars: null,
    sodium: 1630.09,
    sourceType: 'public',
    sourceUrl: shinCup.food.sourceUrl,
  });
  // Only the app's own API was called: the browser never talks to the portal.
  expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true);
});

test('Enter in the search field searches and does not save the food', async () => {
  const fetchMock = serve(() => json({ state: 'ok', total: 0, read: 0, results: [] }));
  const dialog = await openAdd();
  const field = within(dialog).getByLabelText('MFDS food name');
  fireEvent.change(field, { target: { value: 'zzqq' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(await findLive('status', dialog)).toHaveTextContent(
    'No food in the MFDS database matches',
  );
  expect(mfdsCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods/mfds?q=zzqq');
  expect(posts(fetchMock)).toHaveLength(0);
  expect(queryLive('alert', dialog)).toBeNull();
});

test('an empty search term asks for a name and calls nothing', async () => {
  const fetchMock = serve(() => json({ state: 'ok', total: 0, read: 0, results: [] }));
  const dialog = await openAdd();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));
  expect(getLive('alert', dialog)).toHaveTextContent('Enter a food name to search for');
  expect(mfdsCalls(fetchMock)).toHaveLength(0);
});

test('without a server key the lookup says it is not set up', async () => {
  serve(() => json({ state: 'off' }));
  const dialog = await openAdd();
  fireEvent.change(within(dialog).getByLabelText('MFDS food name'), { target: { value: '우유' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));
  expect(await findLive('status', dialog)).toHaveTextContent('The MFDS lookup is not set up');
});

test('when the portal cannot answer it says so, and the same search again asks again', async () => {
  let answer: object = { state: 'unavailable' };
  const fetchMock = serve(() => json(answer));
  const dialog = await openAdd();
  fireEvent.change(within(dialog).getByLabelText('MFDS food name'), { target: { value: '우유' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));
  expect(await findLive('status', dialog)).toHaveTextContent(
    'The MFDS database cannot be reached right now',
  );
  answer = { state: 'ok', total: 1, read: 1, results: [shinCup] };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));
  expect(await within(dialog).findByRole('list', { name: 'MFDS matches' })).toBeInTheDocument();
  expect(mfdsCalls(fetchMock)).toHaveLength(2);
});

test('a rejected search shows the server message', async () => {
  serve(() => json({ error: 'The food name must be 50 characters or fewer' }, 400));
  const dialog = await openAdd();
  fireEvent.change(within(dialog).getByLabelText('MFDS food name'), {
    target: { value: '가'.repeat(51) },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search MFDS' }));
  expect(await findLive('alert', dialog)).toHaveTextContent(
    'The food name must be 50 characters or fewer',
  );
});

test('editing a stored food does not offer the MFDS lookup', async () => {
  serve(
    () => json({ state: 'off' }),
    () =>
      json({
        foods: [{ ...shinCup.food, id: 3, category: null, checkedOn: '2026-11-28', isJunk: false }],
      }),
  );
  window.history.replaceState(null, '', '/foods');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 신라면건면사발 77g' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByLabelText('MFDS food name')).not.toBeInTheDocument();
});
