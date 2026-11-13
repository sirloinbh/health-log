# #53 Migration runner for the deploy script to execute

- Issue: [#53](https://github.com/sirloinbh/health-log/issues/53)
- Branch: `chore/53-migration-runner`

## Purpose

`deploy/remote-deploy.sh` runs `node dist/migrate.js` during deployment. This repository did not have that file, so the first server deployment would have stopped at this step because of `set -e`. This brings in the runner that the deploy script executes.

## Decisions

As the issue recommended, after checking the other apps and the central scaffold, the central standard was brought in as it is, instead of building a new one. It was decided without asking the user and left in an issue comment.

- **What was checked:** The central [DB migration rules](https://github.com/sirloinbh/project-standards/blob/main/docs/conventions/database.md) and the scaffold `scaffold/app/backend/src/migrations.ts` and `migrate.ts` (as of `origin/main` on 2026-11-05). life-journal, plan-routine, study-log, and workout-memo use the same runner.
- **Method:** Records of applied files are kept in `schema_migrations(name, checksum, applied_at)`, and only files not in the records are run, in name order.
  - Each file is one transaction. If it fails, only that file is rolled back and it stops.
  - If a recorded file is gone or its content changed, or there is a new file with a number lower than the last recorded file, it applies nothing and fails.
  - With an advisory lock (fixed key `581_003`), only one runner applies at a time.
- **New files:** Files from 010 on are also applied without being registered separately, as long as the name format is right. This PR adds no migration file.
- **Differences from the scaffold:** The BOM inside the regular expression of `migrations.ts` is not left as an invisible character but written with a Unicode escape (same as life-journal). `migrate.ts` only has a usage comment for deployment added.
- **`deploy/*`:** Nothing needed to be fixed. The `/database/migrations` that the deploy script mounts is the same as the path found with `../../database/migrations/` from `/app/dist/migrate.js` inside the image.

## Change — 2026-11-06

- **Runner** `backend/src/migrations.ts`, `backend/src/migrate.ts`: the method above. `npm run build` creates `backend/dist/migrate.js`.
- **Command** Added `db:migrate` to the root and `backend/package.json`. If this script exists, the common CI applies once with psql and then runs the runner.
- **Docs** Changed the way to apply in `database/README.md` to be based on the runner. The way to apply to an existing DB in section 6.3 of `docs/project-setup.md` was also aligned.

## Verification

- Tests
  - `backend/test/migrations.test.ts` (same as the scaffold): Checks without a DB that the checksum ignores line breaks and BOM, the file name format and duplicate numbers, the pending list, and the errors for changed, missing, and lower-numbered files.
  - `backend/test/migrations.integration.test.ts`: Runs only on `health_test`. Each test creates and drops an empty schema, so it does not touch the tables of `health_test` or the other integration tests running in parallel.
    - In an empty schema, all files are applied in order and recorded.
    - After inserting one daily check row and running again, there are no files to apply, and every row of every table is as it was (including the food seed).
    - In a DB that already has the schema applied but no record table (an empty Docker volume), all files are applied once more while being recorded, and the data stays as it is.
    - If there is a changed file, it stops without running even a new file attached after it (a check of the record was added after the first review). For a new file attached after, only that file is run, a failed file is rolled back alone, and its name appears in the error.
    - Running the `migrate.ts` command twice as a separate process prints "적용 완료: 001…009" (applied: 001…009) and then "적용할 마이그레이션이 없습니다." (there are no migrations to apply.), and `--status` shows all as "적용됨" (applied).
  - `backend/test/build-output.test.ts` (added after the first review): Builds the backend into a temporary folder and checks that `migrate.js` and `server.js` appear at the top of the output. If the `dist/migrate.js` path that deployment runs changes because of a tsconfig change, it fails.
- Temporary PostgreSQL 17 cluster (port 5472)
  - After applying the 9 to `health_test` with psql as CI does, the runner was run twice. The first applied again while recording the 9, and the second had no files to apply.
  - After `npm run build`, `backend/dist/migrate.js` was run twice on a new empty DB. After applying 9, "적용할 마이그레이션이 없습니다.", exit code 0. After the check, that DB was dropped.
  - Running against an address that cannot be connected ends with exit code 1 (the deployment stops).
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: passed both at first and after the first round of fixes.
  - Backend: 170 (171 after the first round of fixes) passed, 0 skipped.
  - Frontend: 323 passed, 2 skipped. The 2 skipped are existing conditional tests unrelated to this change.
  - Skill checks: 4 passed.
- `npm run knip`: passed.

## Not done

- It was not run through a real server deployment (`deploy/remote-deploy.sh`). The server is not deployed now.
- `node dist/migrate.js` was not run directly inside the Docker image. The path was checked in code as above, and CI builds the image.

## Review

- **First:** Nothing had to be fixed. What was applied:
  - There was no test that automatically checks the `dist/migrate.js` path → added `build-output.test.ts`.
  - An invisible BOM character was in this document → changed it to words.
  - The changed file test checked only the error message → it also checks that the new file was not run.
  - If `DROP SCHEMA` in the cleanup step failed, it hid the original error → cleanup failures are ignored.
  - Not applied: the point that it overwrites an `options` that is already in `TEST_DATABASE_URL`. There is no such setting now, so it is left.
- **Second:** Nothing had to be fixed. The runner was added to the test DB preparation step of `docs/project-setup.md`, and the wording of this document was polished.
  - Split off: The problem that when the connection drops, a `pg_advisory_unlock` error hides the original error is central scaffold code, so it was passed on to project-standards [#414](https://github.com/sirloinbh/project-standards/issues/414) (the exit code is 1, so deployment stops).
  - Left as it is: because test cleanup failures are ignored, a `migrate_*` schema may rarely remain. Other tests look only at `public`, so there is no effect.
