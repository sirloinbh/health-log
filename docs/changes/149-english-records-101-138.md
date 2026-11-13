# #149 Past records in English (records 101 to 138)

- Issue: [#149](https://github.com/sirloinbh/health-log/issues/149)
- Branch: `docs/149-english-records-101-138`

## Problem

The change records under `docs/changes/` for issues 101 and above were still written in Korean. The first batch (PR #153) translated 22 files, and this batch translates 12 of the 34 files that were left. Tracked by sirloinbh/project-standards#487.

## Change

Translated to English:

- `docs/changes/101-food-meal-char-count.md`
- `docs/changes/104-goal-card-refresh.md`
- `docs/changes/107-sober-week-goal.md`
- `docs/changes/114-next-steps.md`
- `docs/changes/120-label-columns.md`
- `docs/changes/122-paste-more-shapes.md`
- `docs/changes/126-card-save-focus.md`
- `docs/changes/127-list-retry.md`
- `docs/changes/128-dashboard-range.md`
- `docs/changes/134-foods-paging-flaky.md`
- `docs/changes/137-recent-foods-race.md`
- `docs/changes/138-dashboard-nav-focus.md`

Rules used:

- Headings, tables, commands, command output, file paths, identifiers, issue and PR numbers, and dates are kept. The facts in each record were not changed.
- Korean UI strings, error messages, test names, and pasted sample text that the records quote are kept in quotes or code spans, with an English gloss in parentheses where the meaning is not obvious. This includes the Korean nutrition label words that the paste parser matches on (in the records for #120 and #122).

Korean kept: only those quoted strings in the files above. No prose is left in Korean.

## Checks

- Prettier check on the changed files with the repository Prettier: see the PR.
- Hangul search (regex `[\uAC00-\uD7A3]`) over the batch: only the quoted strings above remain.
- No app code changed, so no app tests were added.
