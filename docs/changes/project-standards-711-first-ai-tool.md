# First AI tool: list_meals, with the audit_log migration (project-standards#711)

- `backend/src/ai-tools.ts` (new): one read-only tool, `list_meals` (input `{ date: YYYY-MM-DD }`, one day per call). It calls the same `mealsOfDay` function as `GET /api/meals/:date` (moved out of `mealsRouter` as a pure move), so the tool and the route cannot drift. Entity `meal_entry`, action `read`.
- `backend/src/app.ts`, `server.ts`: `registerToolRoutes(app, { app: 'health-log', tools, pool, publicKey, requireBinding: true })`; `AI_TOOLS_PUBLIC_KEY` is passed from the environment. Without the key, `/internal/tools` is the JSON 404.
- `database/migrations/018_audit_log.sql`: copied unchanged from the project-standards scaffold (`002_audit_log.sql`). Number 018 follows the highest applied file (017; there is no 010 in this repo).
- `compose.yaml`, `.env.example`: `AI_TOOLS_PUBLIC_KEY`, the `shared-ai` network with the alias `health-log-api`, and the external `shared-ai` network. The server deploy reads the key from SSM.
- Tests: `backend/test/ai-tools.integration.test.ts` (list with scopes, signatures, validation, audit rows `denied`, `ok`, `error`; tools off without the key) and `ai-tools-binding.test.ts` (unbound, wrong-tool and replayed tokens are 401).
- No write tool; that is a later decision of the user (ADR-0024, first-ai-tool recipe).
