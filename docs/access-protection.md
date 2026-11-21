# Protecting external access

Two layers protect the records: **the server opens only to the IPs we name (office, home)**, and **every `/api` path except `/api/health` needs the shared sign-in** (#167). The allow-list decision and the comparison are in the [#41 decision comment](https://github.com/sirloinbh/health-log/issues/41#issuecomment-6620534558).

## How access is blocked

| Layer           | Setting                                                                                                                                                                                 | Where it is managed                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Server firewall | The Lightsail firewall opens SSH (22), HTTP (80) and HTTPS (443) only to the IPs in `allowed_cidrs`. The variable validation rejects opening to everyone (`/0`)                         | `main.tf`, `variables.tf`, `terraform.tfvars` in `sirloinbh/shared-aws-infrastructure` |
| Shared proxy    | One nginx on the server takes 80 and 443 for every app and forwards `health-log.daysofme.com` to `127.0.0.1:8103` (the registry `ports.web`). It is generated from the central registry | `docs/server-proxy.md` in `sirloinbh/project-standards`                                |
| App ports       | The web binds to `127.0.0.1:8103` locally and on the server, so only the proxy reaches it. The DB binds only to `127.0.0.1:15403`. The API opens no host port and goes through the web  | `compose.yaml` in this repository, `/opt/health-log/.env` on the server                |
| Shared sign-in  | Every `/api` path but `/api/health` answers 401 without a session from `auth.daysofme.com`                                                                                              | `backend/src/app.ts`, `compose.yaml` (`shared-auth` network) in this repository        |

- Do not write the real IPs in this public repository. Keep them only in `terraform.tfvars` of `shared-aws-infrastructure` (excluded from git).
- The firewall covers the whole shared server. The other apps on the same server use the same IP list.
- The server uses IPv4 only. There is no way in over IPv6.

## Current state (2026-11-18)

- **Deploy contract:** `compose.yaml` follows the contract of the central deploy script (`deploy/remote-deploy.sh`) (#74).
  - Web port: `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8103}`.
  - Image tags: `health-frontend:${IMAGE_TAG:-local}`, `health-backend:${IMAGE_TAG:-local}`. On the server a commit tag is added, so rollback and cleaning of old images work.
- **Infrastructure is ready:** the registry lists health-log as active, DNS has `health-log.daysofme.com`, and the firewall already opens 443 to the allow list. No firewall change is needed for health-log.
- **Not reachable yet:** health-log is not deployed to the server yet.
- **What is left:** the first deploy, then the checks below (#74, #41, #167).

## Server setup

The way in from outside is **the shared HTTPS proxy** (project-standards ADR-0012, #253, #254). The earlier plan to open a separate firewall port `8103` is dropped: the web stays on `127.0.0.1` and is never opened in the firewall.

| Item                            | Value                                              | Where it is set                                               |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `WEB_BIND` in the server `.env` | `127.0.0.1` (written by the first deploy; keep it) | `/opt/health-log/.env` (created by `deploy/bootstrap-env.sh`) |
| `WEB_PORT` in the server `.env` | `8103` (the registry `ports.web`; keep it)         | `/opt/health-log/.env` (created by `deploy/bootstrap-env.sh`) |
| Address to connect to           | `https://health-log.daysofme.com`                  | Only from allowed IPs                                         |

- **Never set `WEB_BIND=0.0.0.0` on the server.** The proxy needs only `127.0.0.1`, and binding wider would put the plain-HTTP web on every interface.
- Do not write `IMAGE_TAG` in `.env`. The deploy script sets it from the commit.
- A change to `.env` takes effect at the next deploy (or at `docker compose up -d` in `/opt/health-log`).
- If the web port ever changes, change the registry `ports.web` too and regenerate the proxy config (project-standards `docs/server-proxy.md`, "App added or web port changed").
- **Local note:** the image names are fixed as `health-*:local`. Several worktrees on one PC use the same name, so if you build in one place, the other worktrees also start with that image at their next `up`. To keep each worktree apart, write `IMAGE_TAG=<worktree name>` in the `.env` of that worktree.
- The DB (`127.0.0.1:15403`) and the API (no host port) stay as they are.

## What must be kept

- Do not expose the web, DB or API ports outside the server. Only the shared proxy is reached from outside.
- The firewall rules for 80 and 443 use only `allowed_cidrs` as their `cidrs`.
- Do not put a wide range in `allowed_cidrs` until widening access is decided again (see "Limits").

## Adding or changing an IP

1. Check the public IP at that place: `https://checkip.amazonaws.com`
2. Add it, or fix it, as `"<IP>/32"` in `allowed_cidrs` in `terraform.tfvars` of `shared-aws-infrastructure`.
3. Run plan and apply as section 7 of the [operations document](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) of that repository says. Only the firewall rule changes, and the server stays the same.

## Checks after a deploy

Check after the first deploy and after you change an IP, and record the result in the change record.

- From an allowed IP, `https://health-log.daysofme.com` opens, sends a signed-out visitor to the sign-in, and `/api/health` answers 200.
- From an allowed IP while signed out, a record API (`/api/sleep/<date>` and so on) answers 401.
- From a network that is not allowed (for example mobile data), the address does not respond (connection timeout).
- On the server, `ss -ltn` shows `8103` only on `127.0.0.1`.
- In the server firewall rules, no port has `/0` in `cidrs`, and `ipv6Cidrs` is empty. The query command (`aws lightsail get-instance-port-states`, with the instance name and the profile) is in the [operations document](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) of `shared-aws-infrastructure`.

## Limits

- **Home IP change:** the public IP of a home line can change. When it changes, access is blocked, so fix it with the steps above.
- **Access from outside:** it does not open from mobile data or from other places. The shared sign-in is what would make that possible later; widening the allow list is a separate decision (#41).
- **Proxy down:** if the shared proxy is down, connect through an SSH tunnel: run `ssh -i ~/.ssh/workout-memo-lightsail -L 18103:127.0.0.1:8103 ubuntu@<static_ip>`, then open `http://localhost:18103`.
  - The left side is deliberately not `8103`. If the local development environment is using `8103`, the local app opens instead of the tunnel, and records can go into the wrong DB.
