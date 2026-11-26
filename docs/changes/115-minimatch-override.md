# #115 Minimatch override for the a11y ESLint plugin

- Issue: [#115](https://github.com/sirloinbh/health-log/issues/115)
- Branch: `chore/115-minimatch-override`
- Central issue: [sirloinbh/project-standards#985](https://github.com/sirloinbh/project-standards/issues/985)

## Purpose

`npm audit` flagged minimatch 10.2.6 (GHSA-g3hv-75wg-m249, a denial of service through globparts amplification, affected range 7.0.0 to 11.0.0). The central raise of ESLint (10.15.0) and typescript-eslint (8.73.0) reached health-log through the sync PR #345. One copy stayed behind: `eslint-plugin-jsx-a11y-x@0.2.0` asks for minimatch `^10.2.5`, which npm resolved to 10.2.6.

## Decisions

- The user approved the package change on 2026-11-26 (comment on #115), as the repository rule requires.
- As #985 planned, an npm `overrides` entry gives `eslint-plugin-jsx-a11y-x` minimatch `^11.0.5` instead of waiting for a new plugin release. `overrides` is not one of the centrally managed `package.json` fields.

## Change — 2026-11-26

- `package.json`: `overrides.eslint-plugin-jsx-a11y-x.minimatch = "^11.0.5"`.
- `package-lock.json` (from `npm install --ignore-scripts`): the hoisted minimatch moved from 10.2.6 to 11.0.9, and the nested 11.0.9 copies under eslint, @eslint/config-array, @typescript-eslint/typescript-estree and glob were deduplicated into it. No new package version was added; 11.0.9 was already in the tree.

## Verification — 2026-11-26

- `npm audit`: before, 2 moderate (GHSA-g3hv-75wg-m249 on minimatch 10.2.6); after, found 0 vulnerabilities.
- `npm ls minimatch`: `eslint-plugin-jsx-a11y-x@0.2.0` now uses minimatch@11.0.9. The minimatch@3.1.5 under `@lhci/cli > chrome-launcher > rimraf > glob@7` is still there, but it is outside the advisory's range and `npm audit` does not flag it, so it was left alone.
- `TEST_DATABASE_URL=<scratch PG 17> npm run check` passed, lint included: backend 357 pass, 0 skipped; frontend 874 pass, 3 skipped. `npm run knip` passed.
