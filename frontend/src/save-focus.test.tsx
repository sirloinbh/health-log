import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';

import { BodyCard } from './body';
import { BusyButton } from './busy-button';
import { ChecksCard } from './checks';
import { GoalsSettings } from './goals';
import { HabitsCard } from './habits';
import { MealCard } from './meals';
import { SleepCard } from './sleep';

// #126: a save that fails must leave the keyboard focus on the button that was pressed, not on
// the page. A disabled button loses focus in a browser, so the button must stay enabled.

const date = '2026-11-04';
const week = { from: '2026-11-02', to: '2026-11-08' };
const month = { from: '2026-11-01', to: '2026-11-30' };
const noRate = { days: 0, yes: 0 };
const noTotal = { value: null, missing: 0 };
const noJunk = { times: 0, days: 0, calories: noTotal };

/** Reads answer at once with an empty day; writes wait until `fail()` answers them with 500. */
const server = (empty: (url: string) => unknown) => {
  const waiting: ((response: Response) => void)[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      return new Promise<Response>((resolve) => waiting.push(resolve));
    }
    return Promise.resolve(new Response(JSON.stringify(empty(url))));
  });
  vi.stubGlobal('fetch', fetchMock);
  const writes = () =>
    fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET').length;
  const fail = () =>
    waiting
      .splice(0)
      .forEach((resolve) =>
        resolve(new Response(JSON.stringify({ error: 'It is a server error' }), { status: 500 })),
      );
  return { writes, fail };
};

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const cases: {
  name: string;
  ui: ReactElement;
  empty: (url: string) => unknown;
  /** Fills the form and returns the button to press. */
  fill: () => Promise<HTMLElement>;
}[] = [
  {
    name: 'Sleep',
    ui: <SleepCard date={date} />,
    empty: () => ({ record: null }),
    fill: async () => {
      await screen.findByLabelText('Bedtime');
      change('Bedtime', '23:30');
      change('Wake-up time', '07:00');
      return screen.getByRole('button', { name: 'Save' });
    },
  },
  {
    name: 'Body',
    ui: <BodyCard date={date} />,
    empty: (url) => (url.startsWith('/api/body?') ? { records: [] } : { record: null }),
    fill: async () => {
      await screen.findByLabelText('Weight (kg)');
      change('Weight (kg)', '71.5');
      return screen.getByRole('button', { name: 'Save' });
    },
  },
  {
    name: 'Alcohol and tobacco',
    ui: <HabitsCard date={date} />,
    empty: () => {
      const period = {
        smoking: { days: 0, cigarettes: null },
        drinking: { days: 0, drinkingDays: 0, totals: [] },
      };
      return { record: null, week: { ...week, ...period }, month: { ...month, ...period } };
    },
    fill: async () => {
      await screen.findByLabelText('Cigarettes');
      change('Cigarettes', '2');
      return screen.getByRole('button', { name: 'Save' });
    },
  },
  {
    name: 'Daily check',
    ui: <ChecksCard date={date} />,
    empty: () => ({
      record: null,
      week: { ...week, diet: noRate, sleep: noRate },
      month: { ...month, diet: noRate, sleep: noRate },
    }),
    fill: async () => {
      await screen.findByLabelText('Note');
      change('Note', '테스트');
      return screen.getByRole('button', { name: 'Save' });
    },
  },
  {
    name: 'Record diet now',
    ui: <MealCard date={date} />,
    empty: (url) =>
      url === '/api/foods/recent'
        ? { foods: [] }
        : {
            entries: [],
            totals: {
              calories: noTotal,
              carbs: noTotal,
              protein: noTotal,
              fat: noTotal,
              sugars: noTotal,
              sodium: noTotal,
            },
            junk: { week: { ...week, ...noJunk }, month: { ...month, ...noJunk } },
          },
    fill: async () => {
      await screen.findByLabelText('Food name');
      change('Food name', '떡볶이');
      change('Calories per serving (kcal)', '480');
      return screen.getByRole('button', { name: 'Record now' });
    },
  },
  {
    name: 'Set goals',
    ui: <GoalsSettings />,
    empty: () => ({
      today: '2026-11-06',
      week,
      current: { calories: null, protein: null, sleep: null, sober_days: null },
      history: [],
    }),
    fill: async () => {
      const field = await screen.findByLabelText('Daily calorie limit (kcal)');
      change('Daily calorie limit (kcal)', '2200');
      return within(field.closest('form') as HTMLElement).getByRole('button', { name: 'Save' });
    },
  },
];

test.each(cases)(
  '$name: pressing save from the keyboard keeps focus on it while saving and after a failure',
  async ({ ui, empty, fill }) => {
    const { writes, fail } = server(empty);
    render(ui);
    const save = await fill();
    save.focus();
    fireEvent.click(save);

    // Saving: still focusable, marked busy, and a second press sends nothing.
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    // The check that matters: jsdom keeps focus on a button that becomes disabled, but a browser
    // drops it to the page, so toHaveFocus alone would pass with the old disabled button.
    expect(save).toBeEnabled();
    expect(save).toHaveFocus();
    fireEvent.click(save);
    expect(writes()).toBe(1);

    fail();
    expect(await screen.findByRole('alert')).toHaveTextContent('It is a server error');
    expect(save).not.toHaveAttribute('aria-disabled');
    expect(save).toHaveFocus();

    // Trying again clears the old message, so the same failure appears anew and is read out again.
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fail();
    expect(await screen.findByRole('alert')).toHaveTextContent('It is a server error');
    expect(save).toHaveFocus();
    expect(writes()).toBe(2);
  },
);

test.each(cases)(
  '$name: a submit while the form is saving does not send it again',
  async ({ ui, empty, fill }) => {
    const { writes } = server(empty);
    render(ui);
    const save = await fill();
    fireEvent.click(save);
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    // Enter in a field submits the form without pressing the button.
    fireEvent.submit(save.closest('form') as HTMLElement);
    expect(writes()).toBe(1);
  },
);

test('a busy button ignores presses and does not submit its form', () => {
  const pressed = vi.fn();
  const submitted = vi.fn((event: Event) => event.preventDefault());
  const { rerender } = render(
    <form onSubmit={(event) => submitted(event.nativeEvent)}>
      <BusyButton type="submit" busy onClick={pressed}>
        Save
      </BusyButton>
    </form>,
  );
  const button = screen.getByRole('button', { name: 'Save' });
  fireEvent.click(button);
  expect(pressed).not.toHaveBeenCalled();
  expect(submitted).not.toHaveBeenCalled();

  rerender(
    <form onSubmit={(event) => submitted(event.nativeEvent)}>
      <BusyButton type="submit" busy={false} onClick={pressed}>
        Save
      </BusyButton>
    </form>,
  );
  fireEvent.click(button);
  expect(pressed).toHaveBeenCalledOnce();
  expect(submitted).toHaveBeenCalledOnce();
});
