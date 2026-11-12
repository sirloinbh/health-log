# Setting up the development environment for a new web app: handover document for AI agents

This document is handed as it is to the **AI agent that sets up a new web app project** (Claude Code, Codex, and so on). It is based on the development environment that is actually run and verified in `sirloinbh/workout-memo`. The agent reads it from start to end, and then follows the order of the [11. Bootstrap checklist](#11-bootstrap-checklist).

- Reference date: 2026-10-19 (Asia/Seoul). The version numbers are the values whose real behavior was checked on that day. When you start a new project, check the official support status again, and record the reason if you change one.
- Labels: **[In use]** means installed and used in workout-memo, and **[Recommended, not adopted]** means only reviewed and not installed yet. Do not treat a tool that is not adopted as installed.

## 0. Values to confirm with the user before you start

The placeholders below differ from project to project. If a value is not decided, **ask the user before you start the setup.** Do not decide it yourself.

| Placeholder          | Meaning                                                         | workout-memo example                                                                     |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `<app>`              | Base name of the app and the repository (lowercase, hyphens)    | `workout-memo`                                                                           |
| `<App display name>` | Name used on screens and in docs                                | `FORM · 나의 운동 기록` ("FORM · my workout log")                                        |
| `<owner>`            | GitHub account (personal or organization)                       | `sirloinbh`                                                                              |
| `<db>`               | PostgreSQL DB and user name                                     | `workout`                                                                                |
| `<web-port>`         | Web port for the production-like local run (bound to 127.0.0.1) | `8088` (avoids a clash with common ports such as 8080)                                   |
| `<db-port>`          | DB port reached from the host                                   | `55432` (avoids a clash with the default 5432)                                           |
| `<api-port>`         | Internal API port                                               | `3001`                                                                                   |
| `<timezone>`         | The time zone of the service                                    | `Asia/Seoul`                                                                             |
| `<region>`           | AWS region                                                      | `ap-northeast-2` (Seoul)                                                                 |
| `<budget-usd>`       | Monthly AWS budget alert threshold                              | `20`                                                                                     |
| Users and login      | Number of users, whether login is needed                        | One user, no login, so no public exposure                                                |
| Domain rules         | Core rules such as dates, units, and unknown values             | Date `YYYY-MM-DD`, weight is total weight in kg, a value that is not confirmed is NULL   |
| GitHub account split | Whether work and personal accounts are mixed                    | The default `gh` is the work account, and this project uses the personal account wrapper |

## 1. Absolute rules (limits on agent behavior)

Copy them as they are into the `AGENTS.md` of the new project.

1. **Install or remove npm packages only after the user reconfirms.** The 2025-2026 npm supply chain attacks (the Shai-Hulud family) steal tokens through `postinstall` hooks. This covers `npm install/i/add/uninstall/update/ci`, `npx <package>`, `pnpm/yarn/bun install`, and `corepack enable/prepare`. If an install is needed, follow this order.
   - Show the user the package list with the publisher, the latest release, and the GitHub repository, and recommend a check on socket.dev, Snyk Advisor, or deps.dev.
   - Run it when the user says clearly "I know the risk, go ahead". Suggest `--ignore-scripts` first.
   - Only a package whose install script the build really needs (for example `esbuild`) goes in `allowScripts` in `package.json`.
   - Commands that do not install anything, such as `npm run <script>`, `npm ls`, and `npm view`, are allowed.
2. **After you open a PR, go through automated code review at most 2 times, and when every required CI check on the final head passes, the agent merges without asking.** Apply the review findings in extra commits, and take a second review once after the first fixes. After the second fix commit, do no more reviews, and if there is nothing to fix, go straight to the CI check. Split a change that is too large to fix in this PR into a new issue card. Both the main agent and a local worker run `pr merge <url> --merge --match-head-commit <the head SHA you checked>` (a merge commit) with the project wrapper, and check that the linked issue (`Closes #N`) is closed. Merge stacked PRs in order. After the earlier PR is merged, merge `origin/main` into the next branch to resolve conflicts, run the related tests again, push normally, and merge after CI passes. Do not merge while a check fails or is running, do not bypass branch protection with `--admin` or the like, do not approve your own PR instead of a review, do not push or commit to `main` directly, and do not force push. In a project where a `main` merge runs a deploy, write that in the docs and check the deploy result after the merge.
3. **Do not put secrets in the repository, docs, PRs, or logs.** This covers `.env`, tokens, real backups, and Terraform state. Commit only `.env.example`.
4. **Do not overwrite user changes.** Do not use `git add -A`; stage files by name. Check the target before you revert or delete.
5. **Do not report a check you did not run as passed.** Record separately the DB tests that were skipped, the browser checks that were not run, and what was not deployed.
6. **If a requirement is missing, ask.** For a rule that must be decided before implementation (how to aggregate, a policy, the scope), confirm it with the user together with a recommendation and record it in the issue.

## 2. Language and document rules

- User conversation, screen text, and documents (README, docs, issues, PRs) are written in **English** (the user set this on 2026-11-12; the earlier version of this document said Korean). Code identifiers, commit title prefixes (`feat:` and so on), and code comments are English. Screen text and validation messages that the user sees are covered by `sirloinbh/project-standards#457`.
- Set a validation error message that the user sees explicitly. Give the message, as in `.min(1, '…')`, so that the default English Zod message ("Array must contain…") is not shown on the screen as it is.
- Dates are `YYYY-MM-DD`, and the service time zone is `<timezone>`. The "today" of the server is calculated in the service time zone, not the server time zone.
- Where documents go:
  - `docs/changes/<issue number>-<slug>.md`: the change record per issue. Write the purpose, the changes, the commands actually run with pass/fail/skip, and the limits.
  - `docs/daily/YYYY-MM-DD.md`: the summary of a work day. Accumulate by date and add it to the list in `docs/daily/README.md`.
  - `docs/next-steps/README.md`: the latest priorities, blockers, and next actions. Update it every day.

## 3. Tech stack

### 3.1 [In use] Versions and roles

| Area            | Choice                                              | Version (pinned or range)                                  | Role                                                     |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Runtime         | Node.js / npm                                       | `24.21.0` / `11.19.0` (pinned exactly)                     | Same in development, CI, and Docker                      |
| Package layout  | npm workspaces                                      | Root + `frontend`, `backend`                               | One root lock file + lock files for the sub repositories |
| Frontend        | React, React DOM                                    | `^19.1.0`                                                  | SPA                                                      |
|                 | Vite                                                | `^6.3.5`                                                   | Dev server and build, `/api` proxy                       |
|                 | TypeScript                                          | `^5.8.3`                                                   | `strict`                                                 |
|                 | lucide-react                                        | `^0.468.0`                                                 | Icons                                                    |
| Backend         | Express                                             | `^5.1.0`                                                   | REST API                                                 |
|                 | pg (node-postgres)                                  | `^8.16.0`                                                  | SQL written by hand, no ORM                              |
|                 | Zod                                                 | `^3.25.0`                                                  | Server input validation                                  |
|                 | tsx                                                 | `^4.19.0`                                                  | Dev run (`watch`) and test run                           |
| DB              | PostgreSQL                                          | `17` (`postgres:17-alpine`)                                | Single DB                                                |
| Web server      | nginx                                               | `1.27-alpine`                                              | Static files + `/api` reverse proxy                      |
| Code quality    | ESLint / typescript-eslint / react-hooks / Prettier | `10.12.0` / `8.71.2` / `7.1.1` / `3.9.10` (pinned exactly) | Warnings also fail                                       |
|                 | `@eslint/js`, `eslint-config-prettier`, `globals`   | `10.0.1`, `10.1.8`, `16.5.0`                               |                                                          |
| Dev convenience | concurrently                                        | `^9.2.0`                                                   | Run API and web together                                 |
| Tests           | `node:test` + `tsx --test`                          | Built into Node                                            | Unit, DB integration, UI (chapter 6 below)               |
| Containers      | Docker Compose                                      | —                                                          | 3 services: db, api, web                                 |
| CI              | GitHub Actions                                      | —                                                          | All checks + DB integration + Docker build               |
| Infrastructure  | Terraform / AWS provider                            | `>= 1.6.0` / `~> 5.0`                                      | ECR and budget alert (deploy not connected)              |

### 3.2 [Recommended, not adopted] Candidates to adopt when needed

| Area         | Candidate                                 | When to adopt                                                                                         |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Routing      | React Router                              | When there are more than 4 or 5 screens and URL sharing and the back button are needed                |
| Server state | TanStack Query                            | When the code for fetching, caching, and refreshing after a save starts to repeat                     |
| Forms        | React Hook Form + Zod                     | When array input and per-item errors get complex                                                      |
| UI           | Tailwind CSS + shadcn/ui                  | When shared components grow. Move the existing design tokens first                                    |
| Charts       | Recharts                                  | When hand-drawn SVG charts are not enough                                                             |
| Tests        | Vitest, React Testing Library, Playwright | When automatic browser regression is needed. Do not replace the existing `node:test` without a reason |
| API contract | OpenAPI                                   | When external clients appear                                                                          |
| ORM          | Prisma                                    | Only when the user asks to switch to an ORM. Do not split the migration source in two                 |

If you want to use the candidates above in a new project from the start, adopt them after you get the user confirmation as rule 1 of chapter 1 says. When you adopt one, keep the run commands, CI, and docs consistent in the same PR.

## 4. Repository layout and splitting repositories

### 4.1 Umbrella monorepo + sub repositories for deploy

- All source is developed in **one umbrella monorepo `<owner>/<app>`.** Issues, branches, PRs, and reviews all happen here.
- The 4 repositories per area are synced with `git subtree split` **only for deploy and sharing.** During everyday PR work, do not push to a sub repository or to `main` directly.

| Prefix folder     | Sub repository (private)            | Content                                       |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| `frontend/`       | `<owner>/<app>-frontend`            | React app, Dockerfile, nginx.conf, its own CI |
| `backend/`        | `<owner>/<app>-backend`             | Express API, Dockerfile, its own CI           |
| `database/`       | `<owner>/<app>-db`                  | SQL migrations, README                        |
| `infrastructure/` | `<owner>/shared-aws-infrastructure` | Terraform shared by several apps, its own CI  |

- First creation: `scripts/create-repositories.ps1 -Owner <owner>`. It creates 5 repositories, splits each prefix folder into an `export/<part>` branch, and pushes it to `main` of the sub repository.
- Sync: `scripts/push-repositories.ps1`. Run it **only when the user asks for a sync** (it also pushes the umbrella `main`).
- If someone fixed something directly in a sub repository, first bring it in with `git subtree pull --prefix=<part> <url> main --squash`.
- So that a sub repository builds on its own, `frontend/` and `backend/` each keep their own `package-lock.json`, `.github/workflows/ci.yml`, `.gitignore`, and `.dockerignore`.

### 4.2 Directory layout

```text
<app>/
├─ AGENTS.md                 # Shared AI instructions (Codex baseline, Claude also reads it)
├─ CLAUDE.md                 # [Recommended] "Follow AGENTS.md" + Claude-only differences
├─ README.md
├─ package.json              # workspaces, shared scripts, lint and format tools
├─ package-lock.json
├─ .nvmrc / .node-version    # 24.21.0
├─ .npmrc  .editorconfig  .gitattributes  .gitignore
├─ .prettierrc.json  .prettierignore  eslint.config.mjs
├─ .env.example              # Only an example without secrets
├─ compose.yaml
├─ .github/workflows/ci.yml  # Integrated CI
├─ frontend/  backend/  database/  infrastructure/
├─ scripts/                  # Scripts for creating and syncing repositories, backup, and checks
├─ skills/<app>-*/SKILL.md   # Source of the AI work steps
├─ .claude/skills/           # Copy for Claude Code (npm run skills:sync)
└─ docs/  changes/  daily/  next-steps/
```

- `.local/` is for local tools, temporary worktrees, and logs. Exclude it from Git and Prettier.
- When features grow, do not keep all screens in the single `frontend/src/main.tsx`; split them into modules per feature (`routines.tsx`, `body.tsx`, and so on). In workout-memo `main.tsx` grew large and concurrent PRs conflicted often.

## 5. Core settings files

What follows is the real content used in workout-memo. Only the names and ports are replaced with placeholders.

### 5.1 Runtime, editor, and line endings

`.nvmrc`, `.node-version`

```text
24.21.0
```

`.npmrc`: block installs with an engine mismatch, and save dependency versions exactly.

```ini
engine-strict=true
save-exact=true
```

`.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.gitattributes`: LF in the repository, CRLF only for PowerShell scripts.

```text
* text=auto eol=lf
*.ps1 text eol=crlf
```

### 5.2 Root `package.json`

```json
{
  "name": "<app>",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -k \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "build": "npm run build -w frontend && npm run build -w backend",
    "test": "npm run test -w backend",
    "test:skills": "node --test scripts/test/claude-skills.test.mjs",
    "skills:sync": "node scripts/claude-skills.mjs sync",
    "skills:check": "node scripts/claude-skills.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:skills && npm run build",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "npm run typecheck --workspaces"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "concurrently": "^9.2.0",
    "eslint": "10.12.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "16.5.0",
    "prettier": "3.9.10",
    "typescript-eslint": "8.71.2"
  },
  "allowScripts": { "esbuild@0.28.2": true, "esbuild@0.25.12": true },
  "engines": { "node": "24.21.0", "npm": "11.19.0" },
  "packageManager": "npm@11.19.0"
}
```

The single `npm run check` runs format → lint → types → tests → build. **Always run it before a commit and before you create or update a PR.** If you have a local AI worker, add `test:agents` to `check` (see workout-memo).

### 5.3 Format and lint

`.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.prettierignore`

```text
node_modules/
**/dist/
.local/
.git/
.env
package-lock.json
**/package-lock.json
infrastructure/.terraform/
**/*.tfstate*
backups/
.bkit/
.playwright-mcp/
```

`.bkit/` and `.playwright-mcp/` are local outputs made by Claude Code plugins and browser tools. If Prettier checks these folders, `npm run check` fails.

`eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', 'infrastructure/.terraform/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
  prettier,
);
```

Code rules: write React components and types in PascalCase, and variables and functions in camelCase. Prefix an argument that you must declare but do not use (such as in an Express error middleware) with `_`. At an error boundary, take the value as `unknown` and check only the fields you need.

### 5.4 `.gitignore`

```text
node_modules/
dist/
.env
*.log
.terraform/
*.tfstate*
*.tfplan
backups/
.local/
.bkit/
.playwright-mcp/
```

### 5.5 TypeScript

`frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`backend/tsconfig.json` (build) and `backend/tsconfig.check.json` (type check including tests)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": ["src", "test"] }
```

### 5.6 Workspace `package.json` scripts

- frontend: `"dev": "vite --host 127.0.0.1"`, `"build": "tsc --noEmit && vite build"`, `"typecheck": "tsc --noEmit"`
- backend: `"dev": "tsx watch --env-file-if-exists=../.env src/server.ts"`, `"start": "node dist/server.js"`, `"build": "tsc"`, `"test": "tsx --test test/*.test.ts"`, `"typecheck": "tsc -p tsconfig.check.json"`
- Both workspaces have `engines`, `packageManager`, and `"allowScripts": { "esbuild": true }`.

`frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:<api-port>' } } });
```

### 5.7 Docker Compose and images

`compose.yaml`: bind every port only to `127.0.0.1` (this protects an app without login).

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-<db>}
      POSTGRES_USER: ${POSTGRES_USER:-<db>}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Copy .env.example to .env and set password}
      TZ: <timezone>
    ports: ['127.0.0.1:<db-port>:5432']
    volumes:
      - <app>-data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB']
      interval: 5s
      timeout: 5s
      retries: 15
    restart: unless-stopped
  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-<db>}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-<db>}
      PORT: <api-port>
      TZ: <timezone>
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  web:
    build: ./frontend
    ports: ['127.0.0.1:<web-port>:80']
    depends_on: [api]
    restart: unless-stopped
