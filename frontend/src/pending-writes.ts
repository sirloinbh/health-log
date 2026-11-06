// Saves and deletes still on their way, by the API path of the day they change (#71).
// Each card is keyed by date, so leaving a day and coming back mounts a new card. Reading before an
// earlier save has landed would show the old record, and a blank form saved over it would erase it.
const pending = new Map<string, Set<Promise<void>>>();

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
  });
  return write;
}

/**
 * Resolves once no write is pending under a path starting with `prefix`, succeeded or not. Writes
 * started while waiting are waited for too, since the read that follows must come after them.
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
