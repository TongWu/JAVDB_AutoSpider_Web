# Plan B — Frontend Repo Bootstrap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the new frontend repo (`javdb-autospider-web`) end-to-end: tooling + theme/layout shell + auth + capabilities boot gate + Dashboard skeleton + API client codegen + CI + Docker image + compose.yml + deploy docs. After Plan B, the FE is empty-but-ready: it boots, hits `/api/capabilities` and `/api/health`, gates the layout on those, lets the user log in, and shows an empty Dashboard. Pages (Onboarding, Run, Tasks, Sessions, Browse, Settings) land in Plan C/D/E.

**Architecture:** Vue 3 + TypeScript + Vite 6 + Pinia + vue-router + vue-i18n + Naive UI. Theme follows direction "C. Friendly cards" from the design spec — soft palette, rounded 12-16 px, light shadows, purple-pink gradient accent. Three deployment topologies share the same FE; `VITE_API_BASE_URL` is the only thing that changes between them.

**Tech stack (pinned versions):**
- `vue@^3.5`, `vue-router@^4`, `pinia@^2`, `vue-i18n@^9`, `naive-ui@^2.40`, `vfonts@^0.1`, `axios@^1`, `date-fns@^3`, `@vueuse/core@^11`
- `typescript@^5`, `vite@^6`, `@vitejs/plugin-vue@^5`, `vue-tsc@^2`, `openapi-typescript@^7`, `vitest@^2`, `@vue/test-utils@^2`, `@playwright/test@^1.48`, `eslint@^9`, `@typescript-eslint/parser@^8`, `eslint-plugin-vue@^9`, `prettier@^3`, `@intlify/eslint-plugin-vue-i18n`

**Spec:** [`docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md`](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md) (lives in the main repo).

**OpenAPI consumed:** [`docs/api/openapi.json`](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/api/openapi.json) in the main repo; published by `publish-openapi.yml` on every main push. FE pulls this at build time via raw GitHub URL or local copy.

**No main-repo changes are needed in Plan B.** Plan A already landed `publish-api-image.yml` + `publish-openapi.yml` + the BE Docker image + the 10 Phase 1 endpoints. The FE consumes only those stable artifacts.

---

## File map