volumes:
  <app>-data:
```

`.env.example`

```ini
POSTGRES_DB=<db>
POSTGRES_USER=<db>
POSTGRES_PASSWORD=change-this-local-password
DATABASE_URL=postgres://<db>:change-this-local-password@localhost:<db-port>/<db>
PORT=<api-port>
```

`backend/Dockerfile`: split build and run, and run the run stage as the non-root (`node`) user.

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE <api-port>
CMD ["node", "dist/server.js"]
```

`frontend/Dockerfile` + `frontend/nginx.conf`

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location /api/ { proxy_pass http://api:<api-port>; proxy_set_header Host $host; }
  location / { try_files $uri $uri/ /index.html; }
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
}
```

## 6. Backend and DB implementation rules

### 6.1 API structure

- `createApp(pool)` builds and returns the Express app, and `server.ts` only calls `listen`. That way a test can start the app with a real DB pool or a fake pool. To fix "today" in a test, give it an injection point such as `createApp(pool, { today })`.
- `app.disable('x-powered-by')`, `express.json({ limit: '256kb' })`. Only a route for large uploads (for example restoring a backup) raises the limit on that route.
- Validate every input with Zod before it reaches the DB. The shared error middleware turns `ZodError` into 400 and a unique constraint violation (23505) into 409, with a message for the user.
- Check the status with `GET /api/health`.
- Receive the pg `date` type (OID 1082) as a string: `types.setTypeParser(1082, (v) => v)`. This prevents the time zone from shifting when it is turned into a JS `Date`.
- A change that writes several rows (a log + its sets, and so on) is wrapped in `BEGIN … COMMIT` on one client, does `ROLLBACK` on an error, and calls `release()` in `finally`.
- Every query uses parameters (`$1`). If you must build a table or column name as a string, use constants only.

### 6.2 Save safety patterns (apply to the apps that need them)

- **Idempotent retry:** the client adds a UUID `Idempotency-Key` to POST and PUT.
  - The server serializes the same key inside a transaction with `pg_advisory_xact_lock(hashtextextended(key))`.
  - It stores the request fingerprint (the method, the target, and the SHA-256 of the normalized body) and the response, and returns the same response for the same request.
  - Using the same key with different content is rejected with 409.
- **Concurrent edit conflict:** keep a `version` on the row, and compare the version after `SELECT … FOR UPDATE`. If it differs, return 409, and if it is the same, update with `version+1`.
- **Browser draft:** keep what is being typed in `localStorage` (for example for 7 days) and show the save state. Wrap every storage access in `try/catch` (private mode, quota exceeded).

### 6.3 DB and migrations

- PostgreSQL 17. Keep the migration source in **one place only**, `database/migrations/NNN_<description>.sql`.
- Number them with a 3-digit sequence. **Reserve the number when you start the work, so that parallel branches do not use the same number.** In workout-memo, PRs opened at the same time once both used `003`.
- Write every migration so it is safe to run again: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and seed data as `INSERT … ON CONFLICT DO NOTHING/UPDATE`.
- Keep the meaning of existing data. For example, give a new `completed` column the default `true`, so that the judgement of past records does not change.
- How it is applied (the central standard runner from #53, the [DB document](../database/README.md)):
  - Empty volume: Compose runs every file in `/docker-entrypoint-initdb.d` in name order. Then `npm run db:migrate` applies the same files again and records them.
  - CI: apply every file once in name order with `psql -v ON_ERROR_STOP=1 -f`, then run `npm run db:migrate`.
  - **Existing DB: `npm run db:migrate` runs only the files that are not in `schema_migrations`.** A server deploy uses the same runner as `node dist/migrate.js`.
  - Also when you apply with psql directly, **do not pipe through PowerShell**, as in `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII when it pipes to an external program, so Korean turns into `?`. In workout-memo we reproduced the `'기타'` ("other") brand being stored twice as `'??'`. If you must pipe, first set `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`.
