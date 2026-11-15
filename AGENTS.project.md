# Meal, sleep, and health log project instructions

This file holds the rules that apply only to health-log. The shared instructions are in [AGENTS.md](AGENTS.md), which becomes a centrally managed file after the sync from the central standards (`sirloinbh/project-standards`). If the two files differ, this file wins.

## Work steps (in addition to the shared steps)

- **After you open a PR, review it yourself 1 or 2 times (more only while blocking findings remain, per std-code-review section 8).** Fix findings on the same branch in additional commits between rounds, and post each round as a PR comment. If there are no findings, go straight to the next step. File a new issue card for a big problem outside this PR's scope instead of growing the PR. Follow the health-log-implementation skill for the detailed steps.
- **After that, when every required CI check on the final head passes, the agent (the main agent or a local worker) merges the PR without asking.** Run `pr merge <url> --merge --match-head-commit <the head SHA you checked>` (a merge commit) with the wrapper, and check that the linked issue (`Closes #N`) is closed. Merge stacked PRs in order: after the earlier PR is merged, merge `origin/main` into the next branch to resolve conflicts, run the related tests again, push normally, and merge after CI passes. It is forbidden to merge while a check fails or is running, to bypass branch protection with `--admin` or the like, to approve your own PR instead of a review, to push or commit to `main` directly, and to force push. A `main` merge does not run a deploy now (CI only verifies and builds Docker).
- **Merge guards (project-standards ADR-0016):** if the PR's "Check before merging" lists an item that needs the user's own decision, ask the user and do not merge. Merging is not applying: real production or AWS changes (for example `terraform apply` or a manual deploy action) still need the user's OK.

## Project skills

- [health-log-implementation](skills/health-log-implementation/SKILL.md), [health-log-testing](skills/health-log-testing/SKILL.md), [health-log-foundation](skills/health-log-foundation/SKILL.md): they hold the review and merge steps of this project, so they are kept after the shared skills (std-*) arrive.

## Service rules

- **External access:** allow access only from the IPs we name (office, home). The real boundary is `allowed_cidrs` in the firewall of the shared server. Do not expose the DB and API ports outside the server. When you open a port in the firewall, use only `allowed_cidrs`, and do not allow everyone or a wide range. Do not write the real IPs in this repository. The details are in [Protecting external access](docs/access-protection.md).
