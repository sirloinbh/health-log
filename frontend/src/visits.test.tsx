import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';
import { trackWrite } from './pending-writes';
import { VisitsCard } from './visit-card';
import type { Visit } from './visit-text';

// Made-up values only: no real visit belongs in tests.
const visit: Visit = {
  id: 7,
  date: '2026-03-10',
  clinic: '가상피부과',
  department: '피부과',
  note: '가상 메모',
  cost: 12000,
  nextVisitOn: '2026-04-07',
  procedures: [
    { name: '가상 레이저', area: 'Forehead', amount: 'Session 1', cost: 50000, note: null },
    { name: '가상 관리', area: null, amount: null, cost: null, note: '가상 시술 메모' },
  ],
};

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `visits` answers /api/visits; anything else gets today's date. */
const serve = (visits: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/visits')
        ? visits(url, init)
        : url.startsWith('/api/medications')
          ? json({ date: '2026-03-10', medications: [] })
          : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = (path = '/visits') => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/visits') && (init?.method ?? 'GET') !== 'GET',
  );

const sentBody = (call: [string, RequestInit | undefined]) =>
  JSON.parse(String(call[1]?.body)) as unknown;

const dialog = () => screen.getByRole('dialog');
const fill = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

test('the main menu opens the clinic page, which lists visits with their procedures', async () => {
  serve(() => json({ visits: [visit], more: false }));
  window.history.replaceState(null, '', '/');
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Clinic' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Clinic' })).toBeInTheDocument();

  const card = (
    await screen.findByRole('heading', { level: 2, name: '가상피부과 · 피부과' })
  ).closest<HTMLElement>('[data-slot=card]')!;
  expect(within(card).getByText('Tuesday, March 10, 2026')).toBeInTheDocument();
  expect(within(card).getByText('₩12,000')).toBeInTheDocument();
  expect(within(card).getByText('Tuesday, April 7, 2026')).toBeInTheDocument();
  const procedures = within(card).getByRole('list', { name: 'Procedures' });
  expect(
    within(procedures).getByText('가상 레이저 · Forehead · Session 1 · ₩50,000'),
  ).toBeInTheDocument();
  expect(within(procedures).getByText('가상 시술 메모')).toBeInTheDocument();
  expect(screen.getByText('1 visit')).toBeInTheDocument();
});

test('a new visit is sent with its procedures, blanks as nothing and costs with commas read', async () => {
  let saved = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'POST') {
      saved = true;
      return json(visit, 201);
    }
    return json({ visits: saved ? [visit] : [], more: false });
  });
  open();
  expect(await screen.findByText('No clinic records')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Visit records' }));
  // Today, as the server counts it, is where a new visit starts.
  expect(within(dialog()).getByLabelText('Visit date')).toHaveValue('2026-03-15');
  fill('Clinic name', '가상피부과');
  fill('Visit cost (₩)', '12,000');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Add procedure' }));
  fill('Procedure 1 name', '가상 레이저');
  fill('Procedure 1 cost (₩)', '50000');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    await screen.findByRole('heading', { level: 2, name: '가상피부과 · 피부과' }),
  ).toBeInTheDocument();
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/visits');
  expect(sentBody(post as [string, RequestInit])).toEqual({
    date: '2026-03-15',
    clinic: '가상피부과',
    department: '',
    note: '',
    cost: 12000,
    nextVisitOn: null,
    procedures: [{ name: '가상 레이저', area: '', amount: '', cost: 50000, note: '' }],
  });
});