- Write Korean literals in SQL (CHECK values and so on) with a Unicode escape such as `U&'\AC00\C2B4'` where possible. It is safe whatever path applies it.
- State the unit and NULL rules in the schema. Leave an unconfirmed value as NULL and keep it apart from 0. Set the numeric precision with `NUMERIC(p,s)`.
- Backup: `scripts/backup.ps1` saves `pg_dump --no-owner --no-acl` as a UTF-8 file (no BOM). Exclude `backups/` from Git, keep a copy in a safe place off the PC, and check a restore from time to time.

## 7. Tests and CI

### 7.1 Test principles

- Put the tests in the same commit as the implementation or fix. For a bug fix, add a regression test that you confirmed **fails before the fix and passes after it**.
- Do not repeat the internal implementation; verify what the user can see and the domain rules.
- Do not make a failing test pass by skipping it, deleting it, or weakening its judgement.

### 7.2 Kinds of tests [In use]

| Kind           | Tool and method                                                                                                                                          | Example files                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Unit           | `node:test` + `assert/strict`, `tsx --test`                                                                                                              | `backend/test/*.test.ts`          |
| DB integration | A real PostgreSQL. **Skipped** when `TEST_DATABASE_URL` is not set. A skipped test does not count as a pass                                              | `*.integration.test.ts`           |
| UI             | Load the component with `vm.runInNewContext` + `ts.transpileModule`, and check the render result with a fake React, `fetch`, `localStorage`, and clock   | `*-ui.test.ts`                    |
| Browser        | A real dev server + Playwright (MCP) to check mobile 390px and PC 1440px. This is a manual check before a PR, not a replacement for automatic regression | Record the result in docs/changes |

