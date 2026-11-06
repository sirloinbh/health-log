import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

// #53. deploy/remote-deploy.sh runs `node dist/migrate.js` and the image starts dist/server.js, so
// the build must put both at the top of its output. A tsconfig change (for example including test/)
// would move them to dist/src/ without failing any other test.
test('the build emits migrate.js and server.js at the top of its output', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'health-build-'));
  try {
    await run(process.execPath, [tsc, '-p', 'tsconfig.json', '--outDir', outDir], {
      cwd: backend,
    });
    assert.ok(existsSync(join(outDir, 'migrate.js')), 'migrate.js');
    assert.ok(existsSync(join(outDir, 'server.js')), 'server.js');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
