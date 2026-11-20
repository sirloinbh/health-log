# #74 Serve health-log through the shared HTTPS proxy

- Issue: [#74](https://github.com/sirloinbh/health-log/issues/74)
- Branch: `docs/74-proxy-access`

## Change

- `docs/access-protection.md`: the server setup now goes through the shared reverse proxy (`https://health-log.daysofme.com` on 443) instead of opening a firewall port `8103`. The server keeps `WEB_BIND=127.0.0.1` (the default), and the doc warns never to use `0.0.0.0`. The layers table adds the proxy and the shared sign-in (#167), and the after-deploy checks add the 401 check and `ss -ltn`.
- `.env.example`: the server note no longer says `WEB_BIND=0.0.0.0`.
- `docs/next-steps/README.md`: the #41 and #74 rows now say that only the first deploy and its checks are left.

## Reason

- The #41 status comment (2026-11-15) says the separate port is no longer needed once the shared proxy exists (project-standards ADR-0012, #253, #254). The old doc still told the server to bind the plain-HTTP web on `0.0.0.0`.
- Checked on 2026-11-18: the registry lists health-log as active with `ports.web` 8103, `dns.tf` has the `health-log` name, the firewall already opens 443 to `allowed_cidrs`, and `frontend/nginx.conf` already answers `health-log.daysofme.com` and takes the client IP from `X-Forwarded-For`.

## Verification

- Docs only. Prettier check on the changed files.
