# #114 Tidy the next-steps document, analyze npm audit, check dark mode and 320px

- Issue: [#114](https://github.com/sirloinbh/health-log/issues/114)
- Branch: `docs/114-next-steps`

## Purpose

Update the next-steps document (`docs/next-steps/README.md`) to match the current state. Analyze `npm audit`, which was left under "Not yet sorted out". Check the screens added since #43 in dark mode and at a narrow width (320px).

## Change — 2026-11-08

`docs/next-steps/README.md`

- Reflected that #31 and #32 (food data) and #104 and #107 (goal follow-ups) are done.
- Added an "In progress" section.
  - agent2: research #34, then #35
  - agent3: #39, #40, then #48
  - agent1: this document (removed in the first-review changes, because #114 closes when it is merged)
- Replaced the `npm audit` item with the analysis result below and the follow-up issue #115.
- The last-updated date is today (2026-11-08), so it stays.

## npm audit analysis

`npm audit --json` and `npm audit --omit=dev` were run with the lock file of `main` (c40895c). No install, update, or `npm audit fix` was run.

- **Result:** 12 moderate, 0 low, high, or critical (out of 615 dependencies, 177 of them production).
- **One root cause:** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) "minimatch has potential denial of service via globparts amplification".
  - The vulnerable range is minimatch 7.0.0 or later and below 11.0.1, and the first fixed version is 11.0.1. This repository uses minimatch@10.2.6.
  - The other 11 are reported through this package. They are `@eslint/config-array`, `@eslint/js`, `@sirloinbh/eslint-config`, 5 `@typescript-eslint/*` packages, `eslint`, `eslint-plugin-jsx-a11y-x`, and `typescript-eslint`.
- **Paths:** checked with `npm ls minimatch --all`. `eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree` of `typescript-eslint`, and `eslint-plugin-jsx-a11y-x` all go to minimatch@10.2.6. All are development dependencies.
- **Production impact:** none.
  - `npm audit --omit=dev` shows 0.
  - An attack needs the attacker to choose the glob pattern. Here, only the patterns written in this repository's ESLint and TypeScript settings go in, on developer PCs and in CI.
- **Ways to fix it now:** none.
  - As of 2026-11-08, the latest versions of all parent packages require `minimatch ^10`.
    - eslint 10.14.0 `^10.2.6`
    - @eslint/config-array 0.23.5 `^10.2.4`
    - @typescript-eslint/typescript-estree 8.72.1 `^10.2.2`
    - eslint-plugin-jsx-a11y-x 0.2.0 `^10.2.5`
  - There is no fixed version in 10.x (the last is 10.2.6).
  - `npm audit fix --force` suggests downgrading eslint-plugin-jsx-a11y-x to 0.1.1. 0.1.1 uses minimatch `^3.1.2`, so this one path goes away. But the paths through eslint, @eslint/config-array, and typescript-eslint remain, so the warnings stay, and only the plugin rules may change.
  - Forcing minimatch 11 with `overrides` is a major change the parent packages have not verified, so it is not recommended.
- **Follow-up:** [#115](https://github.com/sirloinbh/health-log/issues/115) (P4, user) was linked under [#88](https://github.com/sirloinbh/health-log/issues/88). When the parent packages accept `minimatch >=11.0.1`, the user updates. The check command and an example update command are written in the issue.

## Dark mode and 320px screen check

No code was changed. No problems were found, so only the result is recorded.

- The real API (127.0.0.1:3971) and Vite (5271) were started on a temporary PostgreSQL 17 (5471, `health_test`, migrations up to 014).
- In headless Chrome (debugging 9671), `prefers-color-scheme: dark` was turned on with CDP `Emulation.setEmulatedMedia`. There is no saved theme choice, so it follows the system setting.
- For checking, one snack marked as junk food was put in on 11-06 through the API.

| Screen                                                                                                        | 320 dark | 390 dark | 1440 dark | 320 light |
| ------------------------------------------------------------------------------------------------------------- | -------- | -------- | --------- | --------- |
| Goal card in settings (#45, #107)                                                                             | passed   | passed   | passed    | passed    |
| Goal achievement card in the daily record (#45, #104) and the junk food count and mark on the meal card (#38) | passed   | passed   | passed    | passed    |
| Range notice for the out-of-range date `/daily/2100-01-01` (#50)                                              | passed   | passed   | passed    | —         |
| End-of-range date `/daily/2099-12-31` (#50)                                                                   | passed   | passed   | passed    | —         |

- **Horizontal overflow:** the document width equaled the screen width. No element went outside the right edge of the screen. This held in every column (1440 was 1425, without the scroll bar).
- **Text contrast:** the 6 badges on the daily record screen and the gray text of the judgment line were measured with actual computed values. All were at or above WCAG AA 4.5:1.
  - Dark: badges 8.71 to 17.18, gray judgment line 6.94
  - Light: the lowest is the "달성" (achieved) badge at 4.95, gray judgment line 4.74
- **#104 at 320 light:** 1,300 kcal was added with "바로 기록" (record directly) on the meal card. Without pressing a button, the calories on the goal card changed right away from 2,870 kcal to 4,170 kcal.
- The dark mode screens were also checked by eye (the 320 goal card, the junk food badge). Nowhere did text blend into the background or a border disappear.
- After checking, Chrome, Vite, the API, and the temporary DB were all shut down.

## Change — 2026-11-08 (first review applied)

The first review of PR #116 (a read-only review separate from the authoring context) re-checked `npm audit`, `npm ls`, `npm view`, issue states, sub-issue links, and links directly. There were no factual errors, and 4 low items came up. All were applied.

- Added the reason to the `npm audit fix --force` sentence. 0.1.1 is minimatch `^3.1.2`, so that one path goes away but the other paths remain. The body of #115 was fixed too.
- Wrote the version (0.23.5) for @eslint/config-array. Added `npm view @eslint/config-array dependencies.minimatch` to the check command in #115.
- Changed "#40 medication (in progress)" in the README to "(both in progress)". The in-progress mark read as if it applied only to #40.
- Removed the agent1 line under "In progress" in the README. When this PR is merged, #114 closes and the line would no longer be true. The link to the analysis record was moved to the `npm audit` item.

## Change — 2026-11-08 (second review applied)

The second review (the last) confirmed the 4 first-review changes are correct. It also re-checked with `npm view` that 0.1.1 has minimatch `^3.1.2` and that @eslint/config-array is 0.23.5. It found 2 low items, and both were applied.

- Added to the "agent1: this document" line of the first Change section that it was removed from the README in the first review.
- Wrote version 0.23.5 for @eslint/config-array in the body of #115 as well.

## Change — 2026-11-08 (main merged again just before merging)

After CI passed, #39 clinic visits (PR #113) was merged into main. `origin/main` was merged, with no conflicts. In the README, #39 was moved to done, and agent3's in-progress work was changed to #40, then #48.

## Verification

- `npm run format:check`: passed.
- Document links: checked that the newly written relative link `../changes/114-next-steps.md` points to an existing file.
- The issue states in the README were checked against `gh issue view`. #32 closed; #34, #35, #39, #40, and #48 open.
- App code was not changed, so no app tests were added.
