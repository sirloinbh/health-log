# #293 Record the 2026-11-22 run in the daily log and next steps

- Issue: [#293](https://github.com/sirloinbh/health-log/issues/293)
- Branch: `docs/293-run-notes`

## Purpose

`docs/next-steps/README.md` was last updated on 2026-11-08. The 2026-11-22 Orca lane run merged about 50 PRs and closed five epics, so a new session could not continue from the files alone (std-session-notes).

## Changes

- New [daily log for 2026-11-22](../daily/2026-11-22.md): what was merged (issue → PR), the epics closed, decisions, lessons (the shared check lock, the Orca terminal limit) and the files to read first. Listed in `docs/daily/README.md`.
- Rewrote [Next steps](../next-steps/README.md) (Last updated 2026-11-22): in progress (no lanes assigned), user actions in order, choices to confirm (#204, #206, #207), central follow-ups (sirloinbh/project-standards#978, sirloinbh/project-standards#979 and sirloinbh/project-standards#980), issues that need the user, and the four open epics (#221, #88, #83, #82).
- Next steps, deploy notes: a backup restored by hand must empty `meal_request_keys` in the same transaction, because a stale key could replay an old meal POST answer (#196). No health-log doc tells a person how to restore by hand (`docs/project-setup.md` is the generic setup handover, and `deploy/backup.sh verify` only restores into a throwaway container), so the note sits under the backup item, as the coordinator asked. `deploy/backup.sh` is a managed file and was not edited.
- After-deploy check (coordinator, 2026-11-22): added to the [#74 change record](74-proxy-access.md#after-deploy-check-2026-11-22), with a pointer in the #41 record, as the done-when of #74 and #41 asks. This PR closes #74 and #41. #167 stays open for the signed-in check, which is a user action.
- Next steps corrected: health-log has been deployed since 2026-11-20 and deploys itself from `main`, and migrations 019 to 021 already ran, so the before-deploy data check and the first-deploy items are gone. The central follow-ups closed during the day (#296 → PR #298, #299 → PR #300, sirloinbh/project-standards#978), and sirloinbh/workout-memo#466 merged, so those items are gone too. The daily log adds this later work.
- Dropped from Next steps: the old local branches `chore/3-agent-auto-merge` and `fix/1-vite-port` (no longer in `git branch --list`), and the 2026-11-08 to-do table, whose items are done or now listed under user actions.

## Verification

- Every issue, PR and epic state in both files was checked with `scripts/gh-project.ps1` before writing: all listed health-log issues and PRs are closed or merged, no health-log PR is open, the open issues are #221, #167, #118, #115, #88, #83, #82, #74, #47, #41 and #28, sirloinbh/project-standards#978, sirloinbh/project-standards#979 and sirloinbh/project-standards#980 are open, and sirloinbh/workout-memo#466 is open.
- Rechecked after merging `origin/main` (PRs #295 to #300): sirloinbh/project-standards#978, sirloinbh/project-standards#979 and sirloinbh/project-standards#980 are closed, and sirloinbh/workout-memo#466 is merged.
- `prettier --check` on the changed files: passed.
- Relative link and anchor check (a small Node script over the changed files): no broken links.
- Docs only, so no app tests were added or run (docs-and-skills rule).
