# Drop the unused shared contract stub (project-standards#783)

- Removed `shared/contract.ts`, `backend/src/contract.ts` and `frontend/src/contract.ts`: nothing imports them (ADR-0026).
- The unused `zod` dependency stays in `frontend/package.json` for now: it is a centrally managed field (`dependencies.zod`, templates/index.json), so removing it must happen centrally first.
- `scripts/contract.mjs`, the `contract:*` scripts and `knip.json` are managed and unchanged: the script is a no-op without `shared/contract.ts`, and knip may print a hint for the ignored missing files.
- Registry: `features.contract` is `false` for this app (project-standards#838).
