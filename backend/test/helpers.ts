import type { Server } from 'node:http';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

// A shared machine's TEST_DATABASE_URL may name another project's test database (this PC had
// study_test). DB tests run only against health_test, so they never write elsewhere and never pass
// without checking this app's schema; otherwise node:test shows them skipped with this reason (#52).
export function testDatabaseSkip(url: string | undefined): false | string {
  let name = '';
  if (url) {
    try {
      name = new URL(url).pathname.slice(1);
    } catch {
      // Node's error carries the whole value (input), password included, and prints it; no cause.
      throw new Error(
        'TEST_DATABASE_URL을 주소로 읽을 수 없습니다(값은 비밀번호가 있을 수 있어 표시하지 않습니다).',
      );
    }
  }
  return name === 'health_test' ? false : `health_test 전용 DB가 아닙니다: ${name || '없음'}`;
}

/**
 * Runs `run` with a stand-in pool whose queries all go through one REPEATABLE READ transaction,
 * rolled back at the end (#137; issue #134 / PR #136 did the same inline for one read).
 * Other test files write at the same time. Inside the snapshot their later commits are invisible,
 * and rows written here get sequence values after every row the snapshot can see, so they are the
 * newest it holds.
 * A route's own transaction (`pool.connect()`, then any `BEGIN …` such as snapshotRead, then COMMIT
 * or ROLLBACK) becomes a savepoint of its own, so it runs as usual inside the snapshot; its isolation
 * level is the snapshot's. Requests must go one at a time: there is one connection.
 */
export async function inSnapshot(pool: Pool, run: (snapshot: Pool) => Promise<void>) {
  const client = await pool.connect();
  // Open savepoints, innermost last. Each has its own name, so a leftover cannot be released instead.
  const open: string[] = [];
  let count = 0;
  const translate = (text: string) => {
    const word = text.trim().split(/\s+/)[0]!.toUpperCase();
    if (word === 'BEGIN' || word === 'START') {
      const name = `app_transaction_${(count += 1)}`;
      open.push(name);
      return `SAVEPOINT ${name}`;
    }
    if (word === 'COMMIT' || word === 'END' || word === 'ROLLBACK' || word === 'ABORT') {
      const name = open.pop();
      if (!name) throw new Error(`inSnapshot: ${word} without a transaction`);
      return word === 'COMMIT' || word === 'END'
        ? `RELEASE SAVEPOINT ${name}`
        : `ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name}`;
    }
    return text;
  };
  const query = (text: unknown, ...rest: unknown[]) =>
    (client.query as (...args: unknown[]) => Promise<unknown>)(
      typeof text === 'string' ? translate(text) : text,
      ...rest,
    );
  const inner = { query, release: () => undefined };
  const snapshot = { query, connect: () => Promise.resolve(inner) } as unknown as Pool;
  let broken: Error | undefined;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await run(snapshot);
  } finally {
    // A lost connection fails the rollback too. The client still goes back, or pool.end() waits,
    // but marked broken so the pool drops it instead of handing it out again.
    await client.query('ROLLBACK').catch((error: Error) => (broken = error));
    client.release(broken);
  }
}

// Ports fetch() refuses with "bad port" (Fetch standard, 1024 and up). Windows can hand them out when
// its dynamic range starts low, which made tests fail now and then.
const fetchBlockedPorts = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

export async function listenForFetch(app: ReturnType<typeof createApp>) {
  for (;;) {
    const server: Server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    if (!fetchBlockedPorts.has(address.port)) return { server, port: address.port };
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function withApi(
  pool: Pool,
  run: (
    call: (
      path: string,
      init?: { method: string; body?: unknown },
    ) => Promise<{ status: number; data: Record<string, unknown> }>,
  ) => Promise<void>,
  options: Parameters<typeof createApp>[1] = {},
) {
  const { server, port } = await listenForFetch(createApp(pool, options));
  try {
    await run(async (path, init) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: init?.method ?? 'GET',
        headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      // A 204 has no body to read.
      const text = await response.text();
      return {
        status: response.status,
        data: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
      };
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
