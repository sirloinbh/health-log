# #386 Adopt the shared design-system helpers

Part of sirloinbh/project-standards#1177.

## Change

| Local copy (removed)              | Shared piece now used                              |
| --------------------------------- | -------------------------------------------------- |
| `plural.ts` (`count`)             | `plural` from `lib/format`                         |
| `serviceToday` in `daily-date.ts` | `serviceToday` from `lib/format`                   |
| `shiftDate` in `daily-date.ts`    | `addDays` from `components/period-nav/periods`     |
| `busy-button.tsx`                 | kit `BusyButton` (also shows a spinner while busy) |

## Not changed

- `formatDate` (full date with weekday) stays: the kit has no full-date style. Export, tables and empty states are left for a separate card.

## Visible differences

- A busy button shows a small spinner next to its label.

## Verification

See the PR.
