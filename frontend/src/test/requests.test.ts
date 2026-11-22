import { expect, test } from 'vitest';

import { failOnUnexpectedRequests, unexpectedRequest, unmockedFetch } from './requests';

test('an unexpected request is rejected, and the test fails naming it', async () => {
  await expect(unexpectedRequest('/api/meals/2026-03-15', { method: 'POST' })).rejects.toThrow(
    'unexpected request: POST /api/meals/2026-03-15',
  );
  await expect(unmockedFetch(new URL('http://localhost/api/health'))).rejects.toThrow(
    'unmocked fetch: GET http://localhost/api/health',
  );
  expect(() => failOnUnexpectedRequests()).toThrow(
    'The test sent requests it did not expect:\n' +
      'unexpected request: POST /api/meals/2026-03-15\n' +
      'unmocked fetch: GET http://localhost/api/health',
  );
  // Each is reported once: the next test starts clean.
  expect(() => failOnUnexpectedRequests()).not.toThrow();
});

test('a request listed as known does not fail the test', async () => {
  await expect(unexpectedRequest('/api/tags', undefined, 'unmocked fetch')).rejects.toThrow();
  expect(() => failOnUnexpectedRequests(['unmocked fetch: GET /api/tags'])).not.toThrow();
});