- Run the DB integration tests **only on a dedicated test DB, not on the user DB**. So that parallel work does not interfere, use a DB per branch (issue) or a schema per test.
- A test that depends on a date injects "today" or fixes it with a fake `Date`.

### 7.3 Integrated CI (`.github/workflows/ci.yml`)

```yaml
name: Verify application
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: <db>, POSTGRES_PASSWORD: test, POSTGRES_DB: <db> }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.21.0', cache: npm }
      - run: npm install --global npm@11.19.0
      - run: npm ci
      - run: |
          for migration in database/migrations/*.sql; do
            psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || exit 1
          done
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }
      - run: npm run check
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t <app>-frontend:ci ./frontend
      - run: docker build -t <app>-backend:ci ./backend
```

The `npm ci` inside a CI runner installs from the lock file in an isolated GitHub environment, so it is separate from the rule that forbids local installs. The CI for the sub repositories is as follows.

- `frontend/.github/workflows/ci.yml`: `npm ci` → `npm run build` → `docker build`
- `backend/.github/workflows/ci.yml`: `npm ci` → `npm run build` → `npm test` (unit tests without a DB, integration tests are skipped) → `docker build`
- `infrastructure/.github/workflows/ci.yml`: `terraform init -backend=false && terraform validate`

## 8. Design system

