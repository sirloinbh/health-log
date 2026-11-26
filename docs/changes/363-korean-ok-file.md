# Mark the Korean nutrition label parser for the standards check (#363)

The central standards check (sirloinbh/project-standards#1129, PR #1140) fails on Korean outside comments in `frontend/src`. All of it is in `nutrition-label.ts`, which matches the Korean words of a Korean nutrition label. The file now carries a `korean-ok-file` marker comment.

| File                                 | Change                                      |
| ------------------------------------ | ------------------------------------------- |
| `frontend/src/nutrition-label.ts`    | One `korean-ok-file: <reason>` comment line |
| `docs/changes/363-korean-ok-file.md` | This record                                 |

Verification: a scan of `frontend/src` for Hangul in non-test files finds only this file. The repo's synced `.standards/check.mjs` does not know the marker yet, so the marker has no effect until the next sync PR brings the central check; the comment changes no behavior.

Limits: comment only; no app behavior changes.
