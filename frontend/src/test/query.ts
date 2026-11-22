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
