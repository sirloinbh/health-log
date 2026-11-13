# #74 The compose deploy contract (the part in this repository)

- Issue: [#74](https://github.com/sirloinbh/health-log/issues/74) (this PR is `Refs #74`)
- Branch: `chore/74-compose-contract`

## Purpose

Keep the `compose.yaml` contract that the central deploy script (`deploy/remote-deploy.sh`) expects when health-log goes on the shared server. Decide the server `.env` values and the port to open in the firewall in a document.

The firewall change (`main.tf` of `sirloinbh/shared-aws-infrastructure`), `terraform plan` and `apply`, the server `.env`, and the first deploy and its check are done by the user. So #74 is not closed by this PR.

## What we decided

- **The way in:** a new port. The issue task is to add a firewall `port_info`. Port 80 is used by the workout-memo web, so sharing 80 would need a new host proxy.
- **Web port:** use the health-log web port `8103` of the central registry on the server too. The local and server ports are the same, so the SSH tunnel notes (`-L 18103:127.0.0.1:8103`) stay as they are.
- **Server `.env`:** `WEB_BIND=0.0.0.0`, `WEB_PORT=8103`. The deploy script sets `IMAGE_TAG`.

## Changes: 2026-11-08

- **`compose.yaml`**
  - api: `image: health-backend:${IMAGE_TAG:-local}`
  - web: `image: health-frontend:${IMAGE_TAG:-local}`
  - web port: `'${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8103}:80'`. If no value is set, it is the same `127.0.0.1:8103` as before.
  - It has the same shape as the `compose.yaml` of workout-memo (we did not change that repository).
- **`.env.example`:** added a comment that `WEB_BIND` and `WEB_PORT` are written only on the server.
- **`docs/access-protection.md`:** fixed the "current state" and added the "Server setup" section. It lists the server `.env` values, the port to open, and the address to connect to. It does not write the real IPs.
- **#74 comment:** left a draft of the `port_info` to put in `aws_lightsail_instance_public_ports` of `main.tf`. We did not change that repository and did not create an issue.

## Verification

- The Docker daemon is not running on this PC (no `dockerDesktopLinuxEngine` pipe). But `docker compose config` works without the daemon, so we checked with it as it is. We used `--env-file /dev/null` and temporary values (`POSTGRES_PASSWORD=x`, `NODE_AUTH_TOKEN=x`) instead of `.env`.
  - Defaults: web `127.0.0.1:8103`, images `health-frontend:local` and `health-backend:local`. The DB stays at `127.0.0.1:15403`.
  - Server values (`WEB_BIND=0.0.0.0`, `WEB_PORT=8103`, `IMAGE_TAG=0123abc`): web `0.0.0.0:8103`, images `health-*:0123abc`. The DB stays at `127.0.0.1:15403`.
- `npm run check` (without a DB): see the PR record below.

## Changes: 2026-11-08 (first review applied)

The first review (a read-only review separate from the context that wrote it) found no blocking problem.

- What we found by checking the deploy script:
  - `deploy/remote-deploy.sh` tags the `health-backend` and `health-frontend` images with the commit tag and cleans them up.
  - `WEB_PORT` is read from `/opt/health-log/.env` and used only for the status check at `127.0.0.1:$WEB_PORT/api/health`. It works even if `WEB_BIND=0.0.0.0`.
  - `deploy/notify.sh` reads it in the same way.
- **Applied (low):** fixed the expected `plan` result in the #74 comment from "one change" to "one replacement (-/+)". `aws_lightsail_instance_public_ports` is created again when `port_info` changes, and 22, 80, and 8103 may close briefly during the apply.
- **Applied (low):** in "What must be kept" of `docs/access-protection.md`, we stated the way in that is used now (the new port 8103).
- **Left (low):** "ports (bound to 127.0.0.1)" in `AGENTS.md` is for local. The server web is `0.0.0.0:8103`. `AGENTS.md` is a centrally managed file (`templates/app/` of `sirloinbh/project-standards`), so we did not fix it in this PR. The source of the server values is "Server setup" in `docs/access-protection.md`.

## Changes: 2026-11-08 (second review applied)

The second (last) review also found no blocking problem. CI (`ci.yml` does not use compose), `deploy/backup.sh`, `deploy/report.sh`, `deploy/notify.sh`, and `docker compose build` work as before.

- **Applied (low):** the image names are fixed, so the worktrees of one PC share `health-*:local`. We wrote in `docs/access-protection.md` how to keep a separate `IMAGE_TAG` per worktree.
- **Applied (low):** added to the `.env.example` comment not to set `WEB_BIND` and `WEB_PORT` as shell environment variables either. If `WEB_BIND=0.0.0.0` is left locally, the web is open to the same network.
- **Applied (low):** wrote that a change to the server `.env` takes effect at the next deploy or at `docker compose up -d`.
- By the rule, there is no third review.
