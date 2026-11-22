# #293 Record the 2026-11-22 run in the daily log and next steps

- Issue: [#293](https://github.com/sirloinbh/health-log/issues/293)
- Branch: `docs/293-run-notes`

## Purpose

`docs/next-steps/README.md` was last updated on 2026-11-08. The 2026-11-22 Orca lane run merged about 50 PRs and closed five epics, so a new session could not continue from the files alone (std-session-notes).

## Changes

- New [daily log for 2026-11-22](../daily/2026-11-22.md): what was merged (issue → PR), the epics closed, decisions, lessons (the shared check lock, the Orca terminal limit) and the files to read first. Listed in `docs/daily/README.md`.
- Rewrote [Next steps](../next-steps/README.md) (Last updated 2026-11-22): in progress (no lanes assigned), user actions in order, choices to confirm (#204, #206, #207), central follow-ups (project-standards#978, #979, #980), issues that need the user, and the four open epics (#221, #88, #83, #82).
- Dropped from Next steps: the old local branches `chore/3-agent-auto-merge` and `fix/1-vite-port` (no longer in `git branch --list`), and the 2026-11-08 to-do table, whose items are done or now listed under user actions.

## Verification

- Every issue, PR and epic state in both files was checked with `scripts/gh-project.ps1` before writing: all listed health-log issues and PRs are closed or merged, no health-log PR is open, the open issues are #221, #167, #118, #115, #88, #83, #82, #74, #47, #41 and #28, project-standards#978, #979 and #980 are open, and workout-memo PR #466 is open.
- `prettier --check` on the changed files: passed.
- Relative link and anchor check (a small Node script over the changed files): no broken links.
- Docs only, so no app tests were added or run (docs-and-skills rule).