```
javdb-autospider-web/
├── .editorconfig
├── .gitignore
├── .eslintrc.cjs / eslint.config.js
├── .prettierrc
├── LICENSE                       # MIT to start, user can change
├── README.md
├── index.html                    # vite entry
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── docs/
│   ├── plans/
│   │   └── 2026-05-17-frontend-bootstrap.md   # this file
│   ├── deploy-colocated.md
│   ├── deploy-split.md
│   └── deploy-github-mode.md
├── public/
│   └── favicon.svg
├── scripts/
│   └── fetch-openapi.mjs         # downloads openapi.json + runs openapi-typescript
├── src/
│   ├── main.ts                   # app entry, registers Naive UI, i18n, router, Pinia
│   ├── App.vue                   # <CapabilitiesGate> wrapper, <RouterView>
│   ├── router/
│   │   ├── index.ts              # routes + nav guards (auth + capabilities)
│   │   └── routes.ts             # route definitions, route meta (roles, requiresAuth, capability gates)
│   ├── stores/
│   │   ├── auth.ts               # JWT, role, login/logout, refresh-queue
│   │   ├── capabilities.ts       # /api/capabilities cache, 5min TTL
│   │   ├── tasks.ts              # placeholder for Plan C
│   │   ├── ui.ts                 # sidebar collapsed, theme, toast
│   │   ├── onboarding.ts         # placeholder for Plan C
│   │   └── i18n.ts               # locale, change action
│   ├── api/
│   │   ├── client.ts             # axios instance + interceptors (CSRF, X-Request-Id, refresh queue, error→toast)
│   │   ├── auth.ts               # POST /api/auth/login, POST /api/auth/refresh, POST /api/auth/logout
│   │   ├── capabilities.ts       # GET /api/capabilities
│   │   ├── health.ts             # GET /api/health
│   │   └── _typed.ts             # tiny helper to use api.gen.ts paths{} types
│   ├── composables/
│   │   ├── useApi.ts             # one-shot GET with {data, error, isLoading}
│   │   ├── usePolling.ts         # list polling, pauses on document.hidden
│   │   └── useLogStream.ts       # placeholder for Plan C
│   ├── i18n/
│   │   ├── index.ts              # vue-i18n setup, lazy locale loader
│   │   └── locales/
│   │       ├── zh-CN.json
│   │       ├── en.json
│   │       └── ja.json
│   ├── theme/
│   │   ├── index.ts              # NThemeOverrides for light/dark, direction C tokens
│   │   └── tokens.ts             # raw color/radius/shadow values
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.vue      # sidebar + topbar layout
│   │   │   ├── Sidebar.vue       # nav with capability-gated entries
│   │   │   └── TopBar.vue        # user menu, language switcher, dark/light toggle
│   │   ├── CapabilitiesGate.vue  # boot blocker; awaits capabilities + health
│   │   ├── OutageScreen.vue      # full-screen Level 3 error
│   │   └── icons/                # inline SVG icons
│   ├── pages/
│   │   ├── LoginPage.vue
│   │   ├── HomePage.vue          # Dashboard skeleton (stats placeholders + recent runs placeholder)
│   │   ├── NotFoundPage.vue
│   │   ├── ForbiddenPage.vue
│   │   └── ErrorPage.vue
│   └── types/
│       ├── api.gen.ts            # generated from openapi.json by openapi-typescript
│       └── domain.ts             # FE-specific types not in openapi
├── tests/
│   ├── unit/
│   │   ├── auth-store.spec.ts
│   │   ├── capabilities-store.spec.ts
│   │   ├── refresh-queue.spec.ts
│   │   ├── use-polling.spec.ts
│   │   └── i18n-parity.spec.ts   # asserts zh-CN.json, en.json, ja.json have identical key sets
│   ├── contract/
│   │   └── openapi-shapes.spec.ts # asserts api.gen.ts matches openapi.json on key endpoints
│   └── e2e/
│       ├── playwright.config.ts
│       └── login.spec.ts         # placeholder journey
├── docker/
│   ├── Dockerfile                # multi-stage: build vite → nginx static
│   └── nginx.conf
├── docker-compose.yml            # FE container + reference to ghcr.io BE image
└── .github/
    └── workflows/
        ├── ci.yml                # lint, typecheck, unit, contract, build
        ├── e2e.yml               # Playwright nightly
        ├── docker.yml            # build + push to GHCR on tag
        └── release.yml           # changelog + GH release (manual)
```

---

## Tasks (sequential — each builds on the previous)

Each task lands ONE commit (or two when test-then-impl). Branch off `main` for the whole bootstrap; no per-task branches needed since the repo is greenfield. After Task B8 is green, merge to remote and tag `v0.1.0-bootstrap`.

### Task B1: Repo init + tooling

**Outcome:** `npm install` runs cleanly, `npm run build` produces empty Vite output, lint + typecheck pass on an empty `src/main.ts`.

Land:
- `package.json` with all dependencies pinned per the tech-stack list above. Script entries: `dev`, `build`, `preview`, `typecheck`, `lint`, `lint:fix`, `format`, `test:unit`, `test:contract`, `test:e2e`, `gen:api-types`.
- `tsconfig.json` (Vue 3 + strict + ESM) and `tsconfig.node.json` for build tooling.
- `vite.config.ts` with `@vitejs/plugin-vue`, alias `@/` → `src/`, env var declaration for `VITE_API_BASE_URL`.
- `index.html` with `#app` div and dark-mode-aware `<meta name="color-scheme" content="light dark">`.
- `.eslintrc.cjs` (or `eslint.config.js`) with `eslint-plugin-vue`, `@typescript-eslint`, `@intlify/eslint-plugin-vue-i18n`.
- `.prettierrc` with project conventions.
- `.editorconfig`, `.gitignore` (Node + Vite + IDE + `.env.local`), `.npmrc` (if needed).
- `LICENSE` (MIT placeholder), `README.md` (1-paragraph stub pointing at the spec).
- `src/main.ts` minimal: `createApp(App).mount('#app')`.
- `src/App.vue` minimal: empty `<template><div>boot</div></template>`.

Commit: `chore: scaffold repo with vite + vue 3 + ts + naive-ui tooling`.

### Task B2: Theme + layout shell + i18n + vue-router

