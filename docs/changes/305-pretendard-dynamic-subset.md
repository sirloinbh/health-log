# #305 Load only the Pretendard chunks a page uses (design-tokens 1.1.0)

- Issue: [#305](https://github.com/sirloinbh/health-log/issues/305) (parent [#303](https://github.com/sirloinbh/health-log/issues/303))
- Branch: `chore/standards-sync-864289c` (the sync PR #315)
- Central work: sirloinbh/project-standards#989 (PR #990) and #991 (PR #992)

## Problem

`@sirloinbh/design-tokens` 1.0.0 had one `@font-face` for the full `PretendardVariable.woff2` with no `unicode-range`. Every first visit downloaded the whole file: a cold load of `/` transferred 2,057,988 bytes of font, about 10 times the gzipped JS.

## Decision (2026-11-22)

The user chose option A on #305: fix it in the central package rather than in health-log alone, and release design-tokens 1.1.0 with the official Pretendard 1.3.9 dynamic subset (92 woff2 chunks, each with a `unicode-range`). The family name, the weights and the OFL license stay the same. The user approved this health-log bump 1.0.0 → 1.1.0 as a package change, with `--ignore-scripts` and the lockfile change. The user pushed the tag `design-tokens/v1.1.0` (publish run 45009652071 passed), and project-standards PR #992 raised it in `versions.json`, which opened this sync PR.

## Change

| File                       | Change                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `frontend/package.json`    | `@sirloinbh/design-tokens` 1.0.0 → 1.1.0 (sync commit)                                                                |
| `.standards/manifest.json` | Central SHA 7638be2 and the new managed versions (sync commit)                                                        |
| `package.json`             | `@lhci/cli` 0.16.0 → 0.16.1 (sync commit, project-standards #993; see below)                                          |
| `package-lock.json`        | The `@sirloinbh/design-tokens` entry (version, `resolved` URL, `integrity`), then the `@lhci/cli` 0.16.1 tree (below) |

The lockfile was rewritten by the user with `npm install --ignore-scripts --engine-strict=false --no-audit --no-fund` on this branch, because GitHub Packages needs the user's token (project-standards `docs/user-steps.md` section 12). No new external package comes in; 1.1.0 has 0 dependencies. No app code changes: `tokens.css` and the font stack are the same.

## Also in this sync PR: `@lhci/cli` 0.16.1 (project-standards #993)

While this PR was open, project-standards #993 (PR #994, merge 7638be2) raised the shared `@lhci/cli` pin from 0.16.0 to 0.16.1 for the `proxy-agent` 8 / `basic-ftp` security fix, and the sync bot rebuilt this branch to carry it too. health-log's lockfile still had 0.16.0, so it needed a second lockfile change.

- The user approved it on 2026-11-22 and ran the same `npm install` again: 14 packages added, 13 removed, 27 changed, only `package-lock.json` changed.
- Checked: all 54 changed `node_modules/` entries are in the `@lhci/cli` tree and are dev-only. The root entry changes only the `@lhci/cli` pin. The only new package names are `proxy-agent-negotiate` and `quickjs-wasi`, and `@tootallnate/quickjs-emscripten` is gone. No changed entry has an install script. `npm ls --all` is clean.
- One shared entry moved: the root `tldts-core` 7.5.4 → 7.5.5 (with lighthouse's `tldts-icann`). The frontend's `jsdom` → `tough-cookie` → `tldts` 7.4.19 also uses it (range `^7.4.19`). The user accepted this.
- npm also took the newest in-range versions of some lighthouse dependencies that 0.16.1 does not strictly need. `sentry` 0.50.0 is Sentry's own CLI (`getsentry/toolkit`), already in the lockfile, pulled in by `@sentry/bundler-plugins`.

Versions under the 14-day rule ([dependency policy](https://github.com/sirloinbh/project-standards/blob/main/docs/dependency-policy.md)), **accepted by the user on 2026-11-22 for the #993 `proxy-agent` security fix**:

| Package                            | Version | Published (UTC)  |
| ---------------------------------- | ------- | ---------------- |
| `ansi-regex`                       | 6.6.0   | 2026-11-08 11:31 |
| `@puppeteer/browsers`              | 3.2.7   | 2026-11-10 14:10 |
| `@lhci/cli`                        | 0.16.1  | 2026-11-11 23:40 |
| `@lhci/utils`                      | 0.16.1  | 2026-11-11 23:40 |
| `quickjs-wasi`                     | 3.7.0   | 2026-11-13 01:33 |
| `pac-proxy-agent`                  | 9.1.1   | 2026-11-16 18:35 |
| `proxy-agent`                      | 8.0.3   | 2026-11-16 18:35 |
| `pac-resolver`                     | 9.0.2   | 2026-11-16 18:35 |
| `degenerator`                      | 7.0.2   | 2026-11-16 18:36 |
| `get-uri`                          | 8.0.2   | 2026-11-16 18:36 |
| `sentry`                           | 0.50.0  | 2026-11-18 19:15 |
| `@sentry/conventions`              | 0.34.0  | 2026-11-19 09:52 |
| `tldts-core`                       | 7.5.5   | 2026-11-19 16:15 |
| `tldts-icann`                      | 7.5.5   | 2026-11-19 16:16 |
| `socks`                            | 2.8.11  | 2026-11-19 18:58 |
| `@sentry/node`                     | 11.16.0 | 2026-11-20 14:00 |
| `@sentry/server-runtime-injection` | 11.16.0 | 2026-11-20 14:00 |
| `@sentry/server-utils`             | 11.16.0 | 2026-11-20 14:01 |
| `@sentry/bundler-plugins`          | 11.16.0 | 2026-11-20 14:02 |
| `@sentry/core`                     | 11.16.0 | 2026-11-20 14:02 |
| `@sentry/opentelemetry`            | 11.16.0 | 2026-11-20 14:02 |
| `netmask`                          | 2.1.2   | 2026-11-20 20:14 |
| `robots-parser`                    | 3.1.1   | 2026-11-21 11:00 |

## Verification (2026-11-22)

- The installed `node_modules/@sirloinbh/design-tokens/fonts/` and `tokens.css` are byte-identical to the files merged in project-standards (`diff -r`).
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Frontend 790 tests passed, 3 skipped. Backend 158 passed, 0 failed, 137 skipped (no local test DB; CI runs them). Run twice: after the design-tokens lockfile change, and again after the `@lhci/cli` 0.16.1 lockfile change (same counts).
- Cold load of `/` (Vite dev server, fresh Chromium via Playwright, 390x844 and 1440x900):

| Measure                  | 1.0.0 (before)        | 1.1.0 (after)                | Change         |
| ------------------------ | --------------------- | ---------------------------- | -------------- |
| Font files on `/`        | 1                     | 2 (`subset.91`, `subset.86`) |                |
| Font bytes on `/`        | 2,057,988             | 64,312                       | -96.9%         |
| Build CSS `index-*.css`  | 55.63 kB / 10.31 gzip | 103.61 kB / 25.37 kB gzip    | +15.06 kB gzip |
| Font + CSS on a cold `/` | about 2,068 kB        | about 90 kB                  | -95.7%         |

- The production build emits the 92 chunks as separate assets (2,957,724 bytes in total); a page fetches only the chunks its text needs. A specimen with Latin, digits, Korean and symbols at weights 400-700 needed 11 chunks, 289,392 bytes (-85.9%), measured before the release with the same files.
- Look: screenshots at 390x844 and 1440x900 show the dashboard in Pretendard. The earlier pixel comparison with these exact files (project-standards #989) found every Latin and Hangul glyph and position identical; only `+ = @ ~ →` sit 1 px lower, because they come from a different chunk than the text around them.

## Notes

- Offline (service worker), only the chunks already cached render in Pretendard; other characters use the next font in the stack until they are fetched once.
- The other apps take 1.1.0 through their own sync PRs; they are not merged here.
