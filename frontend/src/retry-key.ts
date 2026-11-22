/**
 * One `Idempotency-Key` per user action (#196). Sending the same request again after it got no answer
 * keeps its key, so the server can tell a retry from a new action and answers it without adding the
 * entries twice. A different request, or one the server answered, gets a new key.
 */
export function createRetryKeys(newKey: () => string = () => crypto.randomUUID()) {
  let last: { request: string; key: string } | undefined;
  return {
    keyFor(request: string) {
      if (last?.request !== request) last = { request, key: newKey() };
      return last.key;
    },
    /** The server answered (success or refusal): the next request is a new action. */
    answered() {
      last = undefined;
    },
  };
}
