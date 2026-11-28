# #388 Remove explanatory, example and motivational text

- Issue: [#388](https://github.com/sirloinbh/health-log/issues/388) (tracking: sirloinbh/project-standards#1216; rule: design-system `docs/guidelines.md`, "Screen text rule")

## Changes — 2026-11-29

Search used: `description=`, `e\.g\.`, `placeholder=`, `aria-describedby` help ids, and `text-muted-foreground` paragraphs in `frontend/src` (not tests, not the UI kit).

Removed:

- Page intro lines: Combos, Foods, Lab results, Medication, Clinic, Dashboard, Settings (`Page` description is now optional).
- Helper lines under fields and their `aria-describedby`: meal copy, typed-meal junk flag, check note length, nutrition table paste, Coupang source note, junk food flag, cigarettes, MFDS search.
- Card intros and notes: "Download my records" intro, goals intro and the goal-change explanation, combo "records the chosen meal" line, "A tap records one serving" line, the report chart notes and the "relationship only" line, the "Records by day" description, the sleep and condition comparison notes, the empty combo hint "Search for foods below and add them".
- Example and hint placeholders: `e.g.` goal values (and the unused `example` data), `Name or brand` (3 search fields), `Clinic or procedure name`, the nutrition table prompt.

Kept: labels, error and validation messages, empty-state titles and next-step text, status text, confirm-dialog consequence text.

Tests: the tests that asserted the removed text now check it is gone or were dropped.
