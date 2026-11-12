import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { toast } from './components/ui/sonner';
import type { Medication, MedicationLists } from './med-text';
import { trackWrite } from './pending-writes';
import { VisitsCard } from './visit-card';
import type { Visit } from './visit-text';

// Made-up values only: no real prescription belongs in tests.
const prescribed: Medication = {
  id: 3,
  name: '가상정',
  dose: '500mg',
  directions: 'twice a day after meals',
  startOn: '2026-03-10',
  endOn: null,
  note: '가상 메모',
  visit: { id: 7, date: '2026-03-10', clinic: '가상내과' },
};
const finished: Medication = {
  ...prescribed,
  id: 4,
  name: '가상캡슐',
  dose: null,
  directions: null,
  startOn: '2026-02-01',
  endOn: '2026-02-07',
  note: null,
  visit: null,
};
const visit: Visit = {
  id: 7,
  date: '2026-03-10',
  clinic: '가상내과',
  department: null,
  note: null,
  cost: null,
  nextVisitOn: null,
  procedures: [],
};

const lists = (overrides: Partial<MedicationLists> = {}): MedicationLists => ({
  today: '2026-03-15',
  current: [prescribed],
  upcoming: [],
  past: [finished],
  ...overrides,
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (body: object | null, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

/** `medications` answers /api/medications; visits are the one above; else today's date. */
const serve = (medications: Handler) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      url.startsWith('/api/medications')
        ? medications(url, init)
        : url.startsWith('/api/visits')
          ? json({ visits: [visit], more: false })
          : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const open = (path = '/medications') => {
  window.history.replaceState(null, '', path);
  render(<App />);
};

const writes = (fetchMock: ReturnType<typeof serve>) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url.startsWith('/api/medications') && (init?.method ?? 'GET') !== 'GET',
  );

const sentBody = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as unknown;

const dialog = () => screen.getByRole('dialog');
const fill = (label: string, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });

test('the main menu opens the medicine page, split into taken now and finished', async () => {
  serve(() => json(lists()));
  window.history.replaceState(null, '', '/');
  render(<App />);
  const menu = screen.getByRole('navigation', { name: 'Main menu' });
  fireEvent.click(within(menu).getByRole('link', { name: 'Medication' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Medication' })).toBeInTheDocument();

  const current = await screen.findByRole('region', { name: 'Taking now 1' });
  expect(within(current).getByRole('heading', { name: '가상정' })).toBeInTheDocument();
  expect(within(current).getByText('From 2026-03-10')).toBeInTheDocument();
  expect(within(current).getByText('500mg · twice a day after meals')).toBeInTheDocument();
  expect(within(current).getByText('2026-03-10 가상내과 prescription')).toBeInTheDocument();
  const past = screen.getByRole('region', { name: 'Past medication 1' });
  expect(within(past).getByText('2026-02-01 ~ 2026-02-07')).toBeInTheDocument();
  // Nothing starting later, so that list is left out.
  expect(screen.queryByRole('region', { name: /Starting soon/ })).not.toBeInTheDocument();
  expect(screen.getByText(/as of today \(2026-03-15\)/)).toBeInTheDocument();
});

test('a new medicine starts today, can be linked to a visit, and is sent as typed', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'POST' ? json(prescribed, 201) : json(lists({ current: [] })),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Medication record' }));
  expect(within(dialog()).getByLabelText('Start date')).toHaveValue('2026-03-15');
  fill('Medication name', '가상정');
  fill('Dose', '500mg');
  await within(dialog()).findByRole('option', { name: '2026-03-10 가상내과' });
  fill('Prescribing clinic visit', '7');
  fill('End date', '2026-03-21');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [post] = writes(fetchMock);
  expect(post[0]).toBe('/api/medications');
  expect(sentBody(post)).toEqual({
    name: '가상정',
    dose: '500mg',
    directions: '',
    startOn: '2026-03-15',
    endOn: '2026-03-21',
    note: '',
    visitId: 7,
  });
});

test('editing starts from the medicine, and taking the link off sends no visit', async () => {
  const fetchMock = serve((_url, init) =>
    init?.method === 'PUT' ? json(prescribed) : json(lists()),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 가상정' }));
  expect(within(dialog()).getByLabelText('Medication name')).toHaveValue('가상정');
  expect(within(dialog()).getByLabelText('Directions')).toHaveValue('twice a day after meals');
  expect(within(dialog()).getByLabelText('Prescribing clinic visit')).toHaveValue('7');
  fill('Prescribing clinic visit', '');
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
  const [put] = writes(fetchMock);
  expect(put[0]).toBe('/api/medications/3');
  expect((sentBody(put) as { visitId: unknown }).visitId).toBeNull();
});

test('what cannot be sent is explained before anything is sent', async () => {
  const fetchMock = serve(() => json(lists()));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Medication record' }));
  const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
  const said = async (text: string) =>
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(text);

  save();
  await said('Enter the medication name');
  fill('Medication name', '💊'.repeat(101));
  save();
  await said('Medication name must be 100 characters or fewer');
  fill('Medication name', '가상정');
  fill('End date', '2026-03-14');
  save();
  await said('The end date cannot be before the start date');
  fill('End date', '');
  fill('Start date', '1999-12-31');
  save();
  await said('Start date: Records can be kept from 2000-01-01 to 2099-12-31');
  expect(writes(fetchMock)).toHaveLength(0);
});

test('a visit’s link opens a medicine linked to it, starting on its day', async () => {
  serve(() => json(lists()));
  open('/medications?visit=7&date=2026-03-10');
  expect(await screen.findByRole('dialog', { name: 'Medication record' })).toBeInTheDocument();
  expect(within(dialog()).getByLabelText('Start date')).toHaveValue('2026-03-10');
  await waitFor(() =>
    expect(within(dialog()).getByLabelText('Prescribing clinic visit')).toHaveValue('7'),
  );
  expect(window.location.search).toBe('');
});

test('deleting asks first, removes the medicine and keeps keyboard focus on the page', async () => {
  let deleted = false;
  const fetchMock = serve((_url, init) => {
    if (init?.method === 'DELETE') {
      deleted = true;
      return json(null, 204);
    }
    return json(lists({ past: deleted ? [] : [finished] }));
  });
  const success = vi.spyOn(toast, 'success');
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete 가상캡슐' }));
  const confirm = screen.getByRole('dialog', { name: 'Delete this medication record?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('No finished medication.')).toBeInTheDocument();
  expect(writes(fetchMock)[0][0]).toBe('/api/medications/4');
  expect(success).toHaveBeenCalledWith('Deleted');
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Medication' })).toHaveFocus(),
  );
});

test('a failed save keeps the dialog, what was typed and the focus inside it', async () => {
  serve((_url, init) =>
    init?.method === 'POST'
      ? json({ error: 'The linked clinic visit could not be found' }, 400)
      : json(lists()),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Medication record' }));
  fill('Medication name', '가상정');
  const save = within(dialog()).getByRole('button', { name: 'Save' });
  save.focus();
  fireEvent.click(save);
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
    'The linked clinic visit could not be found',
  );
  expect(within(dialog()).getByLabelText('Medication name')).toHaveValue('가상정');
  expect(within(dialog()).getByRole('button', { name: 'Save' })).toHaveFocus();
});

test('a visit card links to recording what was prescribed there', async () => {
  serve(() => json(lists()));
  open('/visits');
  expect(
    await screen.findByRole('link', { name: '2026-03-10 가상내과 prescribed medication records' }),
  ).toHaveAttribute('href', '/medications?visit=7&date=2026-03-10');
});

// The daily card's medicine part.

const renderCard = (date = '2026-03-12') =>
  render(
    <MemoryRouter>
      <VisitsCard date={date} />
    </MemoryRouter>,
  );

test('the daily card lists the medicines taken that day', async () => {
  const fetchMock = serve(() => json({ date: '2026-03-12', medications: [prescribed] }));
  renderCard();
  const part = await screen.findByRole('region', { name: 'Medication taken this day' });
  expect(within(part).getByText('가상정')).toBeInTheDocument();
  expect(within(part).getByText('· 500mg · twice a day after meals')).toBeInTheDocument();
  expect(within(part).getByRole('link', { name: 'View medication records' })).toHaveAttribute(
    'href',
    '/medications',
  );
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/medications?date=2026-03-12');
});

test('a day without medicines says so', async () => {
  serve(() => json({ date: '2026-03-12', medications: [] }));
  renderCard();
  expect(await screen.findByText('No medication records for this day.')).toBeInTheDocument();
});

test('a linked visit older than the recent ones is still offered, and an unknown one is named plainly', async () => {
  const older: Medication = {
    ...prescribed,
    id: 5,
    name: '가상오래된약',
    visit: { id: 2, date: '2025-01-05', clinic: '가상옛의원' },
  };
  serve(() => json(lists({ current: [older] })));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit 가상오래된약' }));
  const select = within(dialog()).getByLabelText('Prescribing clinic visit');
  expect(select).toHaveValue('2');
  expect(within(select).getByRole('option', { name: '2025-01-05 가상옛의원' })).toBeInTheDocument();
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  // A link without a date names the visit without inventing one.
  window.history.pushState(null, '', '/medications?visit=99');
  window.dispatchEvent(new PopStateEvent('popstate'));
  const linked = await screen.findByRole('dialog', { name: 'Medication record' });
  await waitFor(() =>
    expect(within(linked).getByLabelText('Prescribing clinic visit')).toHaveValue('99'),
  );
  expect(within(linked).getByRole('option', { name: 'Selected visit' })).toBeInTheDocument();
  expect(within(linked).getByLabelText('Start date')).toHaveValue('2026-03-15');
});

test('medicines starting later have their own list', async () => {
  serve(() =>
    json(
      lists({
        upcoming: [{ ...finished, id: 6, name: '가상예정약', startOn: '2026-04-01', endOn: null }],
      }),
    ),
  );
  open();
  const upcoming = await screen.findByRole('region', { name: 'Starting soon 1' });
  expect(within(upcoming).getByText('From 2026-04-01')).toBeInTheDocument();
});

test('when the day’s medicines fail to load, trying again brings both parts back with focus on the card', async () => {
  let medicineCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/medications')) {
        medicineCalls += 1;
        return Promise.resolve(
          medicineCalls === 1
            ? json({ error: 'Server error occurred' }, 500)
            : json({ date: '2026-03-12', medications: [prescribed] }),
        );
      }
      return Promise.resolve(json({ visits: [visit], more: false }));
    }),
  );
  renderCard();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server error occurred');
  const again = screen.getByRole('button', { name: 'Try again' });
  again.focus();
  fireEvent.click(again);
  expect(
    await screen.findByRole('region', { name: 'Medication taken this day' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Clinic visits on this day' })).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Clinic and medication' }).parentElement,
    ).toHaveFocus(),
  );
});

