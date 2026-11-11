import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import type { Combo } from './combo-text';
import { toast } from './components/ui/sonner';

const rice = {
  id: 3,
  name: '햇반',
  brand: '샘플',
  servingSize: 210,
  servingUnit: 'g',
  calories: 300,
};
const egg = {
  id: 5,
  name: '삶은 달걀',
  brand: null,
  servingSize: 50,
  servingUnit: 'g',
  calories: null,
};

const breakfast: Combo = {
  id: 9,
  name: '아침 세트',
  items: [
    {
      foodId: 3,
      name: '햇반',
      brand: '샘플',
      servings: 1,
      servingSize: 210,
      servingUnit: 'g',
      calories: 300,
    },
    {
      foodId: 5,
      name: '삶은 달걀',
      brand: null,
      servings: 2,
      servingSize: 50,
      servingUnit: 'g',
      calories: null,
    },
  ],
  calories: { value: 300, missing: 1 },
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `combos` answers /api/combos; food searches answer with rice and egg. */
const serve = (combos: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/combos')
        ? combos(url, init)
        : url.startsWith('/api/foods')
          ? json({ foods: [rice, egg] })
          : json({ today: '2026-10-31' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = () => {
  window.history.replaceState(null, '', '/combos');
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/combos') && (init?.method ?? 'GET') !== 'GET',
  );

const search = async (dialog: HTMLElement) => {
  fireEvent.change(within(dialog).getByLabelText('Search foods to add'), {
    target: { value: 'Breakfast' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }));
  return within(dialog).findByRole('list', { name: 'Search results' });
};

test('the main menu opens the combos page', async () => {
  serve(() => json({ combos: [] }));
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Combos' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Combos' })).toBeInTheDocument();
  expect(await screen.findByText('No combos')).toBeInTheDocument();
});

test('a combo shows its foods and says when a calorie is unknown', async () => {
  serve(() => json({ combos: [breakfast] }));
  open();
  const heading = await screen.findByRole('heading', { level: 2, name: '아침 세트' });
  const card = heading.closest<HTMLElement>('[data-slot=card]')!;
  expect(
    within(card).getByText('2 foods · 300kcal (excludes 1 food with unknown calories)'),
  ).toBeInTheDocument();
  expect(within(card).getByText('샘플 햇반 · 1 servings · 300kcal')).toBeInTheDocument();
  expect(within(card).getByText('삶은 달걀 · 2 servings · No calorie value')).toBeInTheDocument();
});

test('a combo whose foods are all gone says how to fix it', async () => {
  serve(() =>
    json({ combos: [{ ...breakfast, items: [], calories: { value: null, missing: 0 } }] }),
  );
  open();
  expect(await screen.findByText('No foods')).toBeInTheDocument();
  expect(screen.getByText(/Edit the combo to add foods/)).toBeInTheDocument();
});

test('adding finds foods, takes quantities, saves, and shows the list again', async () => {
  let saved = false;
  const success = vi.spyOn(toast, 'success');
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(breakfast, 201);
    }
    return json({ combos: saved ? [breakfast] : [] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add combo' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Combo name'), { target: { value: '아침 세트' } });
  const results = await search(dialog);
  fireEvent.click(within(results).getByRole('button', { name: '샘플 햇반 add' }));
  fireEvent.click(within(results).getByRole('button', { name: '삶은 달걀 add' }));
  // A food already in the combo is not offered twice.
  expect(within(results).getByRole('button', { name: '샘플 햇반 added' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('삶은 달걀 quantity'), {
    target: { value: '1.5' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('heading', { level: 2, name: '아침 세트' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(success).toHaveBeenCalledWith('Saved');
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/combos');
  expect(JSON.parse(String(post[1]?.body))).toEqual({
    name: '아침 세트',
    items: [
      { foodId: 3, servings: 1 },
      { foodId: 5, servings: 1.5 },
    ],
  });
});

test.each([
  ['', [], 'Enter a combo name'],
  ['세트', [], 'Add at least one food to the combo'],
  ['세트', ['1,5'], '샘플 햇반 quantity: enter digits only. Use a period for the decimal point'],
  ['세트', ['0'], '샘플 햇반 quantity must be a number greater than 0'],
  ['세트', ['1.555'], '샘플 햇반 quantity can have at most 2 decimal places'],
  ['세트', ['1000'], '샘플 햇반 quantity must be 999 or less'],
])('name %j with quantities %j is refused before sending', async (name, quantities, message) => {
  const fetchMock = serve(() => json({ combos: [] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add combo' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Combo name'), { target: { value: name } });
  if (quantities.length) {
    const results = await search(dialog);
    fireEvent.click(within(results).getByRole('button', { name: '샘플 햇반 add' }));
    fireEvent.change(within(dialog).getByLabelText('샘플 햇반 quantity'), {
      target: { value: quantities[0] },
    });
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  expect(writes(fetchMock)).toHaveLength(0);
});

test('editing starts from the combo, can take a food out, and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(breakfast) : json({ combos: [breakfast] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 아침 세트' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('Combo name')).toHaveValue('아침 세트');
  expect(within(dialog).getByLabelText('삶은 달걀 quantity')).toHaveValue('2');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove 삶은 달걀' }));
  expect(within(dialog).queryByLabelText('삶은 달걀 quantity')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('샘플 햇반 quantity'), { target: { value: '2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await vi.waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/combos/9');
  expect(put[1]?.method).toBe('PUT');
  expect(JSON.parse(String(put[1]?.body))).toEqual({
    name: '아침 세트',
    items: [{ foodId: 3, servings: 2 }],
  });
});

test('a full combo takes no more foods', async () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    ...breakfast.items[0],
    foodId: 100 + index,
    name: `음식 ${index}`,
  }));
  serve(() => json({ combos: [{ ...breakfast, items }] }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 아침 세트' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Foods added 20/20')).toBeInTheDocument();
  const results = await search(dialog);
  expect(within(results).getByRole('button', { name: '샘플 햇반 add' })).toBeDisabled();
  expect(within(dialog).getByText(/A combo can have up to 20 foods/)).toBeInTheDocument();
});

test('a server rejection keeps the dialog open with its message and what was typed', async () => {
  serve((_url, init) =>
    init?.method === 'PUT'
      ? json({ error: 'A combo with that name already exists' }, 409)
      : json({ combos: [breakfast] }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 아침 세트' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Combo name'), { target: { value: '점심 세트' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'A combo with that name already exists',
  );
  expect(within(dialog).getByLabelText('Combo name')).toHaveValue('점심 세트');
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('deleting asks first, reads the list again, and keeps keyboard focus on the page', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json({ combos: deleted ? [] : [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 아침 세트' }));
  const question = await screen.findByRole('dialog');
  expect(question).toHaveTextContent('Meals already recorded stay as they are');
  fireEvent.click(within(question).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('No combos')).toBeInTheDocument();
  expect(writes(fetchMock).map(([url, init]) => [url, init?.method])).toEqual([
    ['/api/combos/9', 'DELETE'],
  ]);
  // The deleted card took its buttons with it; focus goes to the page title, not to the body.
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Combos' })),
  );
});

test('a deleted combo leaves the screen before the list is read again', async () => {
  let deleted = false;
  let finish = (_response: Response) => {};
  serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    // The reload after deleting hangs until the test lets it go.
    return deleted
      ? new Promise<Response>((resolve) => (finish = resolve))
      : json({ combos: [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 아침 세트' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );

  await vi.waitFor(() =>
    expect(screen.queryByRole('heading', { level: 2, name: '아침 세트' })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole('button', { name: 'Delete 아침 세트' })).not.toBeInTheDocument();
  finish(json({ combos: [] }));
  expect(await screen.findByText('No combos')).toBeInTheDocument();
});

test('a combo already gone counts as deleted', async () => {
  let deleted = false;
  serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json({ error: 'Combo not found' }, 404);
    }
    return json({ combos: deleted ? [] : [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 아침 세트' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  expect(await screen.findByText('No combos')).toBeInTheDocument();
});

test('a failed load shows the server message', async () => {
  serve(() => json({ error: 'Server error occurred' }, 500));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
});

test('the food search in a combo also reads the next page', async () => {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith('/api/combos')
        ? json({ combos: [] })
        : url.startsWith('/api/foods')
          ? json(
              url.endsWith('offset=100')
                ? { foods: [egg], nextOffset: null }
                : { foods: [rice], nextOffset: 100 },
            )
          : json({ today: '2026-10-31' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add combo' }));
  const dialog = await screen.findByRole('dialog');
  await search(dialog);
  expect(within(dialog).getByText('Showing 1 result, more are available')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Show more results' }));
  expect(await within(dialog).findByRole('button', { name: '삶은 달걀 add' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '샘플 햇반 add' })).toBeInTheDocument();
  expect(within(dialog).getByText('2 results')).toBeInTheDocument();
});

// Focuses the button first, as a keyboard user would; a pointer click does not in every browser.
const openWith = async (name: string) => {
  const opener = await screen.findByRole('button', { name });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: await screen.findByRole('dialog') };
};

test('cancelling the add dialog returns focus to the add button', async () => {
  serve(() => json({ combos: [] }));
  open();
  const { opener, dialog } = await openWith('Add combo');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());
});

test('closing the edit dialog with Escape returns focus to that combo’s edit button', async () => {
  serve(() => json({ combos: [breakfast, { ...breakfast, id: 10, name: '점심 세트' }] }));
  open();
  const { opener, dialog } = await openWith('Edit 아침 세트');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await vi.waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('saving an edit returns focus to the combo’s edit button', async () => {
  serve((_url, init) => (init?.method === 'PUT' ? json(breakfast) : json({ combos: [breakfast] })));
  open();
  const { dialog } = await openWith('Edit 아침 세트');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit 아침 세트' })).toHaveFocus(),
  );
});

test('a combo gone when the list is read again leaves focus on the page title, not the body', async () => {
  let saved = false;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json(breakfast);
    }
    return json({ combos: saved ? [] : [breakfast] });
  });
  open();
  const { dialog } = await openWith('Edit 아침 세트');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('No combos')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Combos' })).toHaveFocus(),
  );
});

test('a slow reload that drops the saved combo still leaves focus on the page title', async () => {
  let saved = false;
  let finishReload: (() => void) | undefined;
  serve((_url, init) => {
    if (init?.method === 'PUT') {
      saved = true;
      return json(breakfast);
    }
    if (!saved) return json({ combos: [breakfast] });
    // Slower than the dialog's close, so focus is back on the edit button when the list changes.
    return new Promise<Response>((resolve) => (finishReload = () => resolve(json({ combos: [] }))));
  });
  open();
  const { opener, dialog } = await openWith('Edit 아침 세트');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(opener).toHaveFocus());

  // The reload has to be on its way, or finishing it would do nothing.
  await vi.waitFor(() => expect(finishReload).toBeDefined());
  finishReload?.();
  expect(await screen.findByText('No combos')).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Combos' })).toHaveFocus(),
  );
});

test('while saving and after a failed save, keyboard focus stays in the dialog', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT'
      ? new Promise((resolve) => (finish = resolve))
      : json({ combos: [breakfast] }),
  );
  open();
  const { dialog } = await openWith('Edit 아침 세트');
  const save = within(dialog).getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);

  const busy = await within(dialog).findByRole('button', { name: 'Saving…' });
  expect(busy).toBe(save);
  expect(busy).toHaveAttribute('aria-disabled', 'true');
  expect(busy).toHaveFocus();
  // A second press while busy sends nothing more.
  fireEvent.click(busy);
  expect(writes(fetchMock)).toHaveLength(1);

  finish(json({ error: 'A combo with that name already exists' }, 409));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'A combo with that name already exists',
  );
  expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
});

test('the same failure twice is said twice, as the message is cleared before each try', async () => {
  const finishers: ((response: Response) => void)[] = [];
  serve((_url, init) =>
    init?.method === 'PUT'
      ? new Promise((resolve) => finishers.push(resolve))
      : json({ combos: [breakfast] }),
  );
  open();
  const { dialog } = await openWith('Edit 아침 세트');
  for (const finish of [0, 1]) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByRole('button', { name: 'Saving…' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // Pressing it while busy keeps the dialog, and the save, going.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finishers[finish](json({ error: 'A combo with that name already exists' }, 409));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A combo with that name already exists',
    );
  }
});

test('a list that failed to load can be tried again, and focus stays on the page (#127)', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: 'Fake server error' }, 500) : json({ combos: [breakfast] })));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Fake server error');
  const retry = screen.getByRole('button', { name: 'Try again' });
  fail = false;
  retry.focus();
  fireEvent.click(retry);
  expect(await screen.findByRole('heading', { name: breakfast.name })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  // Said once the list is in, as focus on the title alone says nothing about it.
  expect(screen.getByRole('status')).toHaveTextContent('The list was reloaded.');
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Combos' })).toHaveFocus(),
  );
});

test('failing again says so again, and the wait is said meanwhile (#127)', async () => {
  let answer: (response: Response) => void = () => {};
  let calls = 0;
  serve(() => {
    calls += 1;
    return calls === 1
      ? json({ error: 'Fake server error' }, 500)
      : new Promise<Response>((resolve) => (answer = resolve));
  });
  open();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  // The old failure is gone, so the same one coming back is a new alert.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Reloading the list…');
  answer(json({ error: 'Fake server error' }, 500));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fake server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('a list already shown keeps a way to read again when reading after a delete fails (#127)', async () => {
  let deleted = false;
  let failReads = false;
  serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      failReads = true;
      return json(null, 204);
    }
    if (failReads) return json({ error: 'Fake server error' }, 500);
    return json({ combos: deleted ? [] : [breakfast] });
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 아침 세트' }));
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Fake server error');
  failReads = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No combos')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
