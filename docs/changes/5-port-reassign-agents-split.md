# #5 Move the ports to the central standard (slot 03) and split the AGENTS project rules

- Issue: https://github.com/sirloinbh/health-log/issues/5
- Central tracking issue: https://github.com/sirloinbh/project-standards/issues/99

## Purpose

- Apply the ports that the central registry assigned again so that the ports of the 8 apps do not overlap (project-standards ADR-0006).
- Before the first sync of the central standard turns AGENTS.md into the shared instructions, move the PR review and merge rules of this project to AGENTS.project.md and keep them.

## Changes

| Kind                       | Before | After         |
| -------------------------- | ------ | ------------- |
| Web                        | 8093   | 8103          |
| API                        | 3013   | 3103          |
| Vite                       | 5183   | 5203          |
| Host DB                    | 55443  | 15403         |
| e2e API and web (reserved) | None   | 3203 and 5303 |

- Files whose ports changed: `.env.example`, `README.md`, `backend/Dockerfile`, `backend/src/server.ts`, `compose.yaml`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `backend/test/dev-ports.test.ts`, `AGENTS.md`
- Step 5 of `AGENTS.md` (the automated code review and merge rules) was moved word for word into "Work steps" of `AGENTS.project.md`, and `AGENTS.md` now says to read that file.
- The past records in `docs/changes/`, `docs/daily/`, and `docs/next-steps/` show the state of their time, so they were not changed.

## What the user does

- In the local `.env`, change the port in `DATABASE_URL` from `55443` to `15403` and `PORT` from `3013` to `3103`. Do not commit `.env`.

## Verification

- 2026-10-22: the result is written in the PR body.
