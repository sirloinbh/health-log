# #118 Fill processed-food nutrition values from the MFDS database

- Issue: [#118](https://github.com/sirloinbh/health-log/issues/118)
- Branch: `feat/118-mfds-lookup`

## Purpose

The add-food dialog can look a food up by name (and maker) in the MFDS (Ministry of Food and Drug Safety) food nutrition database on the Public Data Portal, pick a match, and get a filled food draft. The person checks the draft and saves it with the normal Save; nothing is saved by the lookup.

## Decisions (also an issue comment)

The user applied for the API and confirmed the key on 2026-11-28. The open choices of the issue were settled by the existing [food data rules](../food-data.md), not by new rules:

- **API calls, not the file download.** The shared Public Data Portal key is already in SSM (`/sirloinbh/shared/data-go-kr-service-key`, the same key study-log reads), development use is approved automatically (10,000 calls a day), and the data updates in real time. The endpoint is `FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03` (the portal page names version 03; version 02 answers "service key not registered").
- **Values are converted to the total content** (`Z10500`), as the rules say for MFDS data, and the total goes at the end of the name (`신라면건면사발 77g`). When the total is missing, equals the basis, or is in another unit than the basis, the draft keeps the basis (100 g or 100 mL). The source unit is kept (`g` or `mL`, #199).
- **Several records:** every match is listed with its maker, group, amount and main values, and the person picks one. Records that are the same product with the same values under different codes show once, as the most recently updated one (the rules' "newest first"). Records with the same name but other values stay separate, so each row shows carbs, protein and fat too.
- **No match:** the screen says so and points to pasting the label table (#35) or entering the values by hand.
- **Source:** `public`, with the MFDS detail page of the food code as the source URL (the page the rules already name) and today (Asia/Seoul) as the verified date.
- **Names stay in Korean** as the database has them; the person can edit them before saving. This is an exception to the English-name rule of #351 (which the seeded foods follow, with the Korean in `search_alias`): the screen cannot fill the alias, and a Korean name is still found by a Korean search. `docs/food-data.md` says so. The brand is the maker without company markers such as `(주)`. The category is left as it was, so the person picks one of the categories already used.
- **No key:** the API answers `{ state: 'off' }` and the screen says the lookup is not set up (the done criterion allows a message instead of hiding it). The portal failing, a refused key, an error code, or an unexpected answer give `{ state: 'unavailable' }` and one log line that never holds the key.
- The lookup is offered only when adding a food, not when editing one.

## Change

- `backend/src/mfds.ts`: `GET /api/foods/mfds?q=&maker=` (an app route in `app.ts`), query validation (name 1–50 characters, maker up to 50), the conversion to a food draft, merging repeated records, and the error states. 8-second timeout, 20 records per search.
- `backend/src/server.ts`, `compose.yaml`, `.env.example`: `FOOD_NTR_SERVICE_KEY`, tagged `@secret @ssm=/sirloinbh/shared/data-go-kr-service-key`, so the deploy reads it from SSM as it does for study-log.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new route.
- `frontend/src/mfds.ts` (answer types, texts, filling the form) and `frontend/src/mfds-lookup.tsx` (the search fields, the match list and the status messages) in `food-dialog.tsx`. Enter in the search fields searches instead of saving the food.
- `docs/food-data.md`: the in-app lookup.

## Tests

- `backend/test/mfds.test.ts`: the request to the portal (endpoint, key, name, maker, page size) and the converted draft from a real answer shape; no maker; no match; no key (portal not called); empty and long search terms (400, portal not called); a 403 refused key, an error code, non-JSON, a missing body and a network failure all give "unavailable" and the key is not in the log; reading `2,117.000`, blanks, dashes, `mL`; brand clean-up; a total equal to the basis, missing, or in another unit; a blank value stays unknown; repeated records show once as the newest.
- `frontend/src/mfds-lookup.test.tsx`: search, pick, the filled fields and the source, nothing saved until Save, then the saved body; Enter searches and does not save; an empty name; "off"; "unavailable" and searching again; a server 400 message; no lookup when editing.

## Verification

- First commit: backend `test/mfds.test.ts` + `test/openapi.test.ts` 13 passed; frontend `src/mfds-lookup.test.tsx` 7 passed, `src/foods.test.tsx` still passing.
- After review round 1: backend `test/mfds.test.ts` 10 passed; frontend `src/mfds-lookup.test.tsx` 9 passed.
- After review round 2: frontend `src/mfds-lookup.test.tsx` 10 passed.
- Live portal call with the key from SSM (value never printed): `신라면` answers 53 matches; `신라면건면` answers 5 records, shown as 3 after merging repeats (two 97 g records differ in fat and carbs, so both stay).
- Browser (local API with the real key and no database, Vite): searching `신라면건면` and picking the first match filled `신라면건면사발 77g`, serving 77, the detail page URL and today's date. Checked at 390×844 and 1440×900: no sideways scroll, the match list scrolls inside the dialog. The food list behind it shows "Server error" only because there was no local database.
- `npm run check` steps, with `TEST_DATABASE_URL` empty (it points at another project's DB here): Prettier on every tracked and new file of this change passed (`prettier --check .` also flags the user's untracked `docs/reviews/` file, which this change does not touch); lint, contract check, typecheck, tests, skill tests and build passed. On the final code: backend 365 tests, 200 passed, 165 skipped (DB integration tests, no local test DB; CI runs them), 0 failed; frontend 907 passed, 3 skipped (after round 2).

## Review round 1 (PR #365)

A separate review agent found no blocking problem. Fixed in the second commit, with tests:

- A draft could fail the save limits: a name over 100 characters now loses the total, then is cut; a maker over 50 characters leaves the brand empty; a total above the API's amount limit keeps the basis.
- A record whose basis amount (`SERVING_SIZE`) cannot be read was treated as per 100 g; it is now left out (`read` still counts it).
- The log redaction now also cuts the key as encoded in an address (`%2B`, `%2F`, `%3D`); the test key has those characters.
- Enter that ends a Korean input composition no longer searches.
- Searches: every press is its own query (a count in the key) and an answer never goes stale, so the same words searched again ask the portal again (the old code could show a cached "cannot be reached"), and window focus does not search again on its own.
- The status region stays in the page (no remount) and says "Searching the MFDS database…" while a search runs.
- `docs/food-data.md` states the Korean-name exception instead of saying the draft follows every rule above.

Not changed: paging past the first 20 records and a per-route limit on the shared 10,000 calls a day (the general API rate limit applies). Neither is needed for one person's use; no issue was filed.

## Review round 2 (PR #365)

A second review checked the round 1 fixes: they hold (the name cut counts code points as `charCount` does, `read` is counted before records are left out, old query keys are dropped after React Query's 5-minute gcTime). No blocking problem. Fixed in the third commit, with tests:

- The search count restarted with each dialog, so a dialog opened again within 5 minutes could show the earlier dialog's cached "cannot be reached" for the same words without asking the portal. The count is now kept for the page. Test: a dialog opened again asks again.
- The composition test now waits and checks that nothing starts, and Safari's form of that Enter (key code 229) is ignored too.

Left as it is: a search that failed with an HTTP error (no data) can still be asked again when the window gets focus back, because the shared `useApiQuery` (a centrally managed file) does not pass `refetchOnWindowFocus`. That asks the same thing again (a 400 stays a 400, a network failure may recover), so it is harmless here.

## Limits

- One page of 20 records per search; the screen says when the database has more and asks for a longer name or the maker.
- Not checked on the server: after the deploy, check that the add-food lookup answers there (the key comes from SSM on deploy).
