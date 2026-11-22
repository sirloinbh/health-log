# #215 Share period and number rules through shared/contract.ts

- Issue: [#215](https://github.com/sirloinbh/health-log/issues/215)
- Branch: `refactor/215-shared-contract`

## Purpose

The screens and the API each had their own copy of rules they must count the same way. `periodSpan` in `frontend/src/report-text.ts` copied the backend `periodsOf`, linked only by a comment. `charCount`, `hasTwoDecimalsAtMost` and the amount limit `99_999` existed once on each side. A server change could break the period buttons while the client tests still passed.

## Decision

The issue was filed before project-standards#783 removed the unused `shared/contract.ts` stub on 2026-11-20 (ADR-0026: the contract is opt-in, and the registry has `features.contract: false` for health-log). On 2026-11-22 the user chose to opt back in (decision comment on #215). The registry change is filed as sirloinbh/project-standards#978.

## Change — 2026-11-22

- **`shared/contract.ts` (new)**, the source of truth: `charCount`, `hasTwoDecimalsAtMost`, `maxAmount` (99,999) and `periodsOf`. It imports nothing, so the copy works on its own.
- **`backend/src/contract.ts` (new)**: the copy written by the managed `npm run contract:sync`. `npm run contract:check` (part of `npm run check`) fails when it differs.
- **Backend**
  - `backend/src/day-records.ts` is deleted; `checks.ts`, `goals.ts`, `habits.ts`, `meals.ts` and `report.ts` import `periodsOf` from `contract.js`.
  - `text.ts` and `numbers.ts` re-export `charCount` and `hasTwoDecimalsAtMost` from the contract, so their importers are unchanged.
  - `foods.ts` and the meal calorie limit in `meals.ts` use `maxAmount`.
- **Frontend**
  - `periodSpan` is deleted; `report.tsx` uses `periodsOf(date)[period]`.
  - `check-text.ts` and `number-input.ts` re-export `charCount` and `hasTwoDecimalsAtMost` from `../../shared/contract`, so their importers are unchanged.
  - `nutrition-label.ts` imports `maxAmount` from the contract.

Tests:

- `backend/test/day-records.test.ts` became `backend/test/contract.test.ts`. It still covers `periodsOf` (week and month ends, leap years, server time zones) and adds the number and text rules.
- `frontend/src/report-text.test.ts`: the period cases now run against `periodsOf` from the shared file the screen imports.
- The existing `charCount`, decimal and limit tests on both sides run through the re-exports.

## Verification

- `rg "function charCount|const charCount|periodSpan|const hasTwoDecimalsAtMost|const maxAmount|99_999" frontend/src backend/src shared` (test files excluded): only `shared/contract.ts` and its managed copy `backend/src/contract.ts`.
- `npm run contract:check`: "Contract copies match shared/contract.ts", 3 passed.
- Backend and frontend `tsc`: passed. `node --import tsx --test test/contract.test.ts test/text.test.ts`: 10 passed. `vitest run` on the report, check-text, number-input and nutrition-label tests: 93 passed.
- `npm run check` (foreground, under the lanes' shared check lock) with `TEST_DATABASE_URL` on a temporary PostgreSQL 17 `health_test`: passed. Backend 290 passed, 0 skipped (DB integration tests ran); frontend 731 passed, 3 skipped (existing skips); contract 3, skills 4 passed; format, lint, typecheck and build passed. The run before it had one failure in `frontend/src/lib/query.test.tsx` ("leaving the screen aborts the request"), a file this PR does not touch; it passed twice when run alone and in this full run.
- No browser check: no screen looks different. The period buttons get the same dates from the same function, and the report screen tests cover them.

## Change — 2026-11-22 (main merged in)

- After #264 (#196) merged, `origin/main` was merged into this branch without conflicts. No local copy came back (the same `rg` finds only the contract), and `npm run contract:check` matches.
- `npm run check` (foreground, under the shared check lock, `TEST_DATABASE_URL` on the temporary `health_test`): passed. Backend 298 passed, 0 skipped; frontend 764 passed, 3 skipped; contract 3, skills 4 passed; format, lint, typecheck and build passed.
