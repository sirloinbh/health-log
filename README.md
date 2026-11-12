# Meal, sleep, and health log

A personal service for recording meals, sleep, and health status by date and for seeing how they change. There is one user, and it runs locally with no login.

## Development baseline

Node.js **24.21.0**, npm **11.19.0**. Install with `npm ci --ignore-scripts` (after the user confirms), format with `npm run format`, and run all checks with `npm run check`. The full baseline is in the [development setup document](docs/project-setup.md) and [AGENTS.md](AGENTS.md).

Changes go in this order: **GitHub issue → branch named with the issue number → implementation, tests, and docs record → `npm run check` → PR → automated code review (at most 2 rounds; follow-up commits, and large changes go to a new issue) → the agent merges after CI passes**.

## Run

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open http://localhost:8103 . Change the password in `.env` before you run it. Data is stored in the `health-log-data` volume, and `docker compose down -v` deletes it.

Development run:

```powershell
docker compose up -d db
npm run dev
```

Vite http://localhost:5203, API http://localhost:3103/api/health, host DB port 15403.

## Verification

- `npm run check`: format, lint, types, tests, the skill sync check, and the build.
- The database integration tests need `TEST_DATABASE_URL`, pointing to a dedicated test database with the migrations applied. They are skipped without it.
- GitHub Actions runs all checks with a PostgreSQL service and builds the Docker image.

## Repository layout

This repository is an umbrella monorepo that holds all the source. `frontend`, `backend`, and `database` are synced with `git subtree split` to the private deploy repositories `health-log-frontend`, `health-log-backend`, and `health-log-db` (`scripts/push-repositories.ps1`, only on request). The AWS infrastructure is managed in the shared repository `shared-aws-infrastructure`.

## Docs

- [AI instructions](AGENTS.md) · [Claude instructions](CLAUDE.md) · [DB](database/README.md)
- [Change records](docs/changes/README.md) · [Daily logs](docs/daily/README.md) · [Next steps](docs/next-steps/README.md)
