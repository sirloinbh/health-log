# Drop the unused frontend zod dependency (project-standards#783)

- Removed `zod` from `frontend/package.json` and refreshed the lockfile with `npm install --ignore-scripts`. Nothing in `frontend/` imports it; the backend keeps its own `zod`.
- The central standard no longer requires it (project-standards#840), so `node .standards/check.mjs` passes without it.
- The managed `.standards/manifest.json` still listed the frontend `dependencies.zod` (it is written at sync time from the app's package), so the entry is removed by hand here; the next sync writes the same result.
