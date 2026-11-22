// The shared setup first (#250): it brings the jest-dom matchers and Testing Library's 8 s wait for findBy* and
// waitFor. Without this import the wait stayed at the 1 s default and first renders timed out under load.
import './standard-setup';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { forgetQueryClient } from './query';
import { failOnUnexpectedRequests, unmockedFetch } from './requests';

// No test reaches the network: a request the test did not stub fails it (#214). Set directly, not with
// vi.stubGlobal, so that vi.unstubAllGlobals() after a test brings back this stand-in, not the real fetch.
globalThis.fetch = unmockedFetch;

// The shared React Query test (lib/query.test.tsx, a managed file) resets focus in its own afterEach while its query
// is still mounted, so the query reads /api/tags again after the test. Ignored until sirloinbh/project-standards#980 fixes it.
const knownStrayRequests = ['unmocked fetch: GET /api/tags'];

// What only health-log needs. The shared setup above brings the jsdom stand-ins and the resets every app needs
// (cleanup, timers, stubbed globals, mocks, localStorage, the theme class and the URL).
afterEach(() => {
  // Vitest runs afterEach hooks in reverse order, so this one runs before the shared one. The cards must unmount
  // before their query cache is forgotten, and before the requests are checked; the shared
  // cleanup() that follows then finds nothing left to do.
  cleanup();
  forgetQueryClient();
  // Last, so the resets above still run when it fails the test.
  failOnUnexpectedRequests(knownStrayRequests);
});