workout-memo has a calm green "workout notebook" tone. Unless told otherwise, a new project also starts from the tokens and components below. In a new project, define the values as **CSS variables (`:root`)** from the start. workout-memo wrote colors directly, which made them hard to share later.

### 8.1 Tokens

| Token                 | Value                                                           | Use                                        |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| Font                  | `'DM Sans', 'Noto Sans KR', sans-serif` (Google Fonts)          | DM Sans for Latin, Noto Sans KR for Korean |
| Base font size        | `14px`, `font-synthesis: none`                                  |                                            |
| Body color            | `#25372f`                                                       | Text                                       |
| Page background       | `#f7f8f5`                                                       |                                            |
| Sidebar background    | `#fcfcfa`, divider `#e5e8e1`                                    |                                            |
| Primary color         | `#294432` background / `#f3f7ec` text                           | Main button                                |
| Accent (focus)        | `#a1bd56`                                                       | `:focus-visible` 3px outline, 3px offset   |
| Card                  | Background `#fff`, border `#e3e7dd`, radius `9px`               |                                            |
| Modal                 | Background `#fcfdf9`, radius `12px`, shadow `0 20px 80px #0003` |                                            |
| Secondary background  | `#f4f6ef`, `#eaf0df`                                            | Tabs and notice boxes                      |
| Muted text            | `#9aa48f`                                                       | Secondary description                      |
| Warning background    | `#fff0e9`                                                       | Errors                                     |
| Button radius         | `6px`, padding `12px 17px`, text `12px/500`                     |                                            |
| Theme color (browser) | `<meta name="theme-color" content="#182b26">`                   |                                            |

### 8.2 Layout and components

- **Shell:** a fixed left sidebar (`aside`, width 234px, logo, navigation, and profile) and the content on the right. Put a breadcrumb at the top ("My workspace › screen").
- **Page header:** a small uppercase phrase (eyebrow) + a large title + a description + the main button on the right.
- **Period bar:** tabs (1 day, 1 week, 1 month, 4 weeks, 12 weeks) + previous/next + a date input.
- **Stat card:** a label, a large number + unit, and a secondary description below.
- **Card and list row:** a date tile, a title, a summary, and the value, edit, and delete on the right.
- **Three buttons:** `primary` (main action), `subtle-button` (secondary), and `text-button` (weak action). Use lucide-react for icons, and always give a button with only an icon an `aria-label`.
- **Modal form:** `form-grid` with 2 columns, and the label wraps the input (`<label>text<input/></label>`). Input guidance is `form-hint`.
- **Status display:** the save state is `role="status"`, an error is `role="alert"`, a toggle is `aria-pressed`, and when empty show an empty state notice (a title + a description + an action button).
- **Charts:** draw them by hand with SVG and CSS with no library, and give them `role="img"` and an `aria-label` that summarizes the values. Do not connect a day with no value as if it were 0.

