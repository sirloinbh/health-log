# #149 Past records in English (issue numbers 30 to 98)

- Issue: [#149](https://github.com/sirloinbh/health-log/issues/149)
- Branch: `docs/149-english-records-30-98`
- Part of the tracking issue sirloinbh/project-standards#487. Other batches of #149 are translated in separate PRs.

## Problem

The change records under `docs/changes/` were written in Korean. PR #153 translated the first 22 files and listed 34 files still in Korean. This PR is the batch of those files whose issue number is below 100.

## Change

Translated these 22 files to English, keeping the structure, headings, tables, code, commands, file paths, identifiers, issue and PR numbers, and dates:

- `docs/changes/30-meal-records.md`
- `docs/changes/31-franchise-foods.md`
- `docs/changes/32-bibigo-foods.md`
- `docs/changes/33-popular-foods.md`
- `docs/changes/35-coupang-paste.md`
- `docs/changes/36-alcohol-tobacco.md`
- `docs/changes/37-daily-checks.md`
- `docs/changes/38-junk-food.md`
- `docs/changes/39-clinic-visits.md`
- `docs/changes/40-medications.md`
- `docs/changes/43-change-report.md`
- `docs/changes/45-goals.md`
- `docs/changes/46-meal-combos.md`
- `docs/changes/48-reminders.md`
- `docs/changes/50-daily-date-range.md`
- `docs/changes/53-migration-runner.md`
- `docs/changes/67-food-list-limit.md`
- `docs/changes/71-save-during-date-change.md`
- `docs/changes/76-recent-foods.md`
- `docs/changes/78-dialog-focus-return.md`
- `docs/changes/92-memo-nul-retry.md`
- `docs/changes/98-dialog-save-focus.md`

Korean kept on purpose, with an English gloss where the meaning is not obvious:

- Quoted UI strings, notices, and error messages (for example "결과 더 보기" = show more results).
- Data values stored in the DB or matched by tests: food and menu names (Bibigo products in #32, popular foods in #33, franchise menu items in the #31 cross-check table), the alcohol types and units, and screen labels such as "복용 중" and "다가오는 일정".
- Quoted test names and Korean grammar examples (the particles in #39).

The facts in each record were not changed. No headings were renamed, so no anchors changed.

## Checks

- Prettier check on the 22 files plus this record, with the shared options of `@sirloinbh/prettier-config` (printWidth 100, single quotes), run with the Prettier of another local clone because this clone has no `node_modules`: passed after `--write`.
- Hangul search (`[\uAC00-\uD7A3]`) over the batch: every file still has some Hangul, all of it in the kept categories above. No untranslated prose was left.
- The files not in this batch were not touched.
