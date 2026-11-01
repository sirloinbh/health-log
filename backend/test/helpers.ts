import type { Server } from 'node:http';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

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
