# #12 Move to the shared design system

- Issue: [#12](https://github.com/sirloinbh/health-log/issues/12) (central tracking issue sirloinbh/project-standards#126)
- Branch: `feat/12-design-system`

## Purpose

The 8 apps agreed to use the same tokens, components, layout, and PWA settings (central ADR-0007, ADR-0008). We followed "Moving an existing app" in the central `docs/design-system.md` (workout-memo#160 applied it first).

## Changes: 2026-10-26

### Packages

The user installed them directly. They are the packages in the table of central ADR-0007 (pre-approved on 2026-10-22) and react-router, vitest, jsdom, and Testing Library (approved on 2026-10-26). All are pinned versions, 14 days past their publish date, with `--ignore-scripts`.

- dependencies: `@sirloinbh/design-tokens` 1.0.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `radix-ui` 1.7.0, `react-router` 8.4.0, `sonner` 2.0.8, `tailwind-merge` 3.7.0, `tw-animate-css` 1.4.0, `vaul` 1.1.2, `lucide-react` 0.468.0 → 1.52.0
- devDependencies: `tailwindcss` and `@tailwindcss/vite` 4.3.3, `vitest` 5.0.3, `jsdom` 30.1.2, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1
- Two lock files (root and `frontend/`): no package was removed, and the only version that changed is `lucide-react`. Every new entry is from the official registry, has an integrity value, and has no install script. `ioc-scan`: no suspicious entry

### Shared files (centrally managed)

They are as taken from the sync preview with `features.ui` and `features.vitest` of this app turned on in the central repository: the 15 files in `frontend/src/components/ui/` with their tests, `components/layout/`, `lib/utils.ts` and `theme.ts`, `public/theme-init.js`, and `frontend/vitest.config.ts`.

### App code

- **Screens:** replaced the own shell (sidebar and header) with `AppShell` and added page URLs (`/`, `/settings`). The own `style.css` was removed, and the shared tokens and `EmptyState` are used.
- **Entry points:** `app.tsx` (screens), `main.tsx` (rendering, and service worker registration in the production build only), `index.css` (Tailwind, `tw-animate-css`, shared tokens).
- **PWA:** 4 icons (the central `scripts/pwa-icons.mjs`), and the manifest, icons, light and dark `theme-color`, `viewport-fit=cover`, and the flash prevention script in `index.html`.
- **Tests and build:** added a `test` (vitest) script and `src/test/setup.ts` to `frontend`, and the root `npm test` also runs the frontend tests. The production build leaves out test files with `tsconfig.build.json`. A Tailwind plugin in `vite.config.ts`.
- **Removed the screen test in the backend:** `backend/test/app-ui.test.ts` was a temporary test that ran `main.tsx` with a fake React while Vitest was missing. The frontend Vitest test checks the same content (the title, the server status, the error alert, and menu navigation) with a real React, so we removed it. `backend/test/dev-ports.test.ts` had its regular expression fixed to match the vite config now looking at `API_PROXY_TARGET` first.
- **Screen test (`app.test.tsx`):** showing the server date, the server error alert, moving between pages with the menu and showing the current page, and handling an unknown URL.

## Verification

- Prettier, ESLint, `tsc` (all), 40 frontend tests passed, `vite build`, `ioc-scan`
- The backend tests need a DB, so they are checked in CI.
