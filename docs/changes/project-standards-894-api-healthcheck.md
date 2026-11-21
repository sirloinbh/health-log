# Add the api healthcheck to compose.yaml (project-standards#894)

- `api` gets a `healthcheck` that fetches `/api/health` on port 3103 with `node` (the image has no curl): 5 s interval, 15 retries, 10 s start period, copied from `scaffold/app/compose.yaml`.
- `web` waits for it with `depends_on: api: condition: service_healthy`, so `docker compose up -d --wait` knows when the API is ready.
- `node .standards/check.mjs` no longer prints the api healthcheck warning. `docker compose config` is valid.
- Merging to main deploys the app; the autodeploy was checked afterwards (deployed commit = main, health 200).