test('editing starts from the visit, can take a procedure out, and saves to its address', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(visit) : json({ visits: [visit], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 2026-03-10 가상피부과' }));
  expect(within(dialog()).getByLabelText('Clinic name')).toHaveValue('가상피부과');
  expect(within(dialog()).getByLabelText('Visit cost (₩)')).toHaveValue('12000');
  expect(within(dialog()).getByLabelText('Next appointment')).toHaveValue('2026-04-07');
  expect(within(dialog()).getByLabelText('Procedure 2 note')).toHaveValue('가상 시술 메모');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove Procedure 1' }));
  expect(within(dialog()).getByLabelText('Procedure 1 name')).toHaveValue('가상 관리');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/visits/7');
  expect(put[1]?.method).toBe('PUT');
  expect((sentBody(put as [string, RequestInit]) as { procedures: unknown[] }).procedures).toEqual([
    { name: '가상 관리', area: '', amount: '', cost: null, note: '가상 시술 메모' },
  ]);
});

test('what cannot be sent is explained in the dialog before anything is sent', async () => {
  const fetchMock = serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Visit records' }));
  const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
  const said = async (text: string) =>
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text);

  save();
  await said('Enter the clinic name');
  fill('Clinic name', '가상의원');
  fill('Visit cost (₩)', '1.5');
  save();
  await said('Visit cost: enter whole won');
  fill('Visit cost (₩)', '');
  fill('Next appointment', '2026-03-14');
  save();
  await said('The next appointment date cannot be before the visit date');
  fill('Next appointment', '2100-01-01');
  save();
  await said('Next appointment: Records can be kept from 2000-01-01 to 2099-12-31');
  fill('Next appointment', '');
  fill('Visit date', '1999-12-31');
  save();
  await said('Visit date: Records can be kept from 2000-01-01 to 2099-12-31');
  fill('Visit date', '2026-03-15');
  fill('Visit cost (₩)', '100,000,001');
  save();
  await said('Visit cost must be 100 million won or less');
  fill('Visit cost (₩)', '');
  fill('Clinic name', '🏥'.repeat(101));
  save();
  await said('Clinic name must be 100 characters or fewer');
  fill('Clinic name', '가상의원');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Add procedure' }));
  save();
  await said('Procedure 1: enter a name');
  fill('Procedure 1 name', '가상 시술');
  fill('Procedure 1 note', '가'.repeat(501));
  save();
  await said('Procedure 1 note must be 500 characters or fewer');
  expect(writes(fetchMock)).toHaveLength(0);
});

test('a visit takes at most ten procedures', async () => {
  serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Visit records' }));
  const add = within(dialog()).getByRole('button', { name: 'Add procedure' });
  for (let count = 0; count < 10; count += 1) {
    add.focus();
    fireEvent.click(add);
  }
  // The new row's name takes focus each time.
  await waitFor(() => expect(within(dialog()).getByLabelText('Procedure 10 name')).toHaveFocus());
  expect(add).toHaveAttribute('aria-disabled', 'true');
  add.focus();
  fireEvent.click(add);
  expect(within(dialog()).queryByLabelText('Procedure 11 name')).not.toBeInTheDocument();
  expect(add).toHaveFocus();
  expect(
    within(dialog()).getByText('You can record up to 10 procedures per visit.'),
  ).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('Procedure 10 name')).toBeInTheDocument();
});

test('searching sends the encoded words and says when nothing matches', async () => {
  const fetchMock = serve((url) =>
    json({ visits: url.includes('q=100%25') ? [] : [visit], more: false }),
  );
  open();
  await screen.findByText('1 visit');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search clinic records' }), {
    target: { value: ' 100% ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('No matching records')).toBeInTheDocument();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/visits?q=100%25');
});

test('deleting asks first, removes the visit and keeps keyboard focus on the page', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json({ visits: deleted ? [] : [visit], more: false });
  });
  const success = vi.spyOn(toast, 'success');
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 2026-03-10 가상피부과' }));
  const confirm = screen.getByRole('dialog', { name: 'Delete this clinic visit?' });
  expect(writes(fetchMock)).toHaveLength(0);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('No clinic records')).toBeInTheDocument();
  expect(writes(fetchMock)[0][0]).toBe('/api/visits/7');
  expect(success).toHaveBeenCalledWith('Deleted');
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Clinic' })).toHaveFocus(),
  );
});

