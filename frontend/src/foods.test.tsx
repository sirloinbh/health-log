import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';

const food = {
  id: 1,
  name: '치즈버거',
  brand: '샘플버거',
  category: null,
  servingSize: 120,
  servingUnit: 'g',
  calories: 300,
  carbs: 0,
  protein: 15.5,
  fat: null,
  sugars: null,
  sodium: null,
  sourceType: 'official',
  sourceUrl: 'https://example.com/menu',
  checkedOn: '2026-10-31',
  isJunk: false,
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

const serve = (foods: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/foods') ? foods(url, init) : json({ today: '2026-10-31' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = () => {
  window.history.replaceState(null, '', '/foods');
  render(<App />);
};

const foodCalls = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/foods'));

test('the main menu opens the foods page', async () => {
  serve(() => json({ foods: [] }));
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Foods' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Foods' })).toBeInTheDocument();
  expect(await screen.findByText('No foods')).toBeInTheDocument();
});

test('a food shows its numbers, separates zero from no value, and links its source', async () => {
  serve(() => json({ foods: [food] }));
  open();
  const heading = await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  const card = heading.closest<HTMLElement>('[data-slot=card]')!;
  expect(within(card).getByText('샘플버거 · Serving 120g')).toBeInTheDocument();
  expect(within(card).getByText('300kcal')).toBeInTheDocument();
  expect(within(card).getByText('0g')).toBeInTheDocument();
  expect(within(card).getAllByText('No value')).toHaveLength(3);
  expect(within(card).getByText('Official data')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'View source' })).toHaveAttribute(
    'href',
    'https://example.com/menu',
  );
});

test('a source address that is not http is not turned into a link', async () => {
  serve(() => json({ foods: [{ ...food, sourceUrl: 'javascript:alert(1)' }] }));
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  expect(screen.queryByRole('link', { name: 'View source' })).not.toBeInTheDocument();
});