### 8.3 Responsive and verification

- Breakpoints: `min-width: 1500px` (wide screens), `max-width: 1100px` (tablet), and `max-width: 760px` (mobile).
- A PR that changes the screen is checked in a real browser at **mobile 390×844 and PC 1440×900**. Check that there is no horizontal scroll (`scrollWidth > innerWidth`) and record the result in docs/changes.
- Fix problems found in the browser check (a double-click toggle, a screen that does not refresh after saving, and so on) together with a regression test.

## 9. Git strategy

- **GitHub Flow:** keep `main` always deployable. Every change starts from an issue.
- **Order:** register a GitHub issue → a branch named with the issue number → implementation, tests, and the `docs/changes` record in the same commit → `npm run check` → PR → **automated code review (at most 2 rounds)** and fix commits (a large change goes to a new issue) → CI check → **the agent merges after CI passes** (a merge commit, `--match-head-commit`).
- **Issue:** write the purpose, the scope, the done criteria (checkboxes), how to verify, and the boundaries. Leave a rule that must be decided as a "decision before implementation", and when the user decides, record the confirmed rule as an issue comment. Make the body a UTF-8 file and register it with `gh issue create --body-file`.
- **Branch:** `<type>/<issue number>-<slug>`. The type is `feat`, `fix`, `docs`, or `chore` (for example `feat/12-workout-editor`). If a branch for the same issue already exists, keep using it.
- **Commit title:** `feat: <English summary> (#12)`. Write the reason in the body. For AI co-authoring, add a `Co-Authored-By:` line.
- **PR:** the target is `main`. Put the following in the body.
  - The summary, the main changes, the actual check commands with pass/fail/skip
  - The check results for a screen change, the judgements and the things that need confirmation
  - `Closes #N` (`Refs #N` for a partial implementation)

  Leave it as a draft if verification is left. If a PR for the same branch exists, update it and do not create a new one.

- **Review:** after you open the PR, go through a read-only automated code review, separate from the context that wrote it, at most 2 times. Apply the findings in extra commits, and do no more reviews after the second fix commit. Split a feature outside the scope, a design change, a change across several modules, and a large change that needs separate verification into a new issue card. Record the result of each round in a PR comment and in the docs.
- **Merge:** after the required CI on the final head passes, the agent merges with a merge commit (`--merge --match-head-commit <head SHA>`) and checks that the linked issue is closed. If several PRs change the same file, or the PRs are stacked, merge them in order, and merge `origin/main` into the later PR to resolve the conflicts, check with tests that both features survive, then push normally (no force) and merge after CI passes. A `main` merge in this project does not run a deploy now.
- **Parallel work:** use a separate `git worktree` per issue. Avoid a shared stash, and split migration numbers and test DBs per issue.

## 10. AI instruction system

### 10.1 What each file does

| File                                                       | Role                                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                | Shared instructions for all agents. Work steps, project baseline (ports, time zone, units), verification commands, prohibited actions, account rules |
| `CLAUDE.md` [Recommended]                                  | The file Claude Code reads automatically. Write "this project follows `AGENTS.md`" + only the Claude-specific differences, briefly                   |
| `skills/<app>-implementation/SKILL.md`                     | Issue → branch → implementation and docs → tests → PR → automated review (at most 2 rounds) → the agent merges after CI passes                       |
| `skills/<app>-testing/SKILL.md`                            | The standard for writing, running, and recording tests                                                                                               |
| `skills/<app>-foundation/SKILL.md` + `references/stack.md` | The development foundation, technology recommendations, and the order to apply them                                                                  |
| `.claude/skills/`                                          | A copy of `skills/` for Claude Code. Edit only the source and refresh with `npm run skills:sync`, and `npm run check` fails on a mismatch            |

- The skill source is the one `skills/` folder in the repository. Codex installs it in `skills/` in the Codex home, and Claude Code reads `.claude/skills/`.
- A skill file has YAML front matter (`name`, `description`). After a change, check it with `quick_validate.py` of skill-creator (`PYTHONUTF8=1` on Windows).
- Do not use relative links by repository path in a skill body. This is so that the links do not break when the copy is in a different place.

### 10.2 What to put in `AGENTS.md` (template)