test('the daily link opens a new visit on its day', async () => {
  serve(() => json({ visits: [], more: false }));
  open('/visits?new=2026-03-02');
  expect(await screen.findByRole('dialog', { name: 'Record clinic visit' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('Visit date')).toHaveValue('2026-03-02');
  expect(window.location.search).toBe('');
});

test('a failed save keeps the dialog, what was typed and the focus inside it', async () => {
  serve((_url, init) =>
    init?.method === 'POST'
      ? json({ error: 'Server error occurred' }, 500)
      : json({ visits: [], more: false }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Visit records' }));
  fill('Clinic name', '가상의원');
  const save = within(dialog()).getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Server error occurred');
  expect(within(dialog()).getByLabelText('Clinic name')).toHaveValue('가상의원');
  expect(within(dialog()).getByRole('button', { name: 'Save' })).toHaveFocus();
});

// The daily card.

const renderCard = (date = '2026-03-10') =>
  render(
    <MemoryRouter>
      <VisitsCard date={date} />
    </MemoryRouter>,
  );

test('the daily card shows the day’s visits and links to record one on that day', async () => {
  const fetchMock = serve(() => json({ visits: [visit], more: false }));
  renderCard();
  const list = await screen.findByRole('list', { name: 'Clinic visits on this day' });
  expect(within(list).getByText('가상피부과 · 피부과')).toBeInTheDocument();
  expect(
    within(list).getByText('가상 레이저 · Forehead · Session 1 · ₩50,000'),
  ).toBeInTheDocument();
  expect(within(list).getByText('Visit cost ₩12,000')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/visits?date=2026-03-10');
  expect(screen.getByRole('link', { name: 'Record a clinic visit for this day' })).toHaveAttribute(
    'href',
    '/visits?new=2026-03-10',
  );
  expect(screen.getByRole('link', { name: 'View clinic records' })).toHaveAttribute(
    'href',
    '/visits',
  );
});

test('a day without visits says so', async () => {
  serve(() => json({ visits: [], more: false }));
  renderCard();
  expect(await screen.findByText('No clinic visits on this day.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View clinic records' })).not.toBeInTheDocument();
});

test('trying again after a failed load moves focus to the card', async () => {
  const replies = [
    json({ error: 'Server error occurred' }, 500),
    json({ visits: [], more: false }),
  ];
  serve(() => replies.shift()!);
  renderCard();
  const again = await screen.findByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(await screen.findByText('No clinic visits on this day.')).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Clinic and medication' }).parentElement,
    ).toHaveFocus(),
  );
});

test('the daily card reads only after a visit save still on its way', async () => {
  let finish = () => {};
  void trackWrite(
    '/api/visits/',
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const fetchMock = serve(() => json({ visits: [visit], more: false }));
  renderCard();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
  finish();
  expect(
    await screen.findByRole('list', { name: 'Clinic visits on this day' }),
  ).toBeInTheDocument();
});

test('removing a procedure row moves focus to the add button, not the page', async () => {
  serve(() => json({ visits: [], more: false }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Visit records' }));
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Add procedure' }));
  const remove = within(dialog()).getByRole('button', { name: 'Remove Procedure 1' });
  remove.focus();
  fireEvent.click(remove);
  await waitFor(() =>
    expect(within(dialog()).getByRole('button', { name: 'Add procedure' })).toHaveFocus(),
  );
});

test('a daily link outside the daily range starts on today instead', async () => {
  serve(() => json({ visits: [], more: false }));
  open('/visits?new=1985-07-01');
  expect(await screen.findByRole('dialog', { name: 'Record clinic visit' })).toBeInTheDocument();
  await waitFor(() =>
    expect(within(dialog()).getByLabelText('Visit date')).toHaveValue('2026-03-15'),
  );
});

test('while a search is on its way, the next page waits, so two lists never mix', async () => {
  let finishSearch = () => {};
  const fetchMock = serve((url) => {
    if (url.includes('q=%EA%B0%80')) {
      return new Promise<Response>((resolve) => {
        finishSearch = () => resolve(json({ visits: [{ ...visit, id: 9 }], more: false }));
      });
    }
    return json({ visits: [visit], more: true });
  });
  open();
  const more = await screen.findByRole('button', { name: 'Show more results' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search clinic records' }), {
    target: { value: '가' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(more).toHaveAttribute('aria-disabled', 'true'));
  fireEvent.click(more);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('offset='))).toBe(false);
  finishSearch();
  expect(await screen.findByText('1 visit')).toBeInTheDocument();
});

test('a daily link without a usable date waits for today, or opens blank if it cannot be had', async () => {
  let answerHealth = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/visits')
        ? Promise.resolve(json({ visits: [], more: false }))
        : new Promise<Response>((resolve) => (answerHealth = resolve)),
    ),
  );
  open('/visits?new=1985-07-01');
  await screen.findByText('No clinic records');
  // Today is still being asked, so nothing opens on a blank date yet.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  answerHealth(json({ today: '2026-03-15' }));
  expect(await screen.findByRole('dialog', { name: 'Record clinic visit' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('Visit date')).toHaveValue('2026-03-15');
});

test('a daily link without a usable date still opens when the server cannot say what day it is', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith('/api/visits')
          ? json({ visits: [], more: false })
          : json({ error: 'Server error occurred' }, 500),
      ),
    ),
  );
  open('/visits?new=garbage');
  expect(await screen.findByRole('dialog', { name: 'Record clinic visit' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('Visit date')).toHaveValue('');
});
