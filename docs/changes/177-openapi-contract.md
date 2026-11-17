# #177 Add OpenAPI document and shared contract

- Issue: [#177](https://github.com/sirloinbh/health-log/issues/177)
- Branch: `chore/177-openapi-contract`
- Central issue: sirloinbh/project-standards#570 (parent #567)

## Change

- `backend/src/openapi.ts`: builds an OpenAPI 3.1 document from the registered routes and the server's own Zod input schemas. All 43 routes (the app's two and the 12 routers) appear once with a summary, statuses, and a body or query schema where the route validates with one. `PUT /api/goals/:item` and `GET /api/body` describe their input in the summary, because the goal body depends on the item and the body list reads `from`/`to` without a schema. Routes behind a router also list 429 (the router's rate limit).
- `backend/src/openapi-cli.ts`, `npm run openapi`: writes `docs/openapi.json` without a database.
- `backend/test/openapi.test.ts`: fails when `docs/openapi.json` is stale, a route is undocumented, or a router is mounted at an unknown path.
- Input schemas in the routers are exported (no behavior change) so the generator can read them.
- `shared/contract.ts` (`idSchema`, `ApiError`), `scripts/contract.mjs`, `scripts/test/contract.test.mjs`: the shared contract and its copy check; `npm run contract:sync` writes `backend/src/contract.ts` and `frontend/src/contract.ts`. `contract:check` runs in `npm run check`.
- `.prettierignore`: `docs/openapi.json` (written by `JSON.stringify`).

## Reason

- Central standard sirloinbh/project-standards#570: one generated API document per app and one shared contract file.

## Verification

- Local: `npm run openapi` (no diff on a second run), format, lint, typecheck, `contract:check`, `standards:check`, `test:skills`, and the new backend openapi test (5 pass). The other backend tests need PostgreSQL and run in CI.
- `npm run knip` reports the three contract files as unused until the managed `knip.json` is synced from the central template (it already ignores them).