**Outcome:** Empty layout renders: sidebar + topbar + content area + footer. Dark/light toggle works. Language switcher cycles zh-CN / en / ja. Routes `/`, `/login`, `/404`, `/403`, `/error` are registered.

Land:
- `src/theme/tokens.ts` + `src/theme/index.ts` with `NThemeOverrides` for light and dark variants encoding direction C: rounded 12-16 px, soft shadows, primary `#7c3aed`, secondary `#ec4899`, base bg `#faf9f7` light / `#0e0d12` dark.
- `src/i18n/index.ts` with vue-i18n setup, lazy-loaded locales via dynamic import, fallback to `en`.
- `src/i18n/locales/{zh-CN,en,ja}.json` — initial keys for nav, common buttons, login form, error messages, app metadata. Three files MUST have identical key sets.
- `src/router/index.ts` + `routes.ts` — route definitions, navigation guards (auth + capabilities — placeholders for now, real logic in B3/B4). Routes: `/login`, `/`, `/404`, `/403`, `/error`.
- `src/components/layout/AppShell.vue`, `Sidebar.vue`, `TopBar.vue` — Naive UI `NLayout`, `NLayoutSider`, `NLayoutHeader`. Sidebar has placeholders for the 9 nav groups from spec §6.1 but only Home is wired to a route for now.
- `src/stores/ui.ts` — sidebar collapsed flag, theme (light/dark/system), language. Persisted to `localStorage` via `useStorage` from `@vueuse/core`.
- `src/stores/i18n.ts` — locale + change action that lazy-loads the new locale file.
- `src/pages/{HomePage,NotFoundPage,ForbiddenPage,ErrorPage}.vue` — empty page shells with title + back-to-home link.
- `src/main.ts` wires everything: `createPinia`, `createI18n`, `createRouter`, `NConfigProvider` with `themeOverrides`.
- `tests/unit/i18n-parity.spec.ts` — Vitest that asserts the three locale JSONs have identical key sets at every depth.

Commit: `feat: theme tokens, layout shell, i18n setup, base routes`.

### Task B3: Auth flow (store + refresh queue + login page + guards)

**Outcome:** `/login` renders a Naive UI form, submitting valid credentials lands at `/` showing a "logged in" stub. Token refresh works transparently when access token expires.

Land:
- `src/api/client.ts` — axios instance with `baseURL = import.meta.env.VITE_API_BASE_URL`. Interceptors:
  - Request: inject `Authorization: Bearer <token>` from auth store, inject `X-CSRF-Token` from cookie on mutating verbs, generate per-request `X-Request-Id` UUID.
  - Response: 4xx/5xx → map `error.code` through i18n → emit Naive UI Message toast with request_id suffix → reject.
  - Refresh queue per spec §8.1: catch 401, hold concurrent requests in a queue, single-flight `POST /api/auth/refresh`, replay queue with new token, fall back to `/login` on refresh failure.
- `src/api/auth.ts` — typed wrappers for `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`. Use `paths` types from `src/types/api.gen.ts` (will be generated in Task B5; provide a hand-written stub for now).
- `src/stores/auth.ts` — Pinia store: `accessToken`, `refreshToken`, `role`, `username`, actions `login(u,p)`, `logout()`, `setAccessToken(t)`. Session persisted to `sessionStorage`.
- `src/pages/LoginPage.vue` — Naive UI `NForm` with username + password + remember-me. On submit calls `auth.login`, redirects to `/`. Shows i18n error on failure.
- Router guard updates: `beforeEach` checks `meta.requiresAuth` and `meta.roles`. Routes that need auth: everything except `/login`, `/error`. Routes that need admin: TBD in later plans.
- `tests/unit/auth-store.spec.ts` — login success, login failure, logout clears state.
- `tests/unit/refresh-queue.spec.ts` — concurrent 401s share one refresh call, retry happens once.

Commit: `feat: auth store + refresh queue + login page + route guards`.

### Task B4: Capabilities boot gate + Dashboard skeleton

**Outcome:** On app boot, `<CapabilitiesGate>` blocks the layout with a 200 ms shimmer while `/api/capabilities` resolves. After it resolves, sidebar shows/hides entries based on `gh_actions.tier`, `ingestion_mode`, and `features.*`. Home page renders 4 empty stat cards + an empty "Recent runs" table.

