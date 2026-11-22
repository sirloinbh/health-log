# Next steps

Last updated: **2026-11-22 (Asia/Seoul)**.

Requirements are registered as GitHub issues. Choose later work with the selection rules of std-backlog. What happened on 2026-11-22 is in the [daily log](../daily/2026-11-22.md).

## In progress

- **Lanes:** none assigned now. No health-log PR is open.
- **Recently finished (2026-11-22 run):** about 50 PRs from five Orca lanes, listed issue by issue in the [daily log](../daily/2026-11-22.md#what-was-done). Epics #188, #189, #190, #191 and #216 are closed.

## User actions

| Order | Action                                                                                                                                                                                    | Issue                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1     | Before the next deploy, run the two queries in [the #197 change record](../changes/197-sleep-body-db-checks.md) on real data. A row that breaks a rule stops migration 019 and the deploy | #197                            |
| 2     | First deploy and the checks after it ([checks](../access-protection.md#checks-after-a-deploy)). The web stays on `127.0.0.1:8103` behind the shared proxy                                 | #41, #74                        |
| 3     | After the deploy, check the shared sign-in on the server                                                                                                                                  | #167                            |
| 4     | Get the central change done that marks health-log as using the shared contract (`features.contract=true`)                                                                                 | sirloinbh/project-standards#978 |
| 5     | Merge the workout-memo sync PR that the sirloinbh/project-standards#982 sync opened (or let that repo's session do it)                                                                    | sirloinbh/workout-memo#466      |
| 6     | Garmin key, photo recognition, ESLint dependencies after the upstream fix, MFDS auth key                                                                                                  | #28, #47, #115, #118            |

Notes for the deploy:

- The next deploy applies migrations 019 (#197 sleep and body checks), 020 (#199, 13 seeded food rows) and 021 (#196 meal request keys).
- A future backup restore (the old `chore/42` steps) must empty `meal_request_keys` in the same transaction.

## Choices to confirm

These were decided without asking. If you want them different, open a follow-up issue.

- **#206 (PR #270):** a junk-food partial total drops "or more", to match the combo wording.
- **#207 (PR #275):** a past reminder date reads "N days ago".
- **#204 (PR #254):** the add-medication button waits for the server date. If the server date cannot be read, it falls back to today's date on the device in Asia/Seoul and shows a note.
- The older rules decided without confirmation in #27, #30, #44 and #45 are in the comment of each issue.

## Central follow-ups

Open in the central repo:

- **sirloinbh/project-standards#978:** set `features.contract=true` for health-log (user action 4).
- **sirloinbh/project-standards#979:** `useApiMutation` cannot pass request headers. Until it can, meals use `useMutation` directly to send the `Idempotency-Key`.
- **sirloinbh/project-standards#980:** the managed `lib/query.test.tsx` sends `GET /api/tags` after it ends. Until it is fixed, health-log's test setup ignores that request by name.

## Issues that need the user

| Issue | What is needed                                                             |
| ----- | -------------------------------------------------------------------------- |
| #41   | Access protection: the first deploy and the checks after it                |
| #74   | Allowed IPs on the shared server: the first deploy and the checks after it |
| #167  | Shared sign-in: a server check after the deploy                            |
| #28   | Garmin sleep import: a key from Garmin Connect and agreeing to the terms   |
| #47   | Food drafts from label photos                                              |
| #115  | ESLint dependencies: update once the minimatch warning is fixed upstream   |
| #118  | MFDS processed-food values: an auth key                                    |

## Open epics

| Epic                                    | Open sub-issues | Waiting for                       |
| --------------------------------------- | --------------- | --------------------------------- |
| #221 Shared platform adoption           | #167            | the server check after the deploy |
| #88 Make deployment and operations safe | #41, #74, #115  | the deploy and the upstream fix   |
| #83 Build food nutrition data           | #47, #118       | the user                          |
| #82 Record sleep                        | #28             | the Garmin key                    |

## User decisions

- **Recorded on 2026-11-22:** #220 (install React Query, option A path), #215 (opt back in to `shared/contract.ts`), #199 (keep the source units; the Bibigo row stays, with a note), #268 (the worker merges the central fix).
- **Garmin (#26):** use the official Personal API. The data to store is the recommendation in the #26 comment, and the sleep date takes the day you woke up as its start. The field names in the real response, the usage limit, and whether a Korean account can use it are not confirmed yet.
- **Foods (#33):** 95 popular foods from the MFDS food nutrition DB. The limits are in the [change record](../changes/33-popular-foods.md), and how to look it up is in the [data rules](../food-data.md).
- **Request rate limit:** do not dismiss the CodeQL alert; handle it with `express-rate-limit`. Keep the nginx limit too. Apply it to a new router in the same way.

## Known gaps

- The combo picker's one-off read and the dialog saves have no stale-answer guard. This was left on purpose in the 2026-11-22 run.
- **Local DB tests:** every DB integration test is limited to `health_test` (#52). This PC does not have this DB, so verify in CI, or start a temporary cluster with `initdb` in `C:\Program Files\PostgreSQL\17\bin`. `TEST_DATABASE_URL` points to `study_test` of another project, so do not use it.
- **`npm audit`:** in the 2026-11-08 analysis, the moderate findings left came from minimatch in a dev tool (ESLint); `npm audit --omit=dev` showed 0. The user updates when upstream allows it (#115). The analysis is in the [#114 change record](../changes/114-next-steps.md).

## Working with lanes

- Run `npm run check` in one worktree at a time. Take the shared lock first: create `D:/orca/workspaces/health-log/.check-lock` with `mkdir` (it fails if the folder exists), run the check in the foreground, and remove the folder when it ends, pass or fail. A lock older than 40 minutes is stale.
- Orca holds about 12 terminals, and setup terminals run `npm install` once per worktree.

## Run boundaries

Deploys, syncing sub repositories, and creating AWS resources are done only on a separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deploy.
