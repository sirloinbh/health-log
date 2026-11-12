# #41 Protecting external access: allow only the named IPs

- Issue: [#41](https://github.com/sirloinbh/health-log/issues/41)
- Branch: `docs/41-ip-allowlist-access`

## Purpose

This app has no login and stores health and medical records. Before it goes on a server, we decide on a way that only the owner can connect.

## Decision: 2026-11-04

The user decided "for now, allow access only from the named IPs (office, home)". The comparison and the limits are written in the [#41 comment](https://github.com/sirloinbh/health-log/issues/41#issuecomment-6620534558).

## Changes: 2026-11-04

- **Added `docs/access-protection.md`:** it describes which layer blocks access, what must be kept, the steps to add or change an IP, how to check after a deploy, and the limits.
  - The real boundary is the shared server firewall `allowed_cidrs`. To deploy, the web must be open outside the server, so we did not write that the `127.0.0.1` binding alone protects it.
- **Service rules in `AGENTS.project.md`:** wrote as rules that the DB and API ports are not exposed outside, and that only `allowed_cidrs` is used in the firewall.
- **`docs/project-setup.md`, `docs/next-steps/README.md`:** linked the new document and changed the next action of #41.

We did not change code. Allowing only the named IPs is already done by the firewall rules of `sirloinbh/shared-aws-infrastructure`. So what this repository must do is fix the rules in a document.

## Verification

- **Shared infrastructure:** checked in `main.tf` of `shared-aws-infrastructure`. `aws_lightsail_instance_public_ports` opens only 22 and 80, and both are `cidrs = var.allowed_cidrs`. `variables.tf` rejects `/0`.
- **`compose.yaml`:** the DB is `127.0.0.1:15403`, the web is `127.0.0.1:8103`, and the API has no host port.
- **`npm run check`:** passed. Only docs changed. 60 backend tests passed, 37 skipped (no `TEST_DATABASE_URL`, not counted as a success). 208 frontend tests passed, 2 skipped. 4 skill checks passed.
- **`npm run standards:check`:** passed. The 2 warnings about `req.query` in `backend/src/body.ts` existed before this change.

### What we could not check

- The real firewall rules (`aws lightsail get-instance-port-states`): there is no AWS CLI on this PC, so we could not query them.
- Whether the record API does not respond from a network that is not allowed: health-log is not deployed to the server yet, so we cannot check. After the deploy, do it as "Checks after a deploy" in `docs/access-protection.md` says, and add the result to this record.

## First review: 2026-11-04

We applied all 5 findings. The deploy preparation work among them was split into [#74](https://github.com/sirloinbh/health-log/issues/74).

- **Deploy contract (medium):** at first we wrote "the central deploy script opens the web port with `WEB_BIND` and `WEB_PORT`". That was wrong.
  - `remote-deploy.sh` only writes down the contract that `compose.yaml` must keep. `WEB_PORT` is read only for the status check.
  - The `compose.yaml` of health-log fixes the web to `127.0.0.1:8103`, and has no `${IMAGE_TAG}` tag either.
  - We wrote the "current state" separately in the document. Making `compose.yaml` match the contract was split into #74.
- **No open port (high):** the firewall opens only 80, and 80 is used by workout-memo. So there was no way to pass the check "the app opens from an allowed IP". We wrote the order of adding a firewall `port_info` and setting the server `.env` as "Opening to the outside", and split the real work into #74.
- **SSH tunnel (low):** wrote the command for health-log (`-L 8103:127.0.0.1:8103`).
- **IPv6 (low):** added to the check items that `ipv6Cidrs` is empty. The server uses only IPv4 now (`main.tf`).
- **Link (low):** changed it from the issue to the decision comment.
- We also ran the `npm run check` of the issue done criteria. The result is in "Verification" above.

## Second review: 2026-11-04

We confirmed that the 5 first findings were applied correctly. We applied the 4 new findings (all low). The review is at most 2 rounds, so we do no more.

- **Image tag:** added `image: health-*:${IMAGE_TAG:-local}` to step 1 of "Opening to the outside". If it is missing, the deploy works but rollback and cleaning of old images do not.
- **SSH tunnel port:** changed the local side to `18103`. If the local development environment is using `8103`, the local app opens instead of the tunnel, and records can go into the wrong DB.
- **Binding with a proxy:** wrote that if a host proxy is chosen, `WEB_BIND` stays at its default (`127.0.0.1`).
- **Query command:** `get-instance-port-states` needs the instance name and the profile. It does not run as it is, so we made it point to the operations document of the shared infrastructure.

## What is left

This PR does not close #41. These three are left.

- [User] Put the office and home public IPs in `allowed_cidrs` and run plan/apply.
- Open the web only to the allowed IPs (#74).
- Check the block after the first deploy.
