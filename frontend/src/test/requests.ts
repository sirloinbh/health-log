// Requests no fake was set up to answer (#214). The app turns a failed request into a message on the screen, so
// rejecting one is not enough to fail a test; each is noted here and the setup fails the test when it ends.
const unexpected: string[] = [];

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Notes a request the test did not expect, and rejects it as an unreachable server would. */
export function unexpectedRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  why = 'unexpected request',
) {
  const message = `${why}: ${init?.method ?? 'GET'} ${urlOf(input)}`;
  unexpected.push(message);
  return Promise.reject(new Error(message));
}

/** For the global stand-in: a test that reaches `fetch` without stubbing it. */
export const unmockedFetch: typeof fetch = (input, init) =>
  unexpectedRequest(input, init, 'unmocked fetch');

/** For test setup: throws, failing the test, if it sent any request no fake answered, apart from `known`. */
export function failOnUnexpectedRequests(known: readonly string[] = []) {
  const found = unexpected.splice(0).filter((message) => !known.includes(message));
  if (found.length > 0)
    throw new Error(`The test sent requests it did not expect:\n${found.join('\n')}`);
}
