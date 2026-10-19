import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Dev ports of the sibling personal apps that may run at the same time on this PC.
const otherViteDevPorts = {
  'workout-memo': 5173,
  'study-log': 5172,
  'life-journal': 5174,
  'money-ledger': 5175,
  'english-study': 5176,
  'plan-routine': 5177,
  'dev-career-portfolio': 5178,
};

const viteConfig = new URL('../../frontend/vite.config.ts', import.meta.url);
// The backend-only deploy repository has no frontend sources.
const configTest = existsSync(viteConfig) ? test : test.skip;

configTest('Vite dev server uses its own strict port and proxies the API port', () => {
  const source = readFileSync(viteConfig, 'utf8');
  const port = Number(source.match(/port:\s*(\d+)/)?.[1]);
  assert.equal(port, 5183);
  assert.match(source, /strictPort:\s*true/);
  assert.match(source, /'\/api':\s*'http:\/\/127\.0\.0\.1:3013'/);
  for (const [app, other] of Object.entries(otherViteDevPorts))
    assert.notEqual(port, other, `Vite port must not collide with ${app}`);
});
