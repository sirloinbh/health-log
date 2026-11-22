# #199 Correct serving units in the seeded food data

- Issue: [#199](https://github.com/sirloinbh/health-log/issues/199)
- Branch: `fix/199-seed-serving-units`

## Purpose

The seeded foods mixed units: McDonald's drinks used `ml` while the rest used `mL`, and three solid foods showed as "1 serving 230.3mL" (toast). The issue also asked to move drinks such as cola from `100 g` to mL, and to re-check one Bibigo row whose calories do not add up.

## Facts checked on the sources (2026-11-22)

- The MFDS pages give cola (`R121-045110000-0000`), milk, beer and the other drinks in `005` per **100 g**, not 100 mL. The Lotteria, KFC and Mom's Touch official tables give their drinks in g. Only McDonald's gives ml.
- The MFDS pages of sweet and sour pork (`D412-566000000-0001`, 343 mL), fried squid (`D612-571000000-0001`, 77 mL) and toast (`D402-145000000-0001`, 230.3 mL) state the total content and the basis in mL, although they are solid foods.
- Bibigo Galbitang 400g: the CJ The Market nutrition API (`/the/api/product/v1/nutritions/40145162`) returns no data now, so the value cannot be checked again. The #32 record already says the label itself does not add up.

## Decision

The user chose to keep the source units (option C, recorded in the [#199 comment](https://github.com/sirloinbh/health-log/issues/199#issuecomment-7071483723)):

- Drinks stay in g where the source gives g. The done criterion "Searching cola in the app shows a mL serving" and the task "a test that seeded drink rows use mL" are dropped.
- Only `ml` → `mL` and the three solid foods → `g` change, with the numbers unchanged.
- Bibigo Galbitang keeps 85 kcal, with a source note in the migration comment.

## Change

- `database/migrations/020_foods_serving_units.sql` (new): two `UPDATE`s keyed by name and brand. The 10 McDonald's drinks go from `ml` to `mL`, and the three solid foods go from `mL` to `g` (also keyed by their seeded size). Each changes only rows that still have the seeded unit, so a value fixed on the screen is kept and a second run changes nothing. `checked_on` stays. The comment carries the decision and the Bibigo source note. Number 020: 019 is used by the open branch `fix/197-sleep-body-db-checks`.
- `docs/food-data.md`: a rule to keep the source's unit, write `mL`, and store a solid food listed in mL in g.
- `backend/test/foods.integration.test.ts`: a new test, and the McDonald's cola sample in the franchise test now expects `mL`.

## Verification

- New test "seeded serving units are corrected once and a rerun changes nothing": the three solid foods are `343g`, `77g`, `230.3g`; cola stays `100g`, Americano `532mL`, McDonald's cola `425mL`; no `ml` is left; running the migration again updates 0 rows.
- It failed on the data before 020 (units put back by hand) and passed after applying 020 with psql.
- Local throwaway PostgreSQL 17 `health_test`: 020 applied with the runner (`backend/src/migrate.ts`). `foods.integration`, `franchise-foods`, `bibigo-foods` and `migrations.integration` tests: 32 passed, 0 skipped.
- `npm run check` with `TEST_DATABASE_URL` set to the same throwaway `health_test` (after `npm ci`, because main added `@tanstack/react-query`): passed. Backend 287 passed and 0 skipped, frontend 729 passed and 3 skipped.

## Limits and follow-up

- Meal entries keep the unit they were recorded with (`meal_entries.serving_unit`), as they keep the junk mark. Past entries of the three solid foods still say mL; the numbers are the same.
- The label reader (`frontend/src/nutrition-label.ts`) still fills the unit as lowercase `ml` from a pasted table. That is outside this seed-data issue and is filed as #260.
