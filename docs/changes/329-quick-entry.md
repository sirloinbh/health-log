# #329 Quick entry screen for meals and water

- Issue: [#329](https://github.com/sirloinbh/health-log/issues/329)
- Branch: `feat/329-quick-entry`

## Purpose

On a phone, recording a meal or a cup of water took several steps on the daily record page. The new quick entry page does it in one or two taps, for today.

## Decisions

The user decided these on 2026-11-26 (comments on #329):

- **Access:** access stays limited to the allowed IPs. The page is used on the phone over the home or office Wi-Fi, so there is no firewall, server or AWS change.
- **Meal for a recent food:** chosen in advance from the time of day in Asia/Seoul, and changeable with large buttons. Breakfast is from 05:00, lunch from 10:00, dinner from 15:00, and snack from 21:00 to before 05:00.
- **How to get there:** "Quick entry" is the first item of the main menu, and the installed app opens on it.

## Change — 2026-11-26

- **Page** `frontend/src/quick-entry.tsx` at `/quick`, for the server's today:
  - **Water:** the day's cups and ml, with large "One cup" and "One less" buttons.
  - **Meal:** the four meals as large buttons, with the one for the time of day chosen first. Each recently eaten food is a full-width button that records one serving in the chosen meal. With no recent foods yet, it links to the daily record.
- **Time of day** `frontend/src/quick-entry-text.ts`: `mealAt` reads the hour in Asia/Seoul whatever the device time zone is.
- **Shared code:** the daily cards' add and counter logic moved into hooks, so both pages save the same way. `use-meal-add.ts` (`useMealAdd`) holds the meal add with its Idempotency-Key retry, from `meals.tsx`. `use-intake-day.ts` (`useIntakeDay`) holds the counters, from `intake.tsx`. `useAddEntry` takes an optional `initialMeal`. The daily cards behave as before.
- **Installed app start** `frontend/src/app.tsx`: `manifest.webmanifest` is a centrally managed file with `start_url: "/"`. So when the app runs in the standalone display mode and opens at `/`, it moves to `/quick` once, at launch. Going back to the dashboard later stays there, and an installed app opened at any other address stays where it is.
- **Tests:** `quick-entry.test.tsx` covers:
  - the meal chosen by time;
  - a tap sending one serving with an Idempotency-Key;
  - changing the meal;
  - a failed add;
  - water up and down;
  - the no-recent-foods message;
  - no buttons before the server gives today.

  `quick-entry-text.test.ts` covers the hour boundaries and the device time zone. `app.test.tsx` covers the menu order, the installed-app start, going back to the dashboard, and an installed app opened at another address.

## Verification — 2026-11-26

- `TEST_DATABASE_URL=<scratch PG 17 with all migrations> npm run check` passed: backend 357 pass, 0 skipped; frontend 872 pass, 3 skipped. `npm run knip` passed. The first run failed three labs tests because of a row an earlier labs run left in the reused scratch DB. That is a bug in the labs test itself, filed as #347; after removing the row the check passed.
- **Browser:** the API and Vite dev server ran against the scratch DB, with four recent foods added through the API. Headless Chrome opened `/quick` at 390×844 (touch) and 1440×900. There was no horizontal overflow and no page error, and the smallest button was 44 px high. At 21:56 Seoul time "Snack" was chosen first. A tap on a recent food saved it as a snack for 2026-11-26, and "One cup" added 250 ml.
