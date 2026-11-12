# #25 The frame of the daily record screen

- Issue: [#25](https://github.com/sirloinbh/health-log/issues/25)
- Branch: `feat/25-daily-record`

## Purpose

Sleep, meal, alcohol and cigarette, and clinic records are all per date, so we first build a shared screen where you pick a date and see the records of that day. The later feature issues fill the empty areas of this screen.

## Changes: 2026-10-31

- **Screen:** added the daily record screen `/daily/YYYY-MM-DD` and a menu item. `/daily` goes to today. You move with previous and next day, today, and the date picker (`frontend/src/daily.tsx`, `frontend/src/app.tsx`).
- **Date calculation:** `frontend/src/daily-date.ts` calculates date strings in UTC, so the browser time zone has no effect.
- **Today:** it does not use the browser clock; it uses the server `serviceDate()` value that `/api/health` returns. If it cannot connect to the server, or the server answers with an error (including a DB failure), it shows the error and does not guess.
- **A date that does not exist:** a URL such as `2026-02-30` shows an error notice and a link back to today.
- **Future dates:** not blocked, because records such as the next clinic appointment follow.
- **Empty areas:** placed cards for sleep, meals, alcohol and cigarettes, the daily check, and clinic and medication.
- **Docs:** updated `docs/next-steps/README.md` based on the registered issues.

## Verification

- Tests added: `frontend/src/daily-date.test.ts` (date judgement, moving, and display), `frontend/src/daily.test.tsx` (today from the server, moving dates, the year being typed, a date that does not exist, a server error, and empty areas)
- `npm run check`: passed. 80 frontend tests passed. 7 backend tests passed, 0 skipped. 4 skill checks passed
- Correction (found in #29): `TEST_DATABASE_URL` on this PC pointed to `study_test` of another project. The "real local DB" in the DB test and the browser check above was this DB, not `health_test`, and the only queries run were `SELECT 1` and a table existence check, so there were no writes. This change does not change the schema, and the dedicated DB verification passed in CI.
- `npm run knip`, `npm run standards:check`: passed

### Browser check

We drove headless Chrome with CDP (remote control of the browser) and set the viewport to exactly 390×844 and 1440×900.

| Item                                                              | 390×844 | 1440×900 |
| ----------------------------------------------------------------- | ------- | -------- |
| `/daily` goes to the server today (`2026-10-31`)                  | pass    | pass     |
| Next day (`02-28`→`03-01`), previous day, date picker, today link | pass    | pass     |
| Error notice for `/daily/2026-02-30`                              | pass    | pass     |
| Horizontal overflow                                               | none    | none     |
| Console errors                                                    | none    | none     |

- At first we checked with an API that had only the DB connection faked, and after the first review we checked again with an API connected to the real local DB.
- A screenshot taken with `--window-size=390,844` looked cut off on the right because of the minimum Chrome window width. That was a problem of how we measured, not of the app, and we confirmed with a measurement that set the viewport exactly.
- We did not check a real phone or dark mode.

## First review fixes: 2026-10-31

Of the 7 findings of the independent review, we fixed 6 in this PR and split 1 into #50.

- **Today after midnight:** fixed the problem that yesterday was still used as today when the date changed while the app was left open. It fetches `/api/health` again every minute and when you return to the tab.
- **Connection test:** with a fixed clock, it checks that `/api/health` with no injected `today` returns the Asia/Seoul date (`backend/test/health.test.ts`).
- **Screen readers:** added `aria-live="polite"` to the date display.
- **Typing a date:** only one history entry is added during one input.
- **Error path tests:** the server 500 response and a connection failure are checked separately.
- **Browser recheck:** we checked the table of the previous section again with an API connected to the real local DB, and the result is the same. `/api/health`, which gives the "today" of this screen, runs `SELECT 1`, so the first description "does not use a DB query" was wrong and was removed.

We also fixed problems found by reproducing with real key input. jsdom cannot reproduce typing in each part of the input, so unit tests do not catch them.

| Problem                                        | Cause                                                                           | Fix                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Typing `12` after `2026` gives `202612-03-15`  | Without `max`, Chrome accepts the year up to 6 digits                           | `max="9999-12-31"`                            |
| Typing `2026 12 25` gives `2026-02-05`         | When the value is written back to the input, Chrome resets the part being typed | Keep the draft until focus leaves             |
| History entries pile up even for the same date | It also navigates to the same URL                                               | Do not navigate if it equals the current date |

In Chrome, typing `20261225` with real keys goes to `/daily/2026-12-25`, and the history grows by 1. It is the same at 390×844 and 1440×900.

## Second review fixes: 2026-10-31

Of the 5 findings of the independent review, we fixed 4 and recorded 1 as a limit below. The review is at most 2 rounds, so there is no third review.

- **Going back while typing:** going back and forward does not take focus away, so the draft stayed and the next input overwrote the history entry of the date we returned to. We fixed it to end the input on `popstate`.
- **Response order:** compare a request number so that a slow earlier `/api/health` response does not overwrite a new response.
- **Tests:** the `aria-live` test actually moves the date and checks that the same element stays. Added tests for typing after going back and for the response order.
- **Docs:** removed the limit description that the fixes above made obsolete.
- **Browser recheck:** checked in Chrome with real key input. After typing and going back, the input equals the URL, and if you keep editing, the record of the date we returned to stays. Going forward through a date that does not exist also leaves the input equal to the URL. Typing `20261225` goes straight to `/daily/2026-12-25`.

## Limits and follow-up

- If, during one input, you pass through another date and come back to the original date, two history entries of the same date are left. Pressing back once more is enough.
- The calendar popup and the phone date picker cannot be driven by automation, so we did not check them. If focus stays, successive picks may merge into one history entry.
- The allowed date range (a lower limit of 2000-01-01 on the input, future dates allowed) is a value set for now. It needs a user decision, so it was split into [#50](https://github.com/sirloinbh/health-log/issues/50).

- The dependency install (`npm ci --ignore-scripts`) was run by the user directly, following the rule that blocks package installs.
- At install `npm audit` reported 18 findings (moderate 17, high 1). They are unrelated to this change, and vite is handled in `sirloinbh/project-standards#352`.