test('the daily card waits for a medicine save still on its way', async () => {
  let finish = () => {};
  void trackWrite(
    '/api/medications/',
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const fetchMock = serve(() => json({ date: '2026-03-12', medications: [prescribed] }));
  renderCard();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).not.toHaveBeenCalled();
  finish();
  expect(
    await screen.findByRole('region', { name: 'Medication taken this day' }),
  ).toBeInTheDocument();
});

test('a list that failed to load can be tried again, and focus stays on the page (#127)', async () => {
  let fail = true;
  serve(() => (fail ? json({ error: 'Fake server error' }, 500) : json(lists())));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Fake server error');
  const retry = screen.getByRole('button', { name: 'Try again' });
  fail = false;
  retry.focus();
  fireEvent.click(retry);
  expect(await screen.findByRole('region', { name: 'Taking now 1' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  // Said once the list is in, as focus on the title alone says nothing about it.
  expect(screen.getByRole('status')).toHaveTextContent('The list was reloaded.');
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: 'Medication' })).toHaveFocus(),
  );
});

test('trying again also asks again for the visits a medicine can be linked to (#127)', async () => {
  let down = true;
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.startsWith('/api/medications') || url.startsWith('/api/visits')
        ? down
          ? json({ error: 'Fake server error' }, 500)
          : url.startsWith('/api/visits')
            ? json({ visits: [visit], more: false })
            : json(lists())
        : json({ today: '2026-03-15' }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  open();
  await screen.findByRole('alert');
  down = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('status')).toHaveTextContent('Reloading the list…');
  await screen.findByRole('region', { name: 'Taking now 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Medication record' }));
  const choices = within(dialog()).getByLabelText('Prescribing clinic visit');
  await waitFor(() => expect(within(choices).getAllByRole('option')).toHaveLength(2));
  expect(
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/visits')),
  ).toHaveLength(2);
});

test('failing again says so again (#127)', async () => {
  serve(() => json({ error: 'Fake server error' }, 500));
  open();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Fake server error');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
