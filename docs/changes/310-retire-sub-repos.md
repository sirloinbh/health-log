# #310 Retire the split sub-repos from the project docs

- Issue: [#310](https://github.com/sirloinbh/health-log/issues/310)
- Branch: `docs/310-retire-sub-repos`
- Parent: #88 Make deployment and operations safe
- User decision (2026-11-22): retire the split sub-repos (architecture review H11, 2026-11-18)

## Purpose

The server deploys from the umbrella repo (`/opt/health-log`), and project-standards ADR-0022 dropped the `git subtree split` sub-repos for every app. Project-owned docs still described `health-log-frontend`, `health-log-backend` and `health-log-db` as live deploy repositories with a sync script.

## What was already done centrally

No central change was needed, so no project-standards issue or PR and no sync PR came out of this:

- project-standards#728 removed `push-repositories.ps1` and the lockfile reconciler from the templates.
- project-standards#729 deleted `backend/.github/workflows/ci.yml`, `frontend/.github/workflows/ci.yml` and the sub-lockfiles in this repo (commit 6853269). There is no `database/` equivalent: `database/` never had its own CI.
- The managed `AGENTS.md` already says this repository is the only source and deploy repository (ADR-0022). A fresh clone of project-standards (main at a81b0ba) has no template that mentions subtrees, `push-repositories` or `create-repositories`.
- The three GitHub sub-repos are already archived (`archived: true`, checked through the GitHub API on 2026-11-22).

## Changes

- `README.md` "Repository layout": the umbrella repo is the only deploy repository; the three split repos are retired and archived.
- `backend/README.md`, `frontend/README.md`: no longer "a deploy repository synced as a subtree".
- `docs/next-steps/README.md` "Run boundaries": no sub-repo sync.
- `docs/project-setup.md`: section 4.1 now describes one umbrella repository; the sub-repo lock file note, the per-area CI list, the AGENTS template line, bootstrap step 11 and the reference file list drop the sub-repos and their scripts.
- `skills/health-log-implementation/SKILL.md` and its copy `.claude/skills/health-log-implementation/SKILL.md` (`npm run skills:sync`): the PR step no longer mentions the subtree sync script.

## Verification

- `git grep -n -i "push-repositories\|create-repositories\|subtree\|sub repositor\|sub-repo"` outside `docs/changes/`, `docs/daily/` and `docs/reviews/`: only lines saying the sub-repos are retired remain, plus `std-git-writing`, where "sub-repo" means an app repo synced from the central repo.
- `npm run check` with `TEST_DATABASE_URL` empty: passed (format, lint, contract, typecheck, build; scripts 3 passed; backend 156 passed, 137 skipped DB integration tests without `health_test`, which CI runs; frontend 791 passed, 3 skipped; skills 4 passed, which covers the skill copy matching its source).
- skill-creator `quick_validate.py` was not run: Python is not installed on this machine. Only one sentence of the skill body changed; its front matter is untouched.
- Docs only, so no app tests were added.

## Limits

- Deleting the archived GitHub sub-repos is optional and left to the user.
- `docs/project-setup.md` chapter 12 still describes an in-repo `infrastructure/` folder from the workout-memo days; that is about the shared infrastructure repo, not the sub-repos, and is out of scope here.

## Review round 1

- `nitpick (blocking)`: two more stale lines in `docs/project-setup.md`: the `scripts/` comment in the directory layout said "Scripts for creating and syncing repositories", and bootstrap step 5 expected "the lock file of each workspace". Fixed in "docs: drop the last sub-repo traces from project-setup (#310)".
- Checked with no finding: the README, the area READMEs, next steps and the skill sentence read correctly, and the skill copy matches its source.
- After the fix: `prettier --check` on the changed files passed, and the `git grep` above still finds only "retired" statements. Docs only, so `npm run check` was not repeated; CI runs it.

## Review round 2

- Approve, no blocking comments. The round 1 fix is in place and the whole diff was re-read. Chapter 12 of `docs/project-setup.md` stays as noted under Limits.
