---
name: health-log-foundation
description: Establish or improve the repeatable development foundation of the health-log app, covering stack, structure, conventions, API contracts, design, tests, AI guidance, and deployment. Use for project foundation requests; apply only the requested scope through the health-log-implementation issue-to-PR workflow.
---

# Meal, sleep, and health log development foundation

This skill sets out how this app is developed, verified, and run so that it can be repeated. First read `AGENTS.md` in the project root and `skills/health-log-implementation/SKILL.md`, then work in this order: issue → branch named with the issue number → implementation and docs record → tests and PR → automated code review (at most 2 rounds) → the agent merges after CI passes. This skill does not let you skip the issue and PR steps or the CI pass condition, and it does not grant deployment permission.

## Baseline

- The baseline document is `docs/project-setup.md`. Check the current package.json, lock files, API and SQL, Compose, and CI, and tell what is actually implemented from what is only recommended (not adopted). Do not install the whole recommended list automatically.
- There is one user, and login is not a current requirement. Dates use Asia/Seoul.
- When you change or add a tool, first write down the real problem, the effect on data, and how you will verify it. Install packages only after the user reconfirms.

## Steps

1. Fix the current state and the issue's done criteria, and record the reason for the choice, the structure, and the contracts in the docs.
2. Keep tool settings, run commands, CI, and docs consistent in the same change. Do not create unused settings, scripts, or empty modules.
3. For API and DB changes, keep the meaning of existing data and of dates and units, and verify how the migration is applied and how a failure is recovered. Keep one source for DB migrations.
4. For screen changes, keep the design tokens (the CSS variables in `frontend/src/style.css`) and the existing components, and cover loading, empty results, errors, and keyboard access within the scope.
5. Apply `skills/health-log-testing/SKILL.md` together with this skill. Write the implementation and its tests together, add a regression test for every bug, and record the actual results in the docs and the PR.
6. Deploy only within the scope the user requested. Prepare the image version, the health check, secret management, backup and restore, and recovery to the previous version.
7. Include the docs record in every work commit and open a verified PR. After the PR, go through at most 2 automated code reviews and fix what they find (large changes go to a new issue). When every required CI check passes on the final head, merge as the merge steps of health-log-implementation say.

## Done criteria

A new environment can repeat the install, run, and verification as the docs say, and the chosen tools are reflected in the real code, commands, and CI. State tools that are not installed, checks that were skipped, and deployments that were not done as follow-up work.
