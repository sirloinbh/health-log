# Next steps

Last updated: **2026-11-27 (Asia/Seoul)**.

Requirements are registered as GitHub issues. Choose later work with the selection rules of std-backlog. What happened on 2026-11-27 is in the [daily log](../daily/2026-11-27.md), and on 2026-11-22 in [that day's log](../daily/2026-11-22.md).

## In progress

- **Lanes:** none assigned now. Nothing is in progress: every issue is closed except #28, #47 and #118.
- **Deploy:** health-log deploys itself from `main` (`health-autodeploy.timer`), so a merge to `main` reaches the server. Migrations up to 027 are in `main`. The after-deploy check of 2026-11-22 is in the [#74 change record](../changes/74-proxy-access.md#after-deploy-check-2026-11-22).
- **Recently finished (2026-11-23 to 2026-11-27):** about 30 PRs from two Orca lanes, listed issue by issue in the [daily log](../daily/2026-11-27.md#what-was-done). Epics #320, #321, #322, #88, #349 and #303 are closed. The two area reviews of 2026-11-27 (daily log and report, platform) found nothing to file.

## User actions

| Order | Action                                                                                                              | Issue          |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1     | Optional: delete the split GitHub sub-repos. They are already archived, and the project docs no longer mention them | #310           |
| 2     | Keys for Garmin, photo recognition and the MFDS database: on hold by the user                                       | #28, #47, #118 |

Backups:

- **Restoring a backup by hand:** after you restore the meals, empty `meal_request_keys` in the same transaction (`DELETE FROM meal_request_keys;` before `COMMIT`). A key left from before the restore could replay an old meal POST answer for a meal that is no longer there (#196). health-log has no manual restore guide yet, and the restore tooling (`deploy/backup.sh`, `restore-check`) is a managed file, so do not edit it; raise a change to it in `sirloinbh/project-standards`.

## Choices to confirm

None waiting. The user reviewed the three choices made without asking and chose differently; #306 (PR #309) applied them:

- **#206:** a junk-food partial total says "or more" again, because it leaves out records with unknown calories.
- **#207:** a past reminder date reads "Overdue by N days".
- **#204:** "Add medication" opens the dialog at once on today in Asia/Seoul by the device clock, with no wait and no note. The date stays editable.

The older rules decided without confirmation in #27, #30, #44 and #45 are in the comment of each issue.

## Central follow-ups

Open: none.

Closed:

- **sirloinbh/project-standards#985:** ESLint 10.15.0 and typescript-eslint 8.73.0 reached health-log through sync PR #345; #115 (PR #353) added the minimatch override.
- **`@sirloinbh/design-tokens` 1.1.0:** reached health-log with #305 (PR #315): the dynamic-subset font cut the first-load font and CSS from about 2,068 kB to about 90 kB.
- **sirloinbh/project-standards#978 (closed as completed):** health-log is marked as using the shared contract (`features.contract`).
- **sirloinbh/project-standards#979:** `useApiMutation` can pass request headers; meals now save through it with the `Idempotency-Key` (#299, PR #300).
- **sirloinbh/project-standards#980:** the managed query test no longer sends `GET /api/tags` after it ends; health-log's test setup stopped ignoring it (#296, PR #298).

## Issues that need the user

| Issue | What is needed                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------- |
| #28   | Garmin sleep import: a key from Garmin Connect and agreeing to the terms (on hold by the user) |
| #47   | Food drafts from label photos (on hold by the user)                                            |
| #118  | MFDS processed-food values: an auth key (on hold by the user)                                  |

## Open epics

| Epic                          | Open sub-issues | Waiting for                         |
| ----------------------------- | --------------- | ----------------------------------- |
| #83 Build food nutrition data | #47, #118       | keys on hold by the user            |
| #82 Record sleep              | #28             | the Garmin key, on hold by the user |

## User decisions

- **Recorded on 2026-11-26 and 2026-11-27:** #329 (keep access limited to the allowed IPs and build quick entry; the meal follows the time of day), #350 (option B: the day log is the first menu item and the start page, Quick entry follows it, the installed app opens on the day log; the menu order and the start screen are user decisions), #351 (option A+: seeded foods renamed to English, Korean kept as a hidden search alias), #115 (go ahead). Details are in the [2026-11-27 daily log](../daily/2026-11-27.md#decisions-and-open-questions).

- **Recorded on 2026-11-22:** #220 (install React Query, option A path), #215 (opt back in to `shared/contract.ts`), #199 (keep the source units; the Bibigo row stays, with a note), #268 (the worker merges the central fix), #206, #207 and #204 (changed by #306, see above), #305 (fix the font centrally, option A), #115 (park until the central version raise). #304 route-level code splitting was closed as not planned: lazy-loading cut the first-load gzip by 18.2%, under the 20% bar.
- **Garmin (#26):** use the official Personal API. The data to store is the recommendation in the #26 comment, and the sleep date takes the day you woke up as its start. The field names in the real response, the usage limit, and whether a Korean account can use it are not confirmed yet.
- **Foods (#33):** 95 popular foods from the MFDS food nutrition DB. The limits are in the [change record](../changes/33-popular-foods.md), and how to look it up is in the [data rules](../food-data.md).
- **Request rate limit:** do not dismiss the CodeQL alert; handle it with `express-rate-limit`. Keep the nginx limit too. Apply it to a new router in the same way.

## Known gaps

- **Local DB tests:** every DB integration test is limited to `health_test` (#52). This PC does not have this DB, so verify in CI, or start a temporary cluster with `initdb` in `C:\Program Files\PostgreSQL\17\bin`. `TEST_DATABASE_URL` points to `study_test` of another project, so do not use it. Start the temporary cluster with `lc_messages=C` (see the [#347 change record](../changes/347-lab-test-cleanup.md)).
- **`npm audit`:** in the 2026-11-08 analysis, the moderate findings left came from minimatch in a dev tool (ESLint); `npm audit --omit=dev` showed 0. #115 is closed (PR #353). The analysis is in the [#114 change record](../changes/114-next-steps.md).

## Working with lanes

- Run `npm run check` in one worktree at a time. Take the shared lock first: create `D:/orca/workspaces/health-log/.check-lock` with `mkdir` (it fails if the folder exists), run the check in the foreground, and remove the folder when it ends, pass or fail. A lock older than 40 minutes is stale.
- Orca holds about 12 terminals, and setup terminals run `npm install` once per worktree.

## Run boundaries

`main` deploys itself, so merge only what is ready to run on the server. Manual deploy actions and creating or changing AWS resources are done only on a separate request. There are no sub repositories to sync (project-standards ADR-0022).
