# Protecting external access

This app has no login. So **access is allowed only from the IPs we name (office, home).** The decision and the comparison are in the [#41 decision comment](https://github.com/sirloinbh/health-log/issues/41#issuecomment-6620534558).

## How access is blocked

| Layer           | Setting                                                                                                                                                                                              | Where it is managed                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Server firewall | The Lightsail firewall opens SSH (22) and web (80) only to the IPs in `allowed_cidrs`. The variable validation rejects opening to everyone (`/0`)                                                    | `main.tf`, `variables.tf`, `terraform.tfvars` in `sirloinbh/shared-aws-infrastructure` |
| App ports       | The DB binds only to `127.0.0.1:15403`. The web is `127.0.0.1:8103` locally and `0.0.0.0:8103` on the server (see "Server setup" below). The API opens no host port and goes through the web (nginx) | `compose.yaml` in this repository, `/opt/health-log/.env` on the server                |

- Do not write the real IPs in this public repository. Keep them only in `terraform.tfvars` of `shared-aws-infrastructure` (excluded from git).
- The firewall covers the whole shared server. The other apps on the same server use the same IP list.
- The server uses IPv4 only. There is no way in over IPv6.

## Current state (2026-11-08)

- **Deploy contract:** `compose.yaml` follows the contract of the central deploy script (`deploy/remote-deploy.sh`) (#74).
  - Web port: `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8103}`. The local default is the same `127.0.0.1:8103` as before.
  - Image tags: `health-frontend:${IMAGE_TAG:-local}`, `health-backend:${IMAGE_TAG:-local}`. On the server a commit tag is added, so rollback and cleaning of old images work.
- **Not reachable from outside yet:** health-log is not deployed to the server yet. The firewall still opens only 22 and 80. Port 80 is used by workout-memo.
- **What is left:** adding the firewall port and the server `.env` in "Server setup" below, and the checks after the first deploy. The user does these (#74).

## Server setup

We chose a **new port** for the way in from outside. The web port is the health-log web port `8103` from the central registry as it is. The issue task is to add a firewall `port_info`, and port 80 is used by the workout-memo web, so sharing it would need a new host proxy.

| Item                            | Value                                        | Where it is set                                                                 |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| `WEB_BIND` in the server `.env` | `0.0.0.0`                                    | `/opt/health-log/.env`                                                          |
| `WEB_PORT` in the server `.env` | `8103`                                       | `/opt/health-log/.env`                                                          |
| Port to open in the firewall    | TCP `8103`, only `cidrs = var.allowed_cidrs` | `main.tf`, `aws_lightsail_instance_public_ports` in `shared-aws-infrastructure` |
| Address to connect to           | `http://<static_ip>:8103`                    | Only from the allowed IPs                                                       |

- Do not write `IMAGE_TAG` in `.env`. The deploy script sets it from the commit.
- A change to `.env` takes effect at the next deploy (or at `docker compose up -d` in `/opt/health-log`).
- **Local note:** the image names are fixed as `health-*:local`. Several worktrees on one PC use the same name, so if you build in one place, the other worktrees also start with that image at their next `up`. To keep each worktree apart, write `IMAGE_TAG=<worktree name>` in the `.env` of that worktree.
- If the web is open on `0.0.0.0`, the firewall decides whether it can be reached from outside the server. So **the real boundary is the firewall**. Even if you change `.env` first and open the firewall later, it cannot be reached from outside in between.
- The DB (`127.0.0.1:15403`) and the API (no host port) stay as they are.
- The draft of the firewall change (`port_info`) is in the [#74 comment](https://github.com/sirloinbh/health-log/issues/74). The user runs plan and apply as the [operations document](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) of `shared-aws-infrastructure` says.

## What must be kept

- Do not expose the DB and API ports outside the server.
- When you open the web port to the outside (now the new port 8103, and the same if it moves to a host proxy later), use only `allowed_cidrs` as the `cidrs` of the firewall rule.
- Until a login is built to replace private access, do not put a wide range in `allowed_cidrs`.

## Adding or changing an IP

1. Check the public IP at that place: `https://checkip.amazonaws.com`
2. Add it, or fix it, as `"<IP>/32"` in `allowed_cidrs` in `terraform.tfvars` of `shared-aws-infrastructure`.
3. Run plan and apply as section 7 of the [operations document](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) of that repository says. Only the firewall rule changes, and the server stays the same.

## Checks after a deploy

Check after the first deploy and after you change an IP, and record the result in the change record. The first item can pass only when "Server setup" above is done.

- From an allowed IP, the app and `/api/health` open.
- From a network that is not allowed (for example mobile data), the web and the record API (`/api/sleep/<date>` and so on) do not respond (connection timeout).
- In the server firewall rules, no port has `/0` in `cidrs`, and `ipv6Cidrs` is empty. The query command (`aws lightsail get-instance-port-states`, with the instance name and the profile) is in the [operations document](https://github.com/sirloinbh/shared-aws-infrastructure/blob/main/docs/operations.md) of `shared-aws-infrastructure`.

## Limits

- **Home IP change:** the public IP of a home line can change. When it changes, access is blocked, so fix it with the steps above.
- **Access from outside:** it does not open from mobile data or from other places. If it becomes necessary, look at a VPN or a login again.
- **No encryption:** it is HTTP now, so what is sent is not encrypted. The content may be visible when it passes through the office network.
  - If that worries you, connect through an SSH tunnel: run `ssh -i ~/.ssh/workout-memo-lightsail -L 18103:127.0.0.1:8103 ubuntu@<static_ip>`, then open `http://localhost:18103`.
  - The left side is deliberately not `8103`. If the local development environment is using `8103`, the local app opens instead of the tunnel, and records can go into the wrong DB.
  - If you changed the web port on the server, change the `8103` on the right to that port.
