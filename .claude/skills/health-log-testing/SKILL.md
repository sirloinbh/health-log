---
name: health-log-testing
description: Write or update behavior-focused tests with health-log implementations and fixes, run them before commits and PR creation or updates, and record actual results. Use with health-log-implementation; for documentation-only changes validate the changed artifacts instead of adding unrelated app tests.
---

# Meal, sleep, and health log: writing and running tests

Follow the project's AGENTS.md and the health-log-implementation steps together with this skill. This skill sets the standard for writing and running tests. It keeps the issue, branch, docs, and PR steps, and the policy of at most 2 automated code reviews after the PR and the agent merging after CI passes.

## Write tests with the implementation or fix

- When you implement a feature or change behavior, add or update test code that verifies that requirement, and put the implementation and the tests in the same work commit. Running the existing tests does not stand in for verifying a new feature.
- For a bug fix, add a regression test that catches the bug if it comes back. Where you can, confirm that it fails before the fix and passes after it, and if you cannot reproduce the bug, record that limit.
- For a refactor, verify that the existing behavior is kept. If the related tests are enough, keep them as they are, and add the scenarios that are missing.
- Test what the user can see and the domain rules, not a copy of the internal implementation. Choose the normal path and the input errors, boundaries, and failure paths that matter for the change.
- Use unit tests for business logic, integration tests for the API, DB writes, and transactions, and component or browser tests for screen input and save flows. Do not add every kind of test to every change.
- Check the test tools and commands that are installed now. Do not report that you used Vitest, Playwright, or any tool not adopted yet as if it were installed.
- Keep test data apart from production and user data. Write checks that depend on time, dates, or random values so that they verify the same meaning when the run environment changes.

## Before a commit

- Check the changes and tests in the final commit and actually run the related tests. Put the implementation, the tests, and the docs record in the same commit.
- Record in the docs/changes file of the issue the path of the test code, the behavior verified, and the commands run with their results.
- Do not make a failing test pass by skipping it, deleting it, or weakening its assertions. Fix the failure, then commit.
- If you cannot prepare the environment that a test needs, record that you did not run it. Do not report unverified work as done, and hand over a PR with remaining verification as a draft.

## Before creating or updating a PR

- Run the related tests and the project's required checks on the final diff and confirm that they pass. If nothing changed after the commit and the result for the same target is still valid, you do not need to repeat the same check.
- Record in the PR the tests you added or changed, the commands, pass/fail/skip, and the reason for anything not run. An integration test skipped because the DB environment variable is not set does not count as a pass.
- If you fix code or tests after the PR, run the affected checks again and update the results in the docs and the PR. Fix CI failures too.
- When only docs, skills, or formatting change and app behavior does not, verify with the validator, format, and link checks for those files, and write why you did not add app tests. A change in the behavior of executable code or a check script includes the related tests or a run-time verification.
- Follow-up commits from the automated code review also carry the related tests, which you run again and record. Merge the PR as the health-log-implementation steps say, and only after every required CI check on the final head has passed. If a check fails or is still running, do not merge.
