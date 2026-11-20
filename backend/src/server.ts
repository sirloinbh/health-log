import { createApp } from './app.js';
import { connectPool } from './pool.js';
import { sharedAuth } from './standard/auth.js';

const port = Number(process.env.PORT ?? 3103);
const pool = connectPool(process.env.DATABASE_URL);
const server = createApp(pool, { auth: sharedAuth() }).listen(port, '0.0.0.0', () =>
  console.log(`API http://localhost:${port}`),
);
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
