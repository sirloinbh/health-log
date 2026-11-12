# #3 Change the policy so the agent merges PRs that pass CI

- Issue: https://github.com/sirloinbh/health-log/issues/3
- Branch: `chore/3-agent-auto-merge`

## Purpose

On 2026-10-21 the repository owner explicitly told us to change the PR merge policy. Because of the rule "only the user merges PRs", each project had to ask for merges again and again.

## Changes

- New policy: when every required CI check passes, the agent (the main agent or a local worker) runs `pr merge <url> --merge --match-head-commit <the head SHA you checked>` (a merge commit) with the project wrapper without asking, and checks that the linked issue is closed.
- Stacked PRs are merged in order. After the earlier PR is merged, merge `origin/main` into the next branch to resolve conflicts, run the related tests again, push normally, and merge after CI passes.
- Still forbidden: merging while a check fails or is running, bypassing branch protection with `--admin` or the like, approving your own PR instead of a review, pushing or committing to `main` directly, and force push.
- Stated that a `main` merge does not run a deploy now (only the CI `verify` and `docker-build` run).
- Files changed: `AGENTS.md`, `README.md`, `docs/project-setup.md` (absolute rules, Git strategy, the file role table, the AGENTS template), `skills/health-log-{implementation,foundation,testing}/SKILL.md` (including the implementation frontmatter description), and the `.claude/skills/` copies refreshed with `npm run skills:sync`.
- The past record (`docs/changes/bootstrap.md`) was not changed. There is no test or worker code in the repository that checks the policy sentences.

## Verification

There is no app behavior change, so no app test was added. `node_modules` was missing, so we installed with `npm ci --ignore-scripts` exactly as the lock file says (0 vulnerabilities).

| Command                                                                    | Result                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run skills:sync` → `npm run skills:check`                             | pass (`.claude/skills matches skills/.`)                                         |
| `npm run test:skills`                                                      | pass 4/4                                                                         |
| `PYTHONUTF8=1 py -3 quick_validate.py skills/<each skill>` (skill-creator) | pass 3/3 (`Skill is valid!`)                                                     |
| `npm run check` (format → lint → types → tests → skills → build)           | pass. Backend tests 7 pass, 1 skip (DB integration, `TEST_DATABASE_URL` not set) |

The DB integration tests were skipped locally, so we do not count the DB verification as done. CI runs them against a test DB.

## Limits and follow-up

- As this work was instructed, this PR is left open for the user to merge, and the agent does not merge it. The new policy applies from the next PR.

## 2026-10-21: Automated review after the PR (at most 2 rounds)

### Changes

- Added a step before the merge in which the PR goes through automated code review at most 2 times after it is opened. The order is review → fix commit → second review → fix commit, and after the second fix commit there are no more reviews. If there is nothing to fix, go straight to the CI check and the merge.
- A change that is too large to fix in this PR (a feature outside the scope, a design or data structure change, a change across several modules, or work that needs separate verification) is split into a new issue card. A defect that would break main if split off, or one that leaves a security or data corruption risk, holds the merge and is reported to the user.
- The result of each review round (the findings, the commits that applied them, the split issues, and whether there was nothing to fix) is recorded in the PR comment and the docs work record. If a new commit appears during the review, do not merge on the earlier CI result; merge after the required CI passes on the final head.
- `skills/health-log-implementation/SKILL.md`: added a new "5. Automated code review after the PR (at most 2 rounds)" step and renamed the merge step "6. Merge after CI passes". The frontmatter description was also updated.
- Short summaries applied to: the `AGENTS.md` steps (5 review, 6 merge), `README.md`, `docs/project-setup.md` (absolute rules, Git strategy, the file role table, the AGENTS template), and `skills/health-log-{foundation,testing}/SKILL.md`. `.claude/skills/` was refreshed with `npm run skills:sync`.
- The existing prohibitions (merging while a check fails or is running, `--admin`, approving your own PR, pushing to `main` directly, force push) and the handling of stacked PRs are kept.

### Reason

The user asked to limit the automated review after a PR to at most 2 rounds, to split large changes into new issues, and to merge after CI passes.

### Verification

| Command                                                                    | Result                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run skills:sync` → `npm run skills:check`                             | pass (`.claude/skills matches skills/.`)                                         |
| `PYTHONUTF8=1 py -3 quick_validate.py skills/<each skill>` (skill-creator) | pass 3/3 (`Skill is valid!`)                                                     |
| `npm run check` (format → lint → types → tests → skills → build)           | pass. Backend tests 7 pass, 1 skip (DB integration, `TEST_DATABASE_URL` not set) |
| `npm run test:skills` (included in `npm run check`)                        | pass 4/4                                                                         |

There is no app behavior change, so no app test was added. The DB integration tests were skipped locally, so we do not count the DB verification as done.
