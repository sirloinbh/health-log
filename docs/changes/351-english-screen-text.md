# #351 English screen text and English seeded foods

- Issue: [#351](https://github.com/sirloinbh/health-log/issues/351)
- Branch: `fix/351-english-screen-text`
- Related: sirloinbh/project-standards#1129

## Decision

User choice A+ (2026-11-27): a migration renames the seeded public (005), franchise (013) and Bibigo (014) foods, their brands and their categories to English, for example `Jajangmyeon (black bean noodles)` in `Noodles and dumplings`. The old Korean text is kept as a hidden search alias that only the food search uses, so a Korean search still finds the food. Foods a person added are not touched. The Korean nutrition-label parser stays (it reads Korean product labels).

## Changes

- `database/migrations/027_foods_english_names.sql`: adds `foods.search_alias` and renames 286 seeded rows (95 public, 164 franchise, 27 Bibigo) by their old name and brand. The alias is the old `brand name`. A category is renamed only while it still has its seeded value; a row stays as it is when a food with the English name and brand already exists. A second run updates 0 rows.
- `backend/src/foods.ts`: the search reads `concat_ws(' ', brand, name, search_alias)`. The alias is not in the returned columns, so no screen or response shows it.
- `frontend/src/food-dialog.tsx`: the label box placeholder is English (earlier commit on this branch).
- `docs/food-data.md`: new rows use English names, brands and categories, with the Korean text in `search_alias`; the documented example and its test follow.
- Tests in `backend/test/foods.integration.test.ts` use the English names. New tests: no Korean left in the seeded rows, Korean searches (`짜장면`, `맥도날드 빅맥`, `비비고 갈비탕`) find foods without showing Korean, a rerun changes nothing, and a person's food with a Korean name and brand is kept.

## Not changed

- Existing meal entries and combos keep the name they were saved with; they are history.
- Test data written in Korean, and the Korean label parser.

## Verification

- Throwaway PostgreSQL 17 database `health_test`: `npm run db:migrate` applied 001 to 027; 286 rows renamed, 0 rows with Korean text, 286 aliases; a second run of 027 gave `UPDATE 0`.
- `foods.integration.test.ts` (against that database): 20 passed, 0 failed.
- `npm run check` with `TEST_DATABASE_URL` set to that database: passed (360 backend tests including the integration tests, frontend tests, lint, typecheck, build). The migration replay test needed the delete step in 027 for replayed seed rows.