Land:
- `src/api/capabilities.ts` — typed wrapper for `GET /api/capabilities`. Has a small response cache (in-memory, 5 min TTL).
- `src/api/health.ts` — wrapper for `GET /api/health`.
- `src/stores/capabilities.ts` — Pinia store: `capabilities` (CapabilitiesResponse), `loadedAt`, `error`, actions `fetchInitial()`, `refresh()`. TTL invalidation.
- `src/components/CapabilitiesGate.vue` — wraps `<RouterView>`. On `onMounted`, calls `capabilitiesStore.fetchInitial()` + `/api/health`. While loading, shows `<NSkeleton>` shimmer of the sidebar layout. On success, unmounts shimmer. On failure, navigates to `/error` (or `<OutageScreen>` if `/api/health` itself failed).
- `src/components/OutageScreen.vue` — full-screen blocker for spec §9.3 Level 3 outage. Title, troubleshooting checklist, retry button.
- `src/components/layout/Sidebar.vue` — reads from capabilities store; show/hide each nav group per spec §6.1. Default 9 groups, GH Actions group hidden when `tier === 'none'`.
- `src/pages/HomePage.vue` — 4 empty `NStat` cards (Running, Today, Failed, Pending sessions). Empty `NDataTable` for recent runs. "Run Daily" CTA button (no-op for now). Greeting "Good evening 👋" + status pill from capabilities.
- `tests/unit/capabilities-store.spec.ts` — fetch success, TTL invalidation, force refresh.

Commit: `feat: capabilities boot gate + dashboard skeleton`.

### Task B5: API client + openapi-typescript codegen pipeline

**Outcome:** `npm run gen:api-types` fetches `openapi.json` from the main repo and regenerates `src/types/api.gen.ts`. The hand-written stubs from B3 are replaced with generated types. `npm run test:contract` verifies generated types match endpoint shapes.

Land:
- `scripts/fetch-openapi.mjs` — downloads `openapi.json` from `https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/openapi.json` (or from a `OPENAPI_URL` env override), writes to `tmp/openapi.json`, then runs `openapi-typescript` to write `src/types/api.gen.ts`.
- `src/api/_typed.ts` — helper to derive request/response shapes from `paths` like `type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M]['requestBody'] ...`.
- Re-export proper types from `src/api/auth.ts`, `src/api/capabilities.ts`, `src/api/health.ts` using the generated `paths`.
- `tests/contract/openapi-shapes.spec.ts` — Vitest. For each FE-consumed endpoint, asserts `api.gen.ts` contains a 200 response schema. Runs against the committed `docs/api/openapi.json` in this repo's mirror (kept under `tmp/openapi.json` so it's not authoritative).
- `package.json` script: `"gen:api-types": "node scripts/fetch-openapi.mjs"`, `"test:contract": "vitest run --config vitest.contract.config.ts"`.

Commit: `feat: openapi-typescript codegen pipeline + contract tests`.

### Task B6: CI workflows (ci, e2e placeholder, docker)

**Outcome:** GitHub CI runs on PR: install → lint → typecheck → unit → contract → build. Caches `node_modules`. e2e workflow exists with a placeholder test. Docker workflow builds + pushes on tag.

Land:
- `.github/workflows/ci.yml` — every PR + push to main:
  ```
  jobs: ci → ubuntu-latest, Node 20:
    npm ci
    npm run lint
    npm run typecheck
    npm run gen:api-types (refresh from main repo's published schema)
    npm run test:unit
    npm run test:contract
    npm run build
  ```
- `.github/workflows/e2e.yml` — PR + nightly cron. Matrix on chromium / firefox / webkit. Boots the BE via docker-compose (`ghcr.io/<owner>/javdb-autospider-api:latest`), runs Playwright `tests/e2e/`. Placeholder journey: `login.spec.ts` — login, see Dashboard, log out.
- `.github/workflows/docker.yml` — tag push. Builds `docker/Dockerfile`, pushes to `ghcr.io/<owner>/javdb-autospider-web:<tag>` + `:latest`. Same metadata-action pattern as main repo's `publish-api-image.yml`.
- `.github/workflows/release.yml` — manual `workflow_dispatch`. Conventional-commits changelog + GH Release.

