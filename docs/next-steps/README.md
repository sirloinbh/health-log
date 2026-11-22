# Next steps

Last updated: **2026-11-22 (Asia/Seoul)**.

Requirements are registered as GitHub issues. Choose later work with the selection rules of std-backlog. What happened on 2026-11-22 is in the [daily log](../daily/2026-11-22.md).

## In progress

- **Lanes:** none assigned now.
- **Deploy:** health-log has run on the shared server since 2026-11-20 and deploys itself from `main` (`health-autodeploy.timer`), so a merge to `main` reaches the server. Migrations 019, 020 and 021 already ran on the real data. The after-deploy check of 2026-11-22 is in the [#74 change record](../changes/74-proxy-access.md#after-deploy-check-2026-11-22).
- **Recently finished (2026-11-22 run):** about 50 PRs from five Orca lanes, listed issue by issue in the [daily log](../daily/2026-11-22.md#what-was-done). Epics #188, #189, #190, #191 and #216 are closed.

## User actions

| Order | Action                                                                                                                        | Issue                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1     | Sign in at `https://health-log.daysofme.com` and check that `/api/me` returns your user. The signed-out checks already passed | #167                 |
| 2     | Garmin key, photo recognition, ESLint dependencies after the upstream fix, MFDS auth key                                      | #28, #47, #115, #118 |

Backups:

- **Restoring a backup by hand:** after you restore the meals, empty `meal_request_keys` in the same transaction (`DELETE FROM meal_request_keys;` before `COMMIT`). A key left from before the restore could replay an old meal POST answer for a meal that is no longer there (#196). health-log has no manual restore guide yet, and the restore tooling (`deploy/backup.sh`, `restore-check`) is a managed file, so do not edit it; raise a change to it in `sirloinbh/project-standards`.

## Choices to confirm

These were decided without asking. If you want them different, open a follow-up issue.

- **#206 (PR #270):** a junk-food partial total drops "or more", to match the combo wording.
- **#207 (PR #275):** a past reminder date reads "N days ago".
- **#204 (PR #254):** the add-medication button waits for the server date. If the server date cannot be read, it falls back to today's date on the device in Asia/Seoul and shows a note.
- The older rules decided without confirmation in #27, #30, #44 and #45 are in the comment of each issue.

## Central follow-ups

None open. The three filed during the run are closed:

- **sirloinbh/project-standards#978 (closed as completed):** health-log is marked as using the shared contract (`features.contract`).
- **sirloinbh/project-standards#979:** `useApiMutation` can pass request headers; meals now save through it with the `Idempotency-Key` (#299, PR #300).
- **sirloinbh/project-standards#980:** the managed query test no longer sends `GET /api/tags` after it ends; health-log's test setup stopped ignoring it (#296, PR #298).

## Issues that need the user

| Issue | What is needed                                                           |
| ----- | ------------------------------------------------------------------------ |
| #167  | Shared sign-in: the signed-in check on the server (user action 1)        |
| #28   | Garmin sleep import: a key from Garmin Connect and agreeing to the terms |
| #47   | Food drafts from label photos                                            |
| #115  | ESLint dependencies: update once the minimatch warning is fixed upstream |
| #118  | MFDS processed-food values: an auth key                                  |

## Open epics

| Epic                                    | Open sub-issues | Waiting for         |
| --------------------------------------- | --------------- | ------------------- |
| #221 Shared platform adoption           | #167            | the signed-in check |
| #88 Make deployment and operations safe | #115            | the upstream fix    |
| #83 Build food nutrition data           | #47, #118       | the user            |
| #82 Record sleep                        | #28             | the Garmin key      |

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

`main` deploys itself, so merge only what is ready to run on the server. Manual deploy actions, syncing sub repositories, and creating or changing AWS resources are done only on a separate request.
