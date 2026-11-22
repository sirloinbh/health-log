// The shared setup first (#250): it brings the jest-dom matchers and Testing Library's 8 s wait for findBy* and
// waitFor. Without this import the wait stayed at the 1 s default and first renders timed out under load.
import './standard-setup';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { forgetPendingWrites } from '../pending-writes';

// jsdom has no matchMedia; the toaster and drawer read it to follow the system theme.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// jsdom has no ResizeObserver; a checkbox inside a form measures its hidden input with it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  forgetPendingWrites();
  document.documentElement.className = '';
  // Pages are URLs; each test starts on the overview.
  window.history.replaceState(null, '', '/');
});
