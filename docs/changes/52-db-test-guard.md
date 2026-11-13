# #52 A dedicated-DB safeguard for the basic DB test, and the notation in the DB docs

- Issue: [#52](https://github.com/sirloinbh/health-log/issues/52)
- Branch: `fix/52-db-test-guard`

## Purpose

- `backend/test/db.integration.test.ts` ran whichever DB `TEST_DATABASE_URL` pointed to. On this PC it also passed against `study_test` of another project, so it looked like a pass without checking the health-log schema.
- In `database/README.md`, `U&'\\XXXX'` had 2 backslashes. If you copy it as it is, letters of the code value such as `\AE30` are stored instead of Korean.

## Changes: 2026-11-06

- **Shared safeguard:** `testDatabaseSkip(url)` in `backend/test/helpers.ts`
  - If the DB name is `health_test` it runs, and otherwise it is skipped with the reason `not the dedicated health_test DB: <name or none>` (the message in the code is Korean: `health_test 전용 DB가 아닙니다: <이름 또는 없음>`).
  - The same 7 lines that were copied into 11 integration test files were replaced with a call to this function. The behavior is the same.
- **Basic DB test:** `db.integration.test.ts` only reads, but it uses the same safeguard. Before, it was skipped only when `TEST_DATABASE_URL` was not set.
- **Docs:** `database/README.md`: fixed the notation to `U&'\XXXX'` (one backslash) and added the example `U&'\AE30\D0C0'` (기타, "other"). This file is not centrally managed (it has no header comment and no project-standards template). So we fixed it in this repository and did not create a central issue.

## Verification

- Test `backend/test/db-guard.test.ts` (runs without a DB)
  - `health_test` runs. A URL with a query string is the same.
  - `study_test`, `health`, no URL, an empty string, and a URL with an empty DB name are skipped with the name or "none" as the reason (the empty name was added after the first review).
  - A URL that cannot be read fails, and the password is not in the whole error output (including its properties) (added after the first review, and after the second review strengthened from the message only to the whole output).
  - `database/README.md` has the `U&'\XXXX'` rule, and there are no 2 backslashes inside a `U&'` literal.
- A temporary PostgreSQL 17 cluster (port 5472)
  - On the same server `U&'\\AE30\\D0C0'` returned `\AE30\D0C0`, and `U&'\AE30\D0C0'` returned `기타`. It matches the description in the docs.
  - We set `TEST_DATABASE_URL` to `other_test` and ran `db.integration.test.ts`. The result was `# SKIP health_test 전용 DB가 아닙니다: other_test` (not the dedicated health_test DB), with 1 skipped.
  - `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: passed.
    - Backend: 174 passed, 0 skipped.
    - Frontend: 340 passed, 2 skipped. The 2 skipped are existing conditional tests unrelated to this change.
    - Skill check: 4 passed.
- `npm run knip`: passed.

## Review

- **First:** nothing had to be fixed. What we applied:
  - With a URL such as `postgres://host/` where the DB name is empty, the reason looked empty after the colon → it now shows "none".
  - With a URL that cannot be read, the Node error printed the value including the password as it was → it now fails without the value. We added both cases to `db-guard.test.ts` (4 passed).
  - After applying them, we ran lint, types, format, the backend tests (93 passed, 77 DB tests skipped), and knip again without `TEST_DATABASE_URL`. The judgement for `health_test` did not change, and the DB run is checked in CI.
  - Not applied: the wording about #52 in `docs/next-steps/README.md`. We decided not to change that file in this work.
- **Second:** nothing had to be fixed. We changed the password exposure check from `error.message` to the whole printed error (`util.inspect`). If the original error is attached later as `cause`, the password would be printed again through the `input` property of the Node error, and now the test catches that case too. We also fixed the comment to match.
