import { act, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

/**
 * One turn of the task queue: every promise step queued before it runs first. A test that lands a
 * save after it knows that a card which did not wait for the save has already sent its read (#213).
 */
export const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Waits until the app has handled `response` (#213), so a test can then check that a late or stale
 * answer changed nothing. Waiting a fixed time instead can pass before the answer is even read.
 *
 * Call it in the same tick that hands the response to the app (before any `await`), so the read is
 * seen. It waits for the app to read the body, then lets the promise steps after that read run, and
 * then the zero-delay timers that the effects of that render set (focus moves use them).
 */
export async function answered(response: Response) {
  const read = vi.spyOn(response, 'json');
  await waitFor(() => expect(read).toHaveBeenCalled());
  await act(async () => {
    // An unreadable body is still an answer the app handled.
    await (read.mock.results[0].value as Promise<unknown>).catch(() => undefined);
    await nextTask();
  });
  await act(nextTask);
}
