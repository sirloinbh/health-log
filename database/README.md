# Meal, sleep, and health log PostgreSQL

PostgreSQL 17. The only source of migrations is `migrations/NNN_<description>.sql`. The rules and the runner follow the central standard [database migration rules](https://github.com/sirloinbh/project-standards/blob/main/docs/conventions/database.md).

## How to apply

The runner (`backend/src/migrate.ts`) runs only the files that are not applied yet, in file name order, and records each file name and checksum in the `schema_migrations` table.

| Situation     | Command                                                              | Note                                                                                                        |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Local         | `npm run db:migrate`                                                 | From the repository root. Uses `DATABASE_URL` from `.env`                                                   |
| Local check   | `npm run db:migrate -- --status`                                     | Prints only the applied and pending lists and errors. Does not change the DB                                |
| Empty volume  | `docker compose up -d db`, then `npm run db:migrate`                 | Docker init first runs every file without recording it, then the runner applies them again and records them |
| CI            | The shared CI applies once with psql, then `npm run db:migrate`      | This also checks that running again is safe                                                                 |
| Server deploy | `deploy/remote-deploy.sh` runs `node dist/migrate.js` after the dump | If it fails, the new version does not start and the script stops                                            |

On the first run against a DB with no record table (a DB where files were applied earlier with psql), everything from 001 is applied again and recorded. After that, only new files run.

Do not pipe SQL through PowerShell, as in `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII to an external program, so Korean text turns into `?`. The runner lets Node read the file directly as UTF-8.

## File rules

- The name is `NNN_<lowercase English letters, digits, underscores>.sql`. Numbers go up one at a time with no gaps, and parallel branches reserve a number when they start.
- Write every migration so it is safe to run again (`IF NOT EXISTS`, `ON CONFLICT`). On an empty volume the same file runs twice.
- The runner wraps each file in a transaction. Do not use `BEGIN`, `COMMIT`, or psql meta commands (`\i`, `\set`) inside a file.
- Do not edit a file that is already applied. The checksum would differ and the runner would stop. Add the change as a new numbered file.
- Keep the meaning of existing data, and leave values you could not confirm as NULL. For Korean literals in SQL, use the `U&'\XXXX'` escape where possible (one backslash, for example `U&'\AE30\D0C0'` is '기타', "other").