Commit: `ci: add CI, E2E, docker, release workflows`.

### Task B7: Docker image + compose

**Outcome:** `docker build -f docker/Dockerfile .` produces an nginx static-server image. `docker compose up` brings up FE+BE locally.

Land:
- `docker/Dockerfile` — multi-stage:
  - Stage 1: `node:20-alpine`, `npm ci`, `npm run gen:api-types`, `npm run build`. Output `dist/`.
  - Stage 2: `nginx:1.27-alpine`, copy `dist/` to `/usr/share/nginx/html`, copy `docker/nginx.conf`, expose 80.
- `docker/nginx.conf` — SPA-friendly: `try_files $uri $uri/ /index.html`. Proxy `/api/*` to the BE service in compose. Sane gzip + cache-control headers.
- `docker-compose.yml`:
  ```yaml
  services:
    api:
      image: ghcr.io/${GHCR_OWNER:-TongWu}/javdb-autospider-api:latest
      env_file: .env.api
      ports: ["8100:8100"]
      volumes: ["./reports:/app/reports"]
    web:
      build:
        context: .
        dockerfile: docker/Dockerfile
      ports: ["5173:80"]
      depends_on: [api]
      environment:
        VITE_API_BASE_URL: http://api:8100
  ```
- `.env.api.example` — placeholder env file with `STORAGE_BACKEND`, `API_SECRET_KEY`, `JAVDB_SESSION_COOKIE`, `QB_URL`, etc.

Commit: `feat: dockerfile + nginx config + compose with BE GHCR reference`.

### Task B8: Deploy docs + README

**Outcome:** README is slim (~100 lines), three deploy guides cover the three topologies.

Land:
- `README.md` — badges, 1-paragraph pitch, quick start (5 commands), 3 deploy-doc links.
- `docs/deploy-colocated.md` — Docker Compose, env file, runs FE+BE on the same host. ~80 lines.
- `docs/deploy-split.md` — FE on Cloudflare Pages / static host, BE on user VPS or Cloudflare Worker. `VITE_API_BASE_URL` config. ~80 lines.
- `docs/deploy-github-mode.md` — `INGESTION_MODE=github`, dispatches workflows instead of running spider locally. `GH_ACTIONS_TOKEN`, `GH_ACTIONS_REPO` env vars. ~80 lines.

Commit: `docs: deploy guides for colocated / split / github-mode + README`.

### Final verification + tagging

```bash
npm install
npm run lint
npm run typecheck
npm run gen:api-types
npm run test:unit
npm run test:contract
npm run build
docker build -f docker/Dockerfile -t javdb-autospider-web:dev .
docker compose up -d  # smoke
curl -sf http://127.0.0.1:5173/  # FE serves
curl -sf http://127.0.0.1:5173/api/health  # FE proxies to BE through nginx
```

Tag once green: `git tag v0.1.0-bootstrap`.

---

## Out of scope for Plan B

Pages still TODO (land in Plan C/D/E):
- Onboarding wizard
- Run (Daily/Ad Hoc)
- Tasks
- Sessions
- Browse (Resolve/Lists/Preview)
- Settings (Config, Auth, Capabilities, Appearance)
- Data (Movies, Torrents)
- Operations (qB, PikPak, Rclone, Email, Cleanup)
- Diagnostics (Health, Parse tester, JavDB session)
- GH Actions (Runs, Workflows, Secrets)

Each subsequent plan (C, D, E) adds 1-3 pages. The Sidebar's nav items for these pages are stubbed in B2/B4 (visible but route to `/` for now).

## Done criteria for Plan B

- [ ] `npm run build` succeeds on a clean clone.
- [ ] `npm run test:unit` passes — at least 6 tests.
- [ ] `npm run test:contract` passes against the latest main-repo `openapi.json`.
- [ ] `docker compose up` brings FE+BE up; `curl http://127.0.0.1:5173/api/health` returns 200.
- [ ] Login works against the local BE; refresh-queue prevents 401 storms.
- [ ] Capabilities boot gate blocks the layout for one RTT then unblocks; sidebar entries respect capabilities.
- [ ] Three deploy guides exist and link from README.
- [ ] CI green on the PR that lands Plan B.