```markdown
# <App display name> project instructions

## Implementation work steps

For a request to add a feature, fix, refactor, change settings, docs, or skills, follow skills/<app>-implementation/SKILL.md.

1. Register an issue in <owner>/<app> (reuse an existing issue the user named).
2. Create a `<type>/<issue number>-<slug>` branch.
3. Write the implementation and the tests together, and include a docs/changes/<issue number>-<slug>.md record in each commit.
4. Run `npm run check` before a commit and before you create or update a PR, and record the result in the docs and the PR.
5. **After you open the PR, go through automated code review at most 2 times. Apply the findings in extra commits, and split a large change into a new issue card.**
6. **When every required CI check on the final head passes, the agent merges the PR with a merge commit (`--match-head-commit`; no failing or running checks, no `--admin`, no force push).**
   Answering questions, recommendations, and read-only investigation do not create an issue or a branch.

## Project baseline

- Technology: React + Vite + TypeScript, Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.
- Web port <web-port>, host DB port <db-port> (bound to 127.0.0.1). Do not change them without a user request.
- Date YYYY-MM-DD, time zone <timezone>. <Domain unit and NULL rules>.
- Validate input and make judgements on the server too. A change of several rows is a transaction.
- Do not commit or record .env, tokens, real backups, or Terraform state.
- Do not overwrite user changes, and stage only the files you need.
- Install or remove npm packages only after the user reconfirms, --ignore-scripts first.
- Sub repository sync (scripts/push-repositories.ps1) and AWS deploys only on a separate request.

## Verification commands

- All: `npm run check`. DB integration: set `TEST_DATABASE_URL` of a dedicated DB and run `npm test` (skipped when not set = not verified).
- Infrastructure: `terraform validate`. Docs and skills only: format, links, and the skill validator.

## Docs

- docs/changes (per issue), docs/daily (summary of a work day), docs/next-steps (latest next work).
```

### 10.3 Account separation (a PC that uses work and personal accounts together)

- Leave the default `gh` as it is and use a project-specific wrapper (`scripts/gh-project.ps1`). The wrapper clears an inherited `GH_TOKEN`/`GITHUB_TOKEN` and applies the token received from `gh auth token --user <owner>` only to that call.
- Set the wrapper as the **local** credential helper of this repository for Git push. Do not change the global helper.
- Before remote work, check that `<wrapper> api user --jq .login` is `<owner>`. Do not work around it with another account.
- Run the wrapper inside a git repository. It fails when run outside a repository.
- Choose the personal Codex profile with the `CODEX_HOME` environment variable. For the detailed implementation, see `docs/project-github-auth.md` of workout-memo.

### 10.4 [Optional] Local AI worker

workout-memo runs a worker (`scripts/agents.ps1`) that takes an issue that was decided and put in a queue, and handles tests → implementation → independent review → checks → PR automatically on the PC. A new project does not need it from the start. What to keep in mind when you adopt it:

- Fix the model per role (for example a higher model for planning, debugging, and high-risk review, and a standard model for tests, implementation, and review). Do not switch to another model on your own.
- Test the worktree per issue, the locks, and the state transitions (`npm run test:agents`).
- **Inside a sandbox the Vite/esbuild build can fail on a permission problem reading the parent folder.** Run the final `npm run check` on the host.
- Details: `docs/local-agent-workflow.md` of workout-memo.

## 11. Bootstrap checklist

Pass the "Check" at the end of each step before you go to the next step.

1. **Fix the values:** get the placeholders of chapter 0 from the user. Check: the table is all filled in.
2. **Account and remote:** confirm the GitHub account to use, and prepare the wrapper in 10.3 if needed. Check: `api user --jq .login` = `<owner>`.
3. **Runtime:** choose Node 24.21.0 / npm 11.19.0 (with a user tool such as nvm or Volta; do not change the system Node on your own). Check: `node -v`, `npm -v`.
4. **Skeleton files:** create the layout of 4.2, the settings files of chapter 5, `.env.example`, `compose.yaml`, the Dockerfiles, nginx.conf, and `database/migrations/001_initial.sql` (a minimal table).
5. **Install dependencies (user confirmation required):** show the package list of 3.1, get approval with the procedure of rule 1 in chapter 1, and then install. Check: `package-lock.json` and the lock file of each workspace were created.
6. **Minimal feature:** create `createApp(pool)`, `GET /api/health`, one baseline screen, one unit test, one DB integration test, and one UI test.
7. **Local verification:**
   - Start the DB with `docker compose up -d db`.
   - Create a dedicated test DB and apply all migrations. Apply once with `psql -f` as CI does, then record with `npm run db:migrate` (with `DATABASE_URL` pointing to that DB).
   - Set `TEST_DATABASE_URL` and run `npm run check`.

   Check: exit 0, and the DB tests were not skipped.

8. **Run the containers:** create `.env` and run `docker compose up --build -d`. Check: the screen at `http://localhost:<web-port>` and the `/api/health` response are normal.
9. **AI instructions:** create `AGENTS.md`, `CLAUDE.md`, the 3 skills, and the `.claude/skills` sync script and its test of chapter 10. Check: `npm run check` includes `test:skills` and it passes.
10. **Docs:** create the README (run, verification, repository layout), `docs/development-baseline.md`, `docs/changes/`, `docs/daily/`, and `docs/next-steps/`.
11. **Create repositories:** after user approval, create the umbrella repository and the 4 sub repositories as private with `scripts/create-repositories.ps1 -Owner <owner>`. Check: the CI of each repository passes.
12. **Infrastructure draft:** put the Terraform of chapter 12 in `infrastructure/` and run `terraform init -backend=false && terraform validate`. Do a real `apply` only when the user asks for a deploy.
13. **GitHub Flow from the first issue:** from here on, make every change with the steps of chapter 9.

