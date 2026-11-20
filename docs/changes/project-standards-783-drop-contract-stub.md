# Drop the unused shared contract stub (project-standards#783)

- Removed `shared/contract.ts`, `backend/src/contract.ts` and `frontend/src/contract.ts`: nothing imports them (ADR-0026).
- Removed the unused `zod` dependency from `frontend/package.json` and refreshed the lockfile with `npm install --ignore-scripts`. The backend keeps its own `zod`.
- `scripts/contract.mjs`, the `contract:*` scripts and `knip.json` are managed and unchanged: the script is a no-op without `shared/contract.ts`, and knip may print a hint for the ignored missing files.
- Registry: `features.contract` is `false` for this app (project-standards#838).
