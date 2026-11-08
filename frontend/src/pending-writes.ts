// Saves and deletes still on their way, by the API path of the day they change (#71).
// Each card is keyed by date, so leaving a day and coming back mounts a new card. Reading before an
// earlier save has landed would show the old record, and a blank form saved over it would erase it.
const pending = new Map<string, Set<Promise<void>>>();
const listeners = new Set<(path: string) => void>();

/** Registers a write under `path` until it settles, and passes its result through unchanged. */
export function trackWrite<T>(path: string, write: Promise<T>): Promise<T> {
  const writes = pending.get(path) ?? new Set();
  pending.set(path, writes);
  const settled = write.then(
    () => undefined,
    () => undefined,
  );
  writes.add(settled);
  void settled.then(() => {
    writes.delete(settled);
    if (writes.size === 0 && pending.get(path) === writes) pending.delete(path);
    // After the bookkeeping, so a listener that reads at once does not wait for this write.
    for (const listener of [...listeners]) listener(path);
  });
  return write;
}

/**
 * Calls `listener` with the path of every write that settles from now on, succeeded or not, so a
 * card that adds up other cards' records can read again (#104). A failed write changes nothing,
 * but reading again then costs one request and needs no guess about what reached the server.
 * Returns the function that stops it.
 */
export function onWriteSettled(listener: (path: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resolves once no write is pending under a path starting with `prefix`, succeeded or not. When it
 * has to wait, writes started meanwhile are waited for too. With nothing pending it goes ahead at
 * once, so a write started in the same moment as the read is not covered.
 */
export async function writesSettled(prefix: string): Promise<void> {
  for (;;) {
    const waits = [...pending]
      .filter(([path]) => path.startsWith(prefix))
      .flatMap(([, writes]) => [...writes]);
    if (waits.length === 0) return;
    await Promise.all(waits);
  }
}

/** For tests: a test that stops before its save settles must not leave later tests waiting. */
export function forgetPendingWrites() {
  pending.clear();
}
