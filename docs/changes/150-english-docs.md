# #150 Current docs in English

- Issue: [#150](https://github.com/sirloinbh/health-log/issues/150)
- Branch: `docs/150-english-docs`

## Purpose

Every markdown file outside `docs/changes/`, `docs/daily/`, and `docs/adr/` is English. Past records are handled in #149.

## Changes

- Translated: `README.md`, `backend/README.md`, `frontend/README.md`, `database/README.md`, `AGENTS.project.md`, `docs/access-protection.md`, `docs/food-data.md`, `docs/project-setup.md`, `docs/next-steps/README.md`, and the three project skills `skills/health-log-*/SKILL.md`.
- `.claude/skills/` was refreshed from `skills/` with `npm run skills:sync`.
- Skipped (centrally managed, translated in `sirloinbh/project-standards`): `AGENTS.md`, `CLAUDE.md`, `skills/std-*/SKILL.md` and their copies, and the other files listed in `.standards/manifest.json`.
- Headings that other files link to were renamed with the translation: `#server-setup` in `docs/access-protection.md` (linked from `docs/next-steps/README.md`) and `#11-bootstrap-checklist` in `docs/project-setup.md`.
- `docs/project-setup.md` chapter 2 said documents are written in Korean. It now says English, as the user decided on 2026-11-12, and points to `sirloinbh/project-standards#457` for screen text.

## Korean kept

- Korean food names and words used as examples (`docs/food-data.md`), the escaped Korean literal examples in SQL, and the example display name in `docs/project-setup.md`. Each has an English gloss next to it.
- The `'기타'` example in `database/README.md` and `docs/project-setup.md`, which shows how Korean text breaks in a PowerShell pipe.

## Verification

See the PR.
