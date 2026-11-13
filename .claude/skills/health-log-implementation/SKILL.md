---
name: health-log-implementation
description: Follow the user's issue, numbered branch, implementation with docs, tests, and PR workflow for changes to the sirloinbh health-log project. Use for code, configuration, documentation, and skill edits; exclude read-only questions and recommendations. After opening the PR, run at most two automated code reviews (review, fix commit, second review, fix commit), split fixes too large for the PR into new issues, then merge the PR with a merge commit once all required CI checks pass on the final head.
---

# Meal, sleep, and health log implementation steps

This skill applies to changes in `sirloinbh/health-log`. Do not apply this account, repository, or policy to other projects. First read `AGENTS.md` in the project root and the related docs. Follow the order below, go through automated code review (at most 2 rounds), and deliver the result with the PR merged after the required CI passes.

## 1. Register the issue card

- Check the GitHub remote and `gh api user --jq .login`. The expected account is `sirloinbh`. If it is another account, make no remote changes until you fix the authentication.
- Reuse the issue the user named, or an issue already registered for the same request. Check the existing result before a retry so that you do not create a duplicate issue.
- In a new issue, write the problem and purpose, the requested scope, the done criteria, and how to verify. In this project an issue card means a GitHub Issue. Do not create or link a board unless a separate Projects board was specified.
- Write the body to a UTF-8 temporary file and register it with `gh issue create --repo sirloinbh/health-log --title ... --body-file ...`. Do not put tokens or secrets in the body.
- Keep the real issue number and URL that were issued. If registering the issue fails, do not invent a number or start the code change first.

## 2. Create the branch from the issue number

- Check the working tree and the current branch. If there are changes from other work, keep them and avoid mixing work.
- The default target branch is `main`. Do not start new work from an unrelated unmerged work branch. Fetch the remote main in a clean working tree and branch from it. If there are user changes, prepare a workspace that can keep them.
- Branch name: `<type>/<number>-<short-slug>`. For example `feat/12-first-feature`, `fix/13-goal-date`, `docs/14-project-skills`, `chore/15-ci`.
- If a branch for the same issue already exists, check its state and keep using it.
- Make changes and commits on this branch. Do not commit or push to `main` directly.

## 3. Implementation and a docs record for each commit

- When you implement or change something, read the project's `skills/health-log-testing/SKILL.md` and write or update the related tests together. For a bug fix, add a regression test. Put the implementation, the tests, and the docs in the same work commit, and run the related tests before you commit.
- Implement only the requested scope. For work on the development foundation, also read `health-log-foundation`.
- Create `docs/changes/<number>-<slug>.md` and record the issue link, the purpose, the changes, the verification, and the limits and follow-up work.
- **Record in the docs, in each work commit, the changes and the verification done in that commit.** You may accumulate entries in one issue document. A commit that changes only docs also updates the record of that work.
- In the record, write the reason for the change and the observed results. Do not write that a check or deployment that you did not run is done. You do not need to make the SHA of the commit itself in advance. Tell entries apart by the commit title or the unit of work.
- The commit title includes the type and the issue number, as in `feat: ... (#12)`, `fix: ... (#13)`, `docs: ... (#14)`.
- Before you stage, check the diff and whether it contains secrets, and stage only the related files, by name. Do not include another user's changes.

## 4. Create the PR after testing

- Before you create or update the PR, run the related tests and the required checks on the final change. Record in the docs and the PR the test code you added or changed, the behavior verified, and the actual commands run with pass/fail/skip. Follow the project `AGENTS.md` for the required commands and the conditions of the DB integration tests. Do not add app tests that a plain docs or skill change does not need.
- Fix failures, and separate in the docs and the PR the checks you could not run, the DB tests that were skipped, and the browser verification that is not finished. If a needed verification is blocked, make the PR a draft.
- Push only the work branch. The PR target is `main` of `sirloinbh/health-log`. The subtree sync script pushes main and the sub repositories, so do not use it in this step.
- If a PR for the same head branch exists, update it and do not create a duplicate.
- Pass the PR body as a UTF-8 file. Include the problem and the behavior after the change, the main changes, the real check commands and results, the evidence that is possible for a screen change, and `Closes #<number>`. If there are no images, write why, and the limits of the verification.
- Check the GitHub Actions results and fix the related failures. Say so for a check that is still running. If you changed code after creating the PR, run the affected checks again and update the results in the docs and the PR.

## 5. Automated code review after the PR (at most 2 rounds)

1. **First review**: After you open the PR, run a read-only review that is separate from the context that wrote it (a separate agent, a review tool, and so on). Look at correctness, regressions, security, missing tests, and the docs record, against the issue's done criteria and the whole PR diff.
2. **If there is nothing to fix**, end the review and move on to the CI check and the merge.
3. **If there is something to fix**, apply only the findings that are in the scope of this PR. Make an extra commit with the related tests and docs record, and push it.
4. **Second review**: Check that the first findings were applied, and the extra diff. Also look at the final whole PR diff. If there is nothing to fix, move on to CI.
5. **Second fixes**: Apply the second findings in an extra commit. The review is at most 2 rounds, so do not do a third review and move on to CI.
6. **Split large changes**: Do not fix findings of the following kinds in this PR. Make a new issue card (with the problem, scope, and done criteria) instead. Leave the issue link in a PR comment and in the docs record, and keep going with this PR.
   - A feature outside the requested scope
   - A change of design or data structure
   - A fix that spans several modules
   - Work that needs its own verification
7. **Hold the merge**: If the following defects remain, do not merge, and tell the user.
   - A defect that would break main if it were split off
   - A defect with a security or data corruption risk
8. **Record**: Write the result of each review round in a PR comment and in the docs work record. Write the findings, the commits that applied them, the issues split off, and whether there was nothing to fix.

## 6. Merge after CI passes

- Run the related tests again on the last commit. If a new commit appears during the review, do not merge on an earlier CI result.
- **When every required CI check on the final head passes, the agent (the main agent or a local worker) merges the PR without asking.** Check the head SHA of the PR and run `gh pr merge <url> --merge --match-head-commit <the head SHA you checked>` (a merge commit) with the wrapper.
- After the merge, check that the linked issue (`Closes #<number>`) is closed. If it is not closed, find out why and report it.
- Merge stacked PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR branch to resolve conflicts, run the related tests again, push normally, and merge after CI passes. Repeat to the end of the stack.
- **Forbidden:** merging while a check fails or is still running, bypassing branch protection with `--admin` or the like, approving your own PR instead of a review, pushing or committing to main directly, and force push.
- A `main` merge in this project does not run a deploy now (CI only verifies and builds Docker). If a deploy is connected to the merge, write it in this document and check the deploy result after the merge.
- Deliver the issue URL, the branch name, the PR URL, the verification and CI results, the merge SHA, and the remaining work. If you cannot get CI to pass, leave the PR open and tell why.

## Authentication and failure handling

Do not recheck the issue, push, and PR permissions that you were already given without need. Follow the execution permissions that the tools require and the GitHub authentication. On a failure, resume from the step you completed, and if the result of a remote creation is unclear, look it up before you retry. Do not work around an account or authentication problem by creating things with another account.
