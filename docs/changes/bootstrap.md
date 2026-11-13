# Initial development environment setup (before the issues)

- Date: 2026-10-19 (Asia/Seoul)
- Baseline: the [development environment setup document](../project-setup.md) of workout-memo (workout-memo PR #57)

## Purpose

Prepare the development environment, a minimal app, verification, and repositories so that the health-log project can be developed issue by issue. Detailed features start after the user registers issue cards.

## Content

- Stack: React 19 + Vite + TypeScript, Express 5 + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions. Node 24.21.0 / npm 11.19.0.
- Dependencies: used only the same packages and versions as the lock file of workout-memo (only the workspace names changed). Installed with `npm ci --ignore-scripts` with user approval, and added no new package. `npm audit`: 0 vulnerabilities.
- Minimal app: `GET /api/health` (DB check, service date), 404 and 500 error handling with messages in Korean, a sidebar, a page header, a status display, an empty state screen, and design tokens based on CSS variables.
- DB: `database/migrations/001_initial.sql` (`app_settings`, safe to run again). For an existing DB only the `psql -f` way is described.
- Tests: unit (`health.test.ts`), DB integration (`db.integration.test.ts`, skipped without `TEST_DATABASE_URL`), UI (`app-ui.test.ts`, vm harness), and the skill sync check.
- AI instructions: `AGENTS.md`, `CLAUDE.md`, and 3 skills (`skills/` source, `.claude/skills/` copy).
- Repositories: the umbrella `sirloinbh/health-log` + the deploy sub repositories `health-log-frontend`, `health-log-backend`, and `health-log-db` (private, subtree). AWS uses the shared `shared-aws-infrastructure`.

## Verification

- Applied the migrations as UTF-8 to the dedicated test DB `health_log_test` (the test container of workout-memo) and ran `npm run check`: **exit 0**.
  - App and DB tests **8 pass / 0 fail / 0 skip** (the DB integration tests actually ran)
  - Skill check **4 pass / 0 fail / 0 skip**
  - Format, lint, and types passed, and the frontend and backend builds passed
- The real browser check was done in study-log, made from the same template (mobile 390px with no horizontal scroll, status and menu switching normal, PC 1440px normal). This project differs only in the title and ports, and was checked with the UI test.
- The initial commit was pushed directly to `main` to create the repositories. All changes after that go issue → branch → PR.
- The Docker image build is checked by the `docker-build` job of GitHub Actions. We did not run a local `docker compose up`.
