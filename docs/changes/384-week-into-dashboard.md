# #384 Merge Week and 12 weeks into Dashboard

- Issue: [#384](https://github.com/sirloinbh/health-log/issues/384) (tracking: sirloinbh/project-standards#1215)

## Changes — 2026-11-28

- The Week and 12 weeks menu items and their fixed pages are removed. Dashboard already picks its period from the address (week, month, 12 weeks) with the period buttons.
- `/week` redirects to `/dashboard?period=week` and `/weeks` to `/dashboard?period=weeks12`.
- Tests: `app.test.tsx` checks the menu and both redirects.
