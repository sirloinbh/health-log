import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { apiKey, createQueryClient } from '../lib/query';

/**
 * A query client for screen tests: the shared defaults without retries, so a failure a test serves shows at once.
 * With `today`, the server's date is already known, as it is a moment after the app opens: a test that presses a
 * button at once then gets the same date a person would.
 */
export function testQueryClient({ today }: { today?: string } = {}) {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  if (today) client.setQueryData(apiKey('/api/health'), today);
  return client;
}

// One client per test, as the app has one: a card unmounted and mounted again in a test finds the same cache and
// the writes the first one started, like moving between days does.
let current: QueryClient | undefined;

/** Renders a screen part inside the test's query client. */
export function renderWithQuery(ui: ReactElement) {
  current ??= testQueryClient();
  return render(<QueryClientProvider client={current}>{ui}</QueryClientProvider>);
}

/** For test setup: the next test starts with an empty cache. */
export function forgetQueryClient() {
  current?.clear();
  current = undefined;
}
