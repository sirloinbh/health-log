import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { createApp } from '../src/app.js';
import { document, operations } from '../src/openapi.js';
import { schemaOf } from '../src/standard/openapi.js';

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
  matchers?: ((path: string) => unknown)[];
};
// Routes of the app and of the routers mounted on it. A router's mount path cannot be read back
// from Express 5, so it is found among the mounts the table names; a router that matches none of
// them fails the build instead of being skipped.
function registeredRoutes(app: express.Express) {
  const mounts = [
    ...new Set(
      Object.keys(operations).map((route) => route.split(' ')[1].split('/').slice(0, 3).join('/')),
    ),
  ];
  const walk = (stack: Layer[], prefix: string): string[] =>
    stack.flatMap((layer) => {
      if (layer.route) {
        const path = layer.route.path === '/' ? '' : layer.route.path;
        return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${path}`);
      }
      if (!layer.handle?.stack) return [];
      const mount = mounts.find((candidate) => layer.matchers?.some((match) => match(candidate)));
      if (mount === undefined)
        throw new Error('A router is mounted at a path that is not in operations');
      return walk(layer.handle.stack, mount);
    });
  return walk((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
}

// Routes are only registered here, never called, so no database is needed.
const app = () => createApp({} as Pool);

test('docs/openapi.json is up to date with the operation table', async () => {
  const committed = JSON.parse(
    await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
  ) as unknown;
  assert.deepEqual(
    committed,
    JSON.parse(JSON.stringify(document)),
    'run `npm run openapi -w backend` and commit',
  );
});

test('the operation table and the registered routes are the same set', () => {
  assert.deepEqual(Object.keys(operations).sort(), [...registeredRoutes(app())].sort());
});

test('API paths start with /api and use lowercase words joined by hyphens', () => {
  const routes = registeredRoutes(app());
  assert.ok(routes.includes('GET /api/health'));
  for (const route of routes)
    assert.match(route, /^[A-Z]+ \/api(\/(:\w+|[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?))*$/);
});

test('guarded routes document the sign-in, 401 and 429; the public route does not', () => {
  const paths = document.paths as Record<
    string,
    Record<string, { security?: unknown[]; responses: Record<string, unknown> }>
  >;
  assert.deepEqual(paths['/api/health']!.get!.security, []);
  assert.ok(!('401' in paths['/api/health']!.get!.responses));
  assert.ok('429' in paths['/api/me']!.get!.responses);
});

test('a type JSON Schema cannot express fails instead of being skipped', () => {
  assert.throws(() => schemaOf(z.date()), /Date cannot be represented/);
});
