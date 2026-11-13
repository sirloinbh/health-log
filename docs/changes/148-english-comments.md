# #148 Code comments in English

- Issue: [#148](https://github.com/sirloinbh/health-log/issues/148)
- Branch: `chore/148-english-comments`

## Purpose

Every code comment is English. No behavior changes.

## Findings

- A Hangul search over all code files found no comment that is written in Korean. The comments were already English.
- What remains are Korean words inside English comments. Each one is a quoted example of the text the code reads (for example `"100g당"` in the nutrition label reader), a Korean string literal, or a regular expression. The code and the tests match on them, so they stay.

## Changes

- Added a short English gloss in parentheses where a comment named a bare Korean term without explaining it: `frontend/src/nutrition-label.ts`, `frontend/src/nutrition-label.test.ts`, `frontend/src/foods.test.tsx`, `backend/test/foods.integration.test.ts`.
- No code, string literal, regular expression, or test name changed.

## Verification

See the PR.
