import { Pool } from 'pg';

import { createApp } from './app.js';
import { listenHost, sharedAuth } from './standard/auth.js';
import { createPool } from './standard/db.js';

const port = Number(process.env.PORT ?? 3103);
const pool = createPool(new Pool({ connectionString: process.env.DATABASE_URL }));
// The shared sign-in guards /api; without it the API listens on 127.0.0.1 only (project-standards#866, #898).
const auth = sharedAuth();
const server = createApp(pool, {
  auth,
  toolsPublicKey: process.env.AI_TOOLS_PUBLIC_KEY,
  workoutMemoUrl: process.env.WORKOUT_MEMO_URL,
}).listen(port, listenHost(auth !== undefined), () => console.log(`API http://localhost:${port}`));
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
