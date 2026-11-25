# #323 Daily condition score (mood, energy, stress)

- Issue: [#323](https://github.com/sirloinbh/health-log/issues/323)
- Branch: `feat/323-condition-score`

## Purpose

The daily check card recorded what was done, not how the day felt. Mood, energy and stress can now be rated from 1 to 5 for a date.

## Decisions

Recommendation A was proposed to the coordinator (option B: a new table; option C: all three required). Unless changed, this PR follows A.

- **Storage:** three nullable `smallint` columns on `day_checks`, each limited to 1 to 5 by the database.
- **Empty scores:** each score is optional. `NULL` means not rated.
- **Not empty:** a row is kept when any check, score or note is present, so a day with only a score is saved.

## Change — 2026-11-25

- **DB** `database/migrations/022_day_check_condition.sql`: adds `mood`, `energy`, `stress`; the `day_checks_not_empty` constraint now counts them.
- **API** `backend/src/checks.ts`: PUT accepts `mood`, `energy`, `stress` (whole number 1 to 5 or null); GET/PUT return them. Other values are rejected with 400 before any query.
- **Screen** `frontend/src/checks.tsx`, `frontend/src/check-text.ts`: one button group per score (`Not rated`, 1 to 5) with `aria-pressed`; the ends of the scale are named in the accessible label ("1 of 5, Low"). The saved view shows each score. The client refuses a save with nothing in it.
- **Tests:** backend validation, integration (save, change, clear, DB constraint), screen (pick, save, take back, score-only day).
