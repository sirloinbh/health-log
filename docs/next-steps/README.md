# Next steps

Last updated: **2026-11-08 (Asia/Seoul)**.

Requirements are registered as GitHub issues. Work in the order below, and choose later work with the selection rules of std-backlog.

## To do tomorrow

| Order | Task                                         | Status         | Next action                                                                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | #42 Check backup and restore                 | Decided not to | User decision (2026-11-08): do not check it. #42 was closed as not planned, and the draft PR #68 was closed without merging. The branch `chore/42-backup-restore` is still there                                                                                                                    |
| 2     | #67 Lift the 100-item limit on the food list | Done           | Includes #31 burger franchises and #32 Bibigo data                                                                                                                                                                                                                                                  |
| 3     | #36 Alcohol and cigarettes, #37 Daily check  | Done           | #43 change report, #38 junk food, #45 goals and the follow-ups #104 and #107 are also done. The judgement rules decided in #45 are in the issue comment                                                                                                                                             |
| 4     | #41 Access protection before external access | User           | Decided to allow only the named IPs. Put the office and home IPs in `allowed_cidrs` and apply. Opening the web port is #74: the `compose.yaml` contract is done. The firewall 8103 `port_info` (draft in the #74 comment), the server `.env`, and the check after the first deploy are for the user |
| 5     | #28 Import Garmin sleep data                 | User key       | The user creates a key in Garmin Connect, agrees to the terms, and then the real response is checked                                                                                                                                                                                                |

## In progress

- **agent1, agent2, agent3:** none assigned now.
- **Recently finished:**
  - #48 reminders (PR #124), #126 focus after a card save fails (PR #135), #127 and #131 list retry and the clinic search row (PR #132)
  - #134 food list page tests (PR #136), #137 recent foods test race (PR #140), #138 focus while moving the dashboard period (PR #139)
  - Dashboard #128, #129, and #130 (PR #133), and the part of #74 that belongs to this repository (the `compose.yaml` deploy contract, the [server setup document](../access-protection.md#server-setup), PR #125)
- **Bundle issues:** #84 lifestyle records, #85 clinic and medication, #86 change report and goal judgement, and #87 daily record date handling are closed because all their sub-issues are done.
- **User actions left:**
  - #41 and #74 server port: the firewall 8103 `port_info` (draft in the #74 comment), the server `.env`, and the check after the first deploy
  - #47 photo recognition
  - #28 Garmin key
  - #115 dev tool dependencies
  - #118 MFDS auth key

## User decisions

- **Waiting for confirmation:** the rules decided without user confirmation in #27, #30, #44, and #45 are in the comment of each issue. If you want them different, fix them in a follow-up issue.
- **Garmin (#26):** use the official Personal API. The data to store is the recommendation in the #26 comment, and the sleep date takes the day you woke up as its start. The field names in the real response, the usage limit, and whether a Korean account can use it are not confirmed yet.
- **Foods (#33):** registered 95 popular foods from the MFDS food nutrition DB. Bossam (boiled pork wraps) is not included because there is no suitable source. The limits are in the [change record](../changes/33-popular-foods.md), and how to look it up is in the [data rules](../food-data.md).
- **Request rate limit:** do not dismiss the CodeQL alert; handle it with `express-rate-limit`. Keep the nginx limit too. Apply it to a new router in the same way.

## Not tidied up yet

- **Old local branches:** `chore/3-agent-auto-merge` and `fix/1-vite-port` are branches from before the remote history was rewritten, so `git branch --delete` refuses them as unmerged. The same content is in `main`. Deleting them needs `-D`, so get user approval.
- **Local DB tests:** every DB integration test is limited to `health_test` (#52). This PC does not have this DB, and the current account has no permission to create it. Verify in CI, or start a temporary cluster separately with `initdb` in `C:\Program Files\PostgreSQL\17\bin` and run it there. `TEST_DATABASE_URL` points to `study_test` of another project, so do not use it.
- **`npm audit`:** zod was raised to 4.6.7 (`project-standards#386`). In the analysis of 2026-11-08, all 12 moderate findings that are left come from one minimatch issue (GHSA-g3hv-75wg-m249) used by a dev tool (ESLint). `npm audit --omit=dev` shows 0 findings, so there is no production impact. When the parent packages accept `minimatch >=11.0.1`, the user updates (#115, under #88). The analysis and the results of the dark mode and 320px screen checks are in the [#114 change record](../changes/114-next-steps.md).

## Lower priority issues

- Food data: #47 photo recognition, #118 fill from the MFDS DB (needs a user auth key), (#31 burger franchises, #32 Bibigo, #34 Coupang research, #35 Coupang link and table paste, #120 two-column tables in table paste, and #122 the remaining shapes of table paste are done)
- Records: no issues left (#36 alcohol and cigarettes, #37 daily check, #38 junk food, #39 clinic and procedures, and #40 medication are done)
- Analysis and convenience: no issues left (#48 reminders, #138 dashboard period move focus, #43 change report, #45 goals, #104 automatic re-judgement of goal achievement cards, #107 showing the week basis of the alcohol-free goal, and #128, #129, #130 dashboard focus, year, and range are done)
- Input stability: no issues left (#71, #78, #65, #92, #126, #127, #131, #134, and #137 are done)
- Cleanup: #115 update of dev tool dependencies (waiting for an upstream fix, user) (#50 allowed date range, #52 DB test safeguard, and #53 migration runner are done)

## Run boundaries

Deploys, syncing sub repositories, and creating AWS resources are done only on a separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deploy.
