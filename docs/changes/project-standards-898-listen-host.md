# Listen on 127.0.0.1 when the shared sign-in is off (project-standards#898)

- `backend/src/server.ts`: `const auth = sharedAuth();` then `.listen(port, listenHost(auth !== undefined), ...)` instead of the literal `'0.0.0.0'`, using the managed `listenHost` from `standard/auth.ts` (project-standards#866).
- On the server compose sets `AUTH_INTERNAL_URL`, so the API still listens on `0.0.0.0` (the proxy and shared-ai reach it on the Docker network). A local run without the sign-in (`AUTH_DISABLED=1`) now listens on `127.0.0.1` only. `HOST` still overrides.
- Checked locally: `AUTH_DISABLED=1` binds `127.0.0.1:<port>`, `AUTH_INTERNAL_URL` set binds `0.0.0.0:<port>`.