## 12. AWS infrastructure

### 12.1 [In use] Shared Terraform draft (`infrastructure/`)

- Region `<region>` (default `ap-northeast-2`) and the `project` variable (default `shared-apps`) are shared by several apps.
- **ECR:** frontend and backend repositories per app (`for_each`), immutable tags (IMMUTABLE), image scan on push, AES256 encryption, and a lifecycle policy that keeps only the latest 10 images.
- **AWS Budgets:** `<budget-usd>` USD per month, with an email when actual spend passes 80%. A budget alert **does not stop spending.**
- Run: `terraform init` → `terraform plan -var='budget_email=…'` → `terraform apply …`. **Do not put the state file in Git** (it may contain sensitive data).
- To add another app, add its name to the ECR `for_each` list.

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}
provider "aws" { region = var.region }
```

### 12.2 Deploy alternatives (not connected yet, the cost is an estimate from the official Seoul region prices of 2026-10-15)

| Alternative                              | Setup                                                          | Monthly cost estimate (before tax)                                           | Note                                                                            |
| ---------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Shared server (several personal apps) | One Lightsail with Docker Compose + PostgreSQL, ECR, snapshots | 2 GB: about $13.50 / 4 GB: about $25.50 (the whole server)                   | 0.5-1 GB leaves too little room. Split the DB or schema and permissions per app |
| 2. App server + managed DB               | EC2/Lightsail + RDS PostgreSQL                                 | The user initial budget of 30,000-60,000 won or more (not a confirmed quote) | Less backup and maintenance work                                                |
| 3. Managed scale-up                      | ECS Fargate + ECR + RDS + ALB                                  | High fixed cost                                                              | When traffic and availability are needed                                        |
| Static frontend only                     | Amplify and the like                                           | Calculated separately                                                        | The API and DB are needed separately                                            |

- **Do not expose an app with no login to the public internet as it is.** Design a VPN, private access, or authentication first. This app allows only the IPs we name ([Protecting external access](access-protection.md)).
- What to prepare together when you deploy: HTTPS, remote state (S3 + locking), a GitHub OIDC deploy role (no long-lived keys), image version tags, a health check, the CloudWatch log retention period, backup and restore steps, and how to go back to the previous image.
- Detailed cost calculation: `docs/shared-hosting-costs.md` of workout-memo.

## 13. Pitfalls confirmed in this project

| Symptom                                                                  | Cause                                                              | What to do                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Korean is stored in the DB as `?` and a rerun creates duplicate rows     | The PowerShell 5.1 pipe sends ASCII                                | Run the mounted file with `psql -f`, or set `$OutputEncoding` to UTF-8, and use the `U&` escape in SQL     |
| Only the build of `npm run check` fails in an AI sandbox                 | Vite/esbuild cannot read the parent folder (shared `node_modules`) | Run the final check on the host and record the result                                                      |
| The Prettier check suddenly fails                                        | Tool outputs such as `.bkit/` and `.playwright-mcp/`               | Add them to `.gitignore` and `.prettierignore`                                                             |
| Parallel PRs use the same migration number                               | Each branch picks the next number on its own                       | Reserve the number when you start                                                                          |
| Several PRs keep conflicting in the same big file (`main.tsx`, `app.ts`) | Screens and routes are gathered in one file                        | Split into modules per feature, and after merging `main` into the later PR, check both features with tests |
| A double click on a toggle button reverses the state                     | The two clicks are handled in different renders                    | Ignore the opposite action within a short time + a regression test                                         |
| Data saved on another screen does not show when it comes back            | The screen does not fetch again when it is entered                 | Fetch again when the screen changes                                                                        |
| A server validation error shows as the English original                  | The default Zod message                                            | Give a message for the validation the user sees                                                            |
| After a backup "replace all", a retry answers a deleted id as "saved"    | The idempotent retry key is still there                            | On a replace restore, also reset the retry keys in the same transaction                                    |
| A DB test looked "passed" but did not actually run                       | It is skipped when `TEST_DATABASE_URL` is not set                  | Check the skip count and report the tests that did not run separately                                      |

## 14. Original files to refer to (workout-memo)

When you take the settings over as they are, compare against the files below as the source.

- Instructions: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`, `skills/workout-foundation/SKILL.md`, `skills/workout-foundation/references/stack.md`
- Settings: `package.json`, `.npmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `frontend/tsconfig.json`, `backend/tsconfig*.json`, `frontend/vite.config.ts`
- Run: `compose.yaml`, `.env.example`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/Dockerfile`
- CI: `.github/workflows/ci.yml`, `frontend|backend|infrastructure/.github/workflows/ci.yml`
- Repositories: `scripts/create-repositories.ps1`, `scripts/push-repositories.ps1`, `scripts/backup.ps1`, `scripts/claude-skills.mjs`
- Infrastructure: `infrastructure/main.tf`, `infrastructure/versions.tf`, `infrastructure/README.md`
- Docs: `docs/development-baseline.md`, `docs/project-github-auth.md`, `docs/local-agent-workflow.md`, `docs/shared-hosting-costs.md`, `docs/agent-issue-template.md`
