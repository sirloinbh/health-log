# #305 Load only the Pretendard chunks a page uses (design-tokens 1.1.0)

- Issue: [#305](https://github.com/sirloinbh/health-log/issues/305) (parent [#303](https://github.com/sirloinbh/health-log/issues/303))
- Branch: `chore/standards-sync-864289c` (the sync PR #315)
- Central work: sirloinbh/project-standards#989 (PR #990) and #991 (PR #992)

## Problem

`@sirloinbh/design-tokens` 1.0.0 had one `@font-face` for the full `PretendardVariable.woff2` with no `unicode-range`. Every first visit downloaded the whole file: a cold load of `/` transferred 2,057,988 bytes of font, about 10 times the gzipped JS.

## Decision (2026-11-22)

The user chose option A on #305: fix it in the central package rather than in health-log alone, and release design-tokens 1.1.0 with the official Pretendard 1.3.9 dynamic subset (92 woff2 chunks, each with a `unicode-range`). The family name, the weights and the OFL license stay the same. The user approved this health-log bump 1.0.0 → 1.1.0 as a package change, with `--ignore-scripts` and the lockfile change. The user pushed the tag `design-tokens/v1.1.0` (publish run 45009652071 passed), and project-standards PR #992 raised it in `versions.json`, which opened this sync PR.

## Change

| File                       | Change                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `frontend/package.json`    | `@sirloinbh/design-tokens` 1.0.0 → 1.1.0 (sync commit)                             |
| `.standards/manifest.json` | Central SHA 864289c and the new managed version (sync commit)                      |
| `package-lock.json`        | Only the `@sirloinbh/design-tokens` entry: version, `resolved` URL and `integrity` |

The lockfile was rewritten by the user with `npm install --ignore-scripts --engine-strict=false --no-audit --no-fund` on this branch, because GitHub Packages needs the user's token (project-standards `docs/user-steps.md` section 12). No new external package comes in; 1.1.0 has 0 dependencies. No app code changes: `tokens.css` and the font stack are the same.

## Verification (2026-11-22)

- The installed `node_modules/@sirloinbh/design-tokens/fonts/` and `tokens.css` are byte-identical to the files merged in project-standards (`diff -r`).
- `npm run check` (with `TEST_DATABASE_URL` empty): passed. Frontend 790 tests passed, 3 skipped. Backend 158 passed, 0 failed, 137 skipped (no local test DB; CI runs them).
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
