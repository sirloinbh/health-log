import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { expect, test, vi } from 'vitest';

import { MoreFoodsButton } from './more-foods-button';
import { nextTask } from './test/answered';

function renderButton(onLoad: () => Promise<boolean>) {
  const afterLast = createRef<HTMLParagraphElement>();
  render(
    <>
      <p ref={afterLast} tabIndex={-1}>
        3 foods
      </p>
      <MoreFoodsButton loading={false} onLoad={onLoad} afterLast={afterLast} />
    </>,
  );
  const button = screen.getByRole('button', { name: 'Show more results' });
  button.focus();
  return { button, afterLast };
}

test('after the last page, focus moves to the line that says how many foods are shown', async () => {
  const { afterLast } = renderButton(() => Promise.resolve(true));
  fireEvent.click(screen.getByRole('button', { name: 'Show more results' }));
  await waitFor(() => expect(afterLast.current).toHaveFocus());
});

// #209: a rejected read must not escape as an unhandled rejection, which vitest reports as an error.
test('a load that rejects is caught, and focus stays on the button to try again', async () => {
  const onLoad = vi.fn(() => Promise.reject(new Error('offline')));
  const { button } = renderButton(onLoad);
  fireEvent.click(button);
  await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
  // The button handles the failed read in promise steps only, so by the next task it is done
  // (#213); an unhandled rejection would fail this file.
  await act(nextTask);
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(onLoad).toHaveBeenCalledTimes(2);
});