test('searching sends the encoded words', async () => {
  const fetchMock = serve(() => json({ foods: [] }));
  open();
  await screen.findByText('No foods');
  fireEvent.change(screen.getByLabelText('Search foods'), { target: { value: '와퍼 100%' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=%EC%99%80%ED%8D%BC%20100%25'),
  );
});

test('a slow older search does not overwrite a newer one', async () => {
  let finishOld = (_response: Response) => {};
  serve((url) => {
    if (url === '/api/foods?q=') return json({ foods: [] });
    if (url.endsWith('old')) return new Promise((resolve) => (finishOld = resolve));
    return json({ foods: [food] });
  });
  open();
  await screen.findByText('No foods');
  const search = screen.getByLabelText('Search foods');
  fireEvent.change(search, { target: { value: 'old' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.change(search, { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });

  finishOld(json({ foods: [] }));
  await new Promise((resolve) => setTimeout(resolve));
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
});

test('adding sends blanks as no value, then shows the list again', async () => {
  let saved = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(food, 201);
    }
    return json({ foods: saved ? [food] : [] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('Serving size'), { target: { value: '120' } });
  fireEvent.change(within(dialog).getByLabelText('Calories (kcal)'), { target: { value: '0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const post = foodCalls(fetchMock).find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({
    name: '치즈버거',
    brand: null,
    servingSize: 120,
    servingUnit: 'g',
    calories: 0,
    sodium: null,
    sourceType: 'manual',
    sourceUrl: null,
    checkedOn: null,
    isJunk: false,
  });
});

test('a server rejection keeps the form open with the Korean message and the typed values', async () => {
  serve((_url, init) =>
    init?.method === 'POST' ? json({ error: 'Enter a serving size' }, 400) : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '치즈버거' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a serving size');
  expect(within(dialog).getByLabelText('Food name')).toHaveValue('치즈버거');
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('editing starts from the food and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json({ ...food, calories: 310 }) : json({ foods: [food] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 치즈버거' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('Calories (kcal)')).toHaveValue('300');
  expect(within(dialog).getByLabelText('Fat (g)')).toHaveValue('');
  expect(within(dialog).getByLabelText('Verified date')).toHaveValue('2026-10-31');
  fireEvent.change(within(dialog).getByLabelText('Calories (kcal)'), { target: { value: '310' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'PUT')).toBe(true),
  );
  const put = foodCalls(fetchMock).find(([, init]) => init?.method === 'PUT')!;
  expect(put[0]).toBe('/api/foods/1');
  expect(JSON.parse(String(put[1]?.body))).toMatchObject({
    calories: 310,
    fat: null,
    sourceType: 'official',
    sourceUrl: 'https://example.com/menu',
  });
});

test.each([
  'Serving size',
  'Calories (kcal)',
  'Carbs (g)',
  'Protein (g)',
  'Fat (g)',
  'Sugars (g)',
  'Sodium (mg)',
])('a comma decimal in %s is refused, never read as ten times the value', async (label) => {
  const fetchMock = serve(() => json({ foods: [] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('Serving size'), { target: { value: '120' } });
  const field = within(dialog).getByLabelText(label);
  fireEvent.change(field, { target: { value: '49,5' } });
  // A number field would have dropped the comma and shown 495 here.
  expect(field).toHaveValue('49,5');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    `${label}: enter digits only. Use a period for the decimal point`,
  );
  expect(field).toHaveValue('49,5');
  expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'POST')).toBe(false);
});

test('a decimal written with a point is sent as that number', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(food, 201) : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '치즈버거' } });
  fireEvent.change(within(dialog).getByLabelText('Serving size'), { target: { value: ' 49.5 ' } });
  fireEvent.change(within(dialog).getByLabelText('Protein (g)'), { target: { value: '15.25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await vi.waitFor(() =>
    expect(foodCalls(fetchMock).some(([, init]) => init?.method === 'POST')).toBe(true),
  );
  const post = foodCalls(fetchMock).find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({ servingSize: 49.5, protein: 15.25 });
});

test('a save in progress cannot be cancelled or closed', async () => {
  let finish = (_response: Response) => {};
  serve((_url, init) =>
    init?.method === 'POST' ? new Promise((resolve) => (finish = resolve)) : json({ foods: [] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('button', { name: 'Saving…' });

  const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
  expect(cancel).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(cancel);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  finish(json(food, 201));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a save is confirmed even when the current search hides the food', async () => {
  // Toasts outlive a test in sonner's global store, so check the call rather than the text.
  const success = vi.spyOn(toast, 'success');
  serve((_url, init) => (init?.method === 'POST' ? json(food, 201) : json({ foods: [] })));
  open();
  await screen.findByText('No foods');
  fireEvent.click(screen.getByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Saved'));
  expect(await screen.findByText('No foods')).toBeInTheDocument();
});

test('saving reloads the search on screen, not words typed but not searched', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(food, 201) : json({ foods: [] }),
  );
  open();
  await screen.findByText('No foods');
  const search = screen.getByLabelText('Search foods');
  fireEvent.change(search, { target: { value: 'applied' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=applied'));
  fireEvent.change(search, { target: { value: 'typed' } });

  fireEvent.click(screen.getByRole('button', { name: 'Add food' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=applied'));
});

test('after a failed search, saving reloads the search the list still shows', async () => {
  const fetchMock = serve((url, init) => {
    if (init?.method === 'PUT') return json(food);
    if (url.endsWith('q=broken')) return json({ error: 'Server error occurred' }, 500);
    return json({ foods: [food] });
  });
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  const search = screen.getByLabelText('Search foods');
  fireEvent.change(search, { target: { value: 'shown' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=shown'));
  fireEvent.change(search, { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByRole('alert');

  fireEvent.click(screen.getByRole('button', { name: 'Edit 치즈버거' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await vi.waitFor(() => expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=shown'));
});

test('a failed load shows the server message', async () => {
  serve(() => json({ error: 'Server error occurred' }, 500));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(screen.queryByText('No foods')).not.toBeInTheDocument();
});

test('a long list says more foods are waiting and adds the next page below', async () => {
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null })
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  expect(screen.getByText('Showing 1 foods. There are more.')).toBeInTheDocument();

  const more = screen.getByRole('button', { name: 'Show more results' });
  more.focus();
  fireEvent.click(more);
  expect(await screen.findByRole('heading', { level: 2, name: '피자' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(foodCalls(fetchMock).at(-1)?.[0]).toBe('/api/foods?q=&offset=100');
  expect(screen.queryByRole('button', { name: 'Show more results' })).not.toBeInTheDocument();
  // With the button gone, focus lands on the line that says how many foods are shown.
  await vi.waitFor(() => expect(screen.getByText('2 foods')).toHaveFocus());
});

test('while the next page loads, the button keeps the focus and ignores presses', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? new Promise((resolve) => (finish = resolve))
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  const more = await screen.findByRole('button', { name: 'Show more results' });
  more.focus();
  fireEvent.click(more);
  await vi.waitFor(() => expect(more).toHaveAttribute('aria-disabled', 'true'));
  // Not `disabled`: a disabled button drops the keyboard focus to the start of the page.
  expect(more).not.toBeDisabled();
  expect(more).toHaveFocus();
  fireEvent.click(more);
  expect(foodCalls(fetchMock).filter(([url]) => url.includes('offset='))).toHaveLength(1);
  finish(json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: 200 }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  expect(more).not.toHaveAttribute('aria-disabled');
});

test('after the last page, focus moved elsewhere while waiting stays there', async () => {
  let finish = (_response: Response) => {};
  serve((url) =>
    url.endsWith('offset=100')
      ? new Promise((resolve) => (finish = resolve))
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  const more = await screen.findByRole('button', { name: 'Show more results' });
  more.focus();
  fireEvent.click(more);
  const search = screen.getByLabelText('Search foods');
  search.focus();
  finish(json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  await new Promise((resolve) => setTimeout(resolve));
  expect(search).toHaveFocus();
});

test('a next page leaves the message of a failed search in place', async () => {
  serve((url) => {
    if (url.endsWith('q=broken')) return json({ error: 'The search failed' }, 500);
    return url.includes('offset=')
      ? json({ foods: [{ ...food, id: 2, name: '피자' }], nextOffset: null })
      : json({ foods: [food], nextOffset: 100 });
  });
  open();
  await screen.findByRole('heading', { level: 2, name: '치즈버거' });
  fireEvent.change(screen.getByLabelText('Search foods'), { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The search failed');

  fireEvent.click(screen.getByRole('button', { name: 'Show more results' }));
  await screen.findByRole('heading', { level: 2, name: '피자' });
  // The list is still the answer to the earlier words, so the failure must stay in view.
  expect(screen.getByRole('alert')).toHaveTextContent('The search failed');
});

test('a failed next page keeps the list and the button to try again', async () => {
  serve((url) =>
    url.endsWith('offset=100')
      ? json({ error: 'Server error occurred' }, 500)
      : json({ foods: [food], nextOffset: 100 }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Show more results' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(screen.getByRole('heading', { level: 2, name: '치즈버거' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show more results' })).not.toHaveAttribute(
    'aria-disabled',
  );
});

// Focuses the button first, as a keyboard user would; a pointer click does not in every browser.
const openWith = async (name: string) => {
  const opener = await screen.findByRole('button', { name });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: await screen.findByRole('dialog') };
};

test('cancelling the add dialog returns focus to the add button', async () => {
  serve(() => json({ foods: [] }));
  open();
  const { opener, dialog } = await openWith('Add food');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());
});

test('closing the edit dialog with Escape returns focus to that food’s edit button', async () => {
  serve(() => json({ foods: [food, { ...food, id: 2, name: '감자튀김' }] }));
  open();
  const { opener, dialog } = await openWith('Edit 치즈버거');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await vi.waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('saving returns focus to the edit button while the food is still listed', async () => {
  serve((_url, init) => (init?.method === 'PUT' ? json(food) : json({ foods: [food] })));
  open();
  const { dialog } = await openWith('Edit 치즈버거');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit 치즈버거' })).toHaveFocus(),
  );
});

test('a saved food the search no longer finds leaves focus on the page title, not the body', async () => {
  let saved = false;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json({ ...food, name: '더블버거' });
    }
    return json({ foods: saved ? [] : [food] });
  });
  open();
  const { dialog } = await openWith('Edit 치즈버거');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('No foods')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Foods' })).toHaveFocus(),
  );
});

test('a slow reload that drops the saved food still leaves focus on the page title', async () => {
  let saved = false;
  let finishReload: (() => void) | undefined;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json({ ...food, name: '더블버거' });
    }
    if (!saved) return json({ foods: [food] });
    // Slower than the dialog's close, so focus is back on the edit button when the list changes.
    return new Promise<Response>((resolve) => (finishReload = () => resolve(json({ foods: [] }))));
  });
  open();
  const { opener, dialog } = await openWith('Edit 치즈버거');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());

  // The reload has to be on its way, or finishing it would do nothing.
  await vi.waitFor(() => expect(finishReload).toBeDefined());
  finishReload?.();
  expect(await screen.findByText('No foods')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Foods' })).toHaveFocus(),
  );
});

test('once focus has moved on from the edit button, a later redraw leaves it alone', async () => {
  serve((url) => json({ foods: url === '/api/foods?q=' ? [food] : [] }));
  open();
  const { opener, dialog } = await openWith('Edit 치즈버거');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());

  // Typing in the search field moves focus on. A mouse click on the 검색 (search) button that does not focus the
  // button (as in Safari) then leaves focus on <body> while the search removes the card.
  const field = screen.getByRole('searchbox', { name: 'Search foods' });
  field.focus();
  fireEvent.change(field, { target: { value: '없는음식' } });
  field.blur();
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('No foods')).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole('heading', { level: 1, name: 'Foods' })).not.toHaveFocus();
});

// #38
test('a food can be marked junk food, shown on its card, and the edit starts from the mark', async () => {
  let current = food;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'PUT') {
      current = { ...food, ...(JSON.parse(String(init.body)) as object) };
      return json(current);
    }
    return json({ foods: [current] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 치즈버거' }));
  let dialog = await screen.findByRole('dialog');
  const mark = within(dialog).getByRole('checkbox', { name: 'Junk food' });
  expect(mark).not.toBeChecked();
  expect(mark).toHaveAccessibleDescription(/meals already recorded as they are/);
  fireEvent.click(mark);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = foodCalls(fetchMock).find(([, init]) => init?.method === 'PUT')!;
  expect(JSON.parse(String(put[1]?.body))).toMatchObject({ isJunk: true });
  const card = (await screen.findByRole('heading', { level: 2, name: '치즈버거' })).closest(
    '[data-slot="card"]',
  ) as HTMLElement;
  expect(await within(card).findByText('Junk food')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Edit 치즈버거' }));
  dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('checkbox', { name: 'Junk food' })).toBeChecked();
});

test('while saving and after a failed save, keyboard focus stays in the dialog', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? new Promise((resolve) => (finish = resolve)) : json({ foods: [] }),
  );
  open();
  const { dialog } = await openWith('Add food');
  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '김밥' } });
  fireEvent.change(within(dialog).getByLabelText('Serving size'), { target: { value: '1' } });
  const save = within(dialog).getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);

  const busy = await within(dialog).findByRole('button', { name: 'Saving…' });
  expect(busy).toBe(save);
  expect(busy).toHaveAttribute('aria-disabled', 'true');
  expect(busy).toHaveFocus();
  // A second press while busy sends nothing more.
  fireEvent.click(busy);
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);

  finish(json({ error: 'This item already exists' }, 409));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('This item already exists');
  expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
  expect(within(dialog).getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
});

test('Enter in a field while saving sends nothing more, and the same failure twice is said twice', async () => {
  const finishers: ((response: Response) => void)[] = [];
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST'
      ? new Promise((resolve) => finishers.push(resolve))
      : json({ foods: [] }),
  );
  open();
  const { dialog } = await openWith('Add food');
  const name = within(dialog).getByLabelText('Food name');
  fireEvent.change(name, { target: { value: '김밥' } });
  fireEvent.change(within(dialog).getByLabelText('Serving size'), { target: { value: '1' } });
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('button', { name: 'Saving…' });
  // Enter in a field submits the form.
  fireEvent.submit(name.closest('form')!);
  expect(posts()).toHaveLength(1);

  finishers[0](json({ error: 'This item already exists' }, 409));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('This item already exists');

  // A second try clears the message, so the same answer appears anew and is read out again.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('button', { name: 'Saving…' });
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  finishers[1](json({ error: 'This item already exists' }, 409));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('This item already exists');
  expect(posts()).toHaveLength(2);
});

const label = `총 내용량 90g
1봉지(45g)당 230kcal
나트륨 210mg 탄수화물 25g 당류 1g 미만 지방 13g 트랜스지방 0g 포화지방 4g 단백질 3g`;

test('a pasted nutrition table fills the form, and nothing is saved until Save is pressed', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json({ ...food, id: 2 }, 201) : json({ foods: [] }),
  );
  open();
  const { dialog } = await openWith('Add food');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    target: { value: label },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read the table and fill in' }));

  const summary = within(dialog).getByRole('status');
  expect(summary).toHaveTextContent(
    'Filled in: Serving size, Calories, Carbs, Protein, Fat, Sodium',
  );
  expect(summary).toHaveTextContent('Cleared because the table says "less than": Sugars');
  expect(summary).toHaveTextContent('2 times the serving size (45g), about 460kcal');
  expect(within(dialog).getByLabelText('Serving size')).toHaveValue('45');
  expect(within(dialog).getByLabelText('Unit')).toHaveValue('g');
  expect(within(dialog).getByLabelText('Calories (kcal)')).toHaveValue('230');
  expect(within(dialog).getByLabelText('Fat (g)')).toHaveValue('13');
  expect(within(dialog).getByLabelText('Sodium (mg)')).toHaveValue('210');
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('');
  // The values are the product's own label, checked today.
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent(
    'Product label',
  );
  expect(within(dialog).getByLabelText('Verified date')).not.toHaveValue('');
  // Reading the table sends nothing.
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText('Food name'), { target: { value: '감자칩' } });
  fireEvent.change(within(dialog).getByLabelText('Source URL'), {
    target: { value: 'https://www.coupang.com/vp/products/1' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() =>
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1),
  );
  const [, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'POST')!;
  expect(JSON.parse(String(init?.body))).toMatchObject({
    name: '감자칩',
    servingSize: 45,
    servingUnit: 'g',
    calories: 230,
    carbs: 25,
    protein: 3,
    fat: 13,
    sugars: null,
    sodium: 210,
    sourceType: 'label',
    sourceUrl: 'https://www.coupang.com/vp/products/1',
  });
  // Only the app's own API was called: the shop link is never opened.
  expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true);
});

test('text without a table says so and changes nothing', async () => {
  serve(() => json({ foods: [] }));
  open();
  const { dialog } = await openWith('Add food');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    target: { value: '맛있는 감자칩 로켓배송' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read the table and fill in' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not find a nutrition table');
  expect(within(dialog).getByLabelText('Serving size')).toHaveValue('');
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent('Manual');
});

test('a Coupang source link explains that the app never opens it', async () => {
  serve(() => json({ foods: [] }));
  open();
  const { dialog } = await openWith('Add food');
  const url = within(dialog).getByLabelText('Source URL');
  expect(
    within(dialog).queryByText(/Coupang links are saved only as the source/),
  ).not.toBeInTheDocument();
  fireEvent.change(url, { target: { value: 'https://link.coupang.com/a/abc' } });
  const help = within(dialog).getByText(/Coupang links are saved only as the source/);
  expect(url).toHaveAttribute('aria-describedby', help.id);
  fireEvent.change(url, { target: { value: 'https://example.com/menu' } });
  expect(
    within(dialog).queryByText(/Coupang links are saved only as the source/),
  ).not.toBeInTheDocument();
});

test('reading a table into a published food clears stale values and marks it as the label', async () => {
  serve(() => json({ foods: [{ ...food, sugars: 10, fat: 9, checkedOn: '2026-10-31' }] }));
  open();
  const { dialog } = await openWith('Edit 치즈버거');
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('10');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    target: { value: '영양정보 1회 제공량 100g 열량 280kcal 당류 1g 미만 단백질 12g' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read the table and fill in' }));

  // "미만" (less than) really empties the field, and so does a nutrient the new table leaves out.
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('');
  expect(within(dialog).getByLabelText('Fat (g)')).toHaveValue('');
  expect(within(dialog).getByLabelText('Calories (kcal)')).toHaveValue('280');
  const summary = within(dialog).getByRole('status');
  expect(summary).toHaveTextContent('Cleared because the table has no value: Carbs, Fat, Sodium');
  expect(summary).toHaveTextContent('The source type was changed to "Product label"');
  // Read today, not the date of the official source it replaced.
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent(
    'Product label',
  );
  expect(within(dialog).getByLabelText('Verified date')).not.toHaveValue('2026-10-31');
});

test('reading the same table again announces the result again', async () => {
  serve(() => json({ foods: [] }));
  open();
  const { dialog } = await openWith('Add food');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    target: { value: '100g당 250kcal 단백질 5g' },
  });
  const read = within(dialog).getByRole('button', { name: 'Read the table and fill in' });
  fireEvent.click(read);
  const first = within(dialog).getByRole('status');
  fireEvent.click(read);
  // A new element, so a screen reader reads it out instead of seeing no change.
  expect(within(dialog).getByRole('status')).not.toBe(first);
});

test('values without a basis change nothing and are shown to type in', async () => {
  serve(() => json({ foods: [{ ...food, sugars: 10 }] }));
  open();
  const { dialog } = await openWith('Edit 치즈버거');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    target: { value: '열량 310kcal 단백질 12g' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read the table and fill in' }));
  // Values of an unknown amount would sit next to the official 120g serving: nothing changes (#120).
  expect(within(dialog).getByLabelText('Calories (kcal)')).toHaveValue('300');
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('10');
  expect(within(dialog).getByLabelText('Serving size')).toHaveValue('120');
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent(
    'Official data',
  );
  const alert = within(dialog).getByRole('alert');
  expect(alert).toHaveTextContent('Could not find the serving size, so no field was changed');
  expect(alert).toHaveTextContent('Values read: Calories 310kcal, Protein 12g');
});

test('a basis read without any value changes nothing', async () => {
  serve(() => json({ foods: [{ ...food, sugars: 10 }] }));
  open();
  const { dialog } = await openWith('Edit 치즈버거');
  fireEvent.change(within(dialog).getByLabelText('Paste a nutrition table'), {
    // A table whose numbers are only in an image: the basis is there, no value is.
    target: { value: '100g당\n수치는 상세 이미지를 참고하세요' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read the table and fill in' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Found the basis amount (100g) but could not read the nutrition values, so no field was changed',
  );
  expect(within(dialog).getByLabelText('Serving size')).toHaveValue('120');
  expect(within(dialog).getByLabelText('Sugars (g)')).toHaveValue('10');
  expect(within(dialog).getByRole('combobox', { name: 'Source type' })).toHaveTextContent(
    'Official data',
  );
});
