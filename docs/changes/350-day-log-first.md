# #350 Open on the day log and use the shared menu order

- Issue: [#350](https://github.com/sirloinbh/health-log/issues/350)
- Branch: `feat/350-day-log-first`
- Related: sirloinbh/project-standards#1128

## Decisions

The user chose option B on 2026-11-26 (relayed by the coordinator, recorded on #350): the day log is first in the menu and the start page (`/`); Quick entry follows it; the installed app also opens on the day log. This supersedes the quick-entry launch of #329.

## Change — 2026-11-26

- **Start page** `frontend/src/app.tsx`: `/` goes to today's record (`/daily/<today>`). The `InstalledStart` launch redirect to `/quick` is removed. An unknown address falls back to `/`.
- **Old links:** `/?period=...&date=...` (the dashboard used to live at `/`) redirects to `/dashboard` with the same query.
- **Menu order:** Daily record, Quick entry, Week, 12 weeks, Foods, Combos, Clinic, Medication, Lab results, Dashboard, Settings.
- **Week and 12 weeks:** `/week` and `/weeks` are the existing report with the period fixed (no period buttons). The dashboard (`/dashboard`) keeps the period buttons and gains "12 weeks".
- **12-week period:** `weeks12` in `shared/contract.ts` (copied to `backend/src/contract.ts`): 12 weeks, 84 days, ending with the week that holds the date. `GET /api/report?period=weeks12&date=...` returns it, compared with the 12 weeks before.
- **Tests:** menu order, start page in the browser and the installed app, the old link redirect, the Week and 12 weeks pages, the period arithmetic. The dashboard tests now run at `/dashboard`.
