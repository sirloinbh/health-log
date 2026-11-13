# #59 Move the backend validation code to zod 4 syntax

- Issue: [#59](https://github.com/sirloinbh/health-log/issues/59)
- Branch: `chore/59-zod4-syntax`

## Purpose

This is step 1 of the central `sirloinbh/project-standards#386`. We move the code first so that this app does not break when the central repository raises `zod` to 4.6.7. The Dependabot alert for the security advisory GHSA-mrhx-c7xc-m3w5 is closed by that sync. This PR alone does not close it.

## Changes: 2026-11-01

- `backend/src/foods.ts` imports from `zod/v4`. The installed 3.25.76 contains this path, so we did not change `package.json` or the lock file.
- Moved `required_error`, `invalid_type_error`, and `errorMap` to `error`.
- Changed `.min()` and `.max()` on strings to `.refine()`. The length check of zod 4 runs even after a type failure when the input has `.length`, so sending an array gives two messages.
- Put `abort: true` on the length checks of brand and category. In zod 3, when a field with a `.transform()` after it failed, the object-level source rule was skipped, but zod 4 runs it anyway and the messages increase.

## Responses that change

We sent the same 1302 inputs to the real routes before the move, with `zod/v4` of 3.25.76, and with 4.6.7, and compared the status code, the response body, and the values passed to the DB. 22 differ, and all are the one case below. The status codes and the stored values stay the same. There was no difference between 3.25.76 and 4.6.7.

| Input                      | Before                                                 | After                                                |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `1e999` in a number field  | `칼로리이(가) 너무 큽니다` (calories too large)        | `칼로리은(는) 숫자로 입력해 주세요` (enter a number) |
| `-1e999` in a number field | `칼로리은(는) 0 이상이어야 합니다` (must be 0 or more) | `칼로리은(는) 숫자로 입력해 주세요` (enter a number) |
| `1e999` in `servingSize`   | `1회 제공량이 너무 큽니다` (serving too large)         | `1회 제공량을 입력해 주세요` (enter the serving)     |
| `-1e999` in `servingSize`  | `1회 제공량은 0보다 커야 합니다` (must be above 0)     | `1회 제공량을 입력해 주세요` (enter the serving)     |

This happens because `z.number()` of zod 4 rejects infinity at the type stage. Then `.superRefine` does not run, so if the same request also breaks a source rule, the source message is not shown either. For example, with `calories: 1e999` and `sourceType: "official"`, the calories, source URL, and checked date messages used to appear together, and now only the calories message appears. It is an input that appears only when you build the JSON body by hand, and the 400 is kept, so we did not fix it.

We do not use `z.record`. For an input whose body has a `constructor` key that is null, a number, or an object, the responses before and after are the same and there is no 500.

## Verification

- `npm run check`: passed (backend 31 of 42 passed and 11 skipped, frontend 97 passed and 2 skipped, 4 skill checks passed). We left `TEST_DATABASE_URL` empty, so the DB integration tests were not run locally and are checked in the PR CI.
- 4.6.7: the type check and the before and after comparison passed with the copy that `knip` installed along with it. The backend tests also passed with no failure in a copy that includes `docs/food-data.md` (the DB integration tests were skipped). The install itself is checked in the CI of the central sync PR.
