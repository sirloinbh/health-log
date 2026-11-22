# #313 Say that a merge to main is deployed by the server timer

- Issue: [#313](https://github.com/sirloinbh/health-log/issues/313)
- Branch: `docs/313-main-deploys`

## Purpose

`AGENTS.project.md` and the `health-log-implementation` skill said "A `main` merge does not run a deploy now (CI only verifies and builds Docker)." That has been false since 2026-11-20: the shared server's `health-autodeploy.timer` deploys `main`. The old sentence told agents that a merge is harmless.

## Changes

- `AGENTS.project.md`, work steps: a merge to `main` is deployed. The timer checks `main` every 2 minutes and deploys a commit once all its CI runs have passed, migrations included, so merge only a head whose CI is green.
- `AGENTS.project.md`, merge guards: "Merging is not applying" now says a merge deploys the app but applies nothing else. AWS or server changes (`terraform apply`, a firewall change, a manual deploy action) still need the user's OK.
- `skills/health-log-implementation/SKILL.md`: the same behavior, plus what happens when the health check fails (the previous version starts again, but a migration that already ran stays; the deploy backs up the database first), "treat a migration merge as a change to the real data", and how to check after the merge (`https://health-log.daysofme.com/api/health` answers 200 from an allowed IP; the server keeps the deployed commit in `.deployed`). `.claude/skills/` updated with `npm run skills:sync`.
- The behavior comes from `deploy/autodeploy.sh`, `deploy/autodeploy.timer` (`OnUnitActiveSec=2min`) and `deploy/remote-deploy.sh` (health check and rollback). Those are managed files and were not edited. No server address is written.
- Searched the other docs for the same claim: `docs/`, `database/README.md` and the other skills do not repeat it. `docs/next-steps/README.md` already says `main` deploys itself (#293).

## Verification

- `prettier --check` on the changed files: passed. `skills/` and `.claude/skills/` match after the sync.
- skill-creator `quick_validate.py` could not run: this PC's Python has no PyYAML, and installing packages needs the user's OK. Only the skill body changed; the frontmatter is unchanged.
- `npm run check` (with `TEST_DATABASE_URL` empty): passed (backend 158 passed / 137 skipped, the DB tests that need `health_test` and run in CI; frontend 790 passed / 3 skipped in 76 files; skills tests 4 passed).

## Review round 1

- The skill said a failed health check "rolls back to the previous one", which could make a migration merge look reversible. `deploy/remote-deploy.sh` restarts the previous version but does not undo a migration that already ran, and it backs up the database first. The skill now says so.
- After the fix: `prettier --check` passed, and `skills/` and `.claude/skills/` match after `npm run skills:sync`. Docs-only follow-up, so `npm run check` was not run again; CI runs it on the new head.
