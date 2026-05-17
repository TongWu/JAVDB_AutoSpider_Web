# JAVDB AutoSpider — Web Console

> The web frontend for JAVDB AutoSpider. Vue 3 + Naive UI. Connects to the [main repo's backend service](https://github.com/TongWu/JAVDB_AutoSpider_CICD).

## What this is

A single-page Vue console for operating an AutoSpider deployment. It boots, signs in against the backend API, and provides operator UI for:

- Running daily / ad-hoc ingestion (local worker or via GitHub Actions)
- Watching task logs in real time
- Browsing & resolving javdb URLs, one-click magnet downloads
- Inspecting and rolling back Report sessions
- Searching MovieHistory / TorrentHistory
- Managing operations: qBittorrent, PikPak, Rclone, email notifications, cleanup sweeps
- Diagnostics: deep health-check, parse tester, JavDB session refresh
- GitHub Actions: runs / workflows / secrets (per the configured `gh_actions.tier`)
- Editing the full backend config

Plan A (backend prerequisites — onboarding, sessions, capabilities, system_state, plus the API Dockerfile and OpenAPI publish workflow) has already landed in the main repo. This repo is the frontend that consumes those endpoints.

**Design spec:** [docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md (main repo)](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md)

## Quick start (5 commands)

```bash
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web
cp .env.api.example .env.api    # edit to set API_SECRET_KEY etc.
docker compose up -d            # pulls the BE image from GHCR, builds FE
open http://localhost:5173      # default login: admin / changeme
```

Stop with `docker compose down`. Reset state with `docker compose down -v` (drops `api-reports` and `api-logs` volumes).

## Deployment topologies

This frontend supports three topologies. Pick the one that matches your setup:

| Topology | FE host | BE host | Guide |
| --- | --- | --- | --- |
| Colocated | Local (Docker) | Local (Docker, GHCR image) | [docs/deploy-colocated.md](docs/deploy-colocated.md) |
| Split | Static host (Cloudflare Pages / Vercel / GH Pages) | Separate VPS or Cloudflare Workers | [docs/deploy-split.md](docs/deploy-split.md) |
| GitHub-managed ingestion | Local or static | BE in either, `INGESTION_MODE=github` | [docs/deploy-github-mode.md](docs/deploy-github-mode.md) |

The FE is mode-agnostic — it talks to a single abstract backend via `VITE_API_BASE_URL` and discovers its capabilities at runtime via `GET /api/capabilities`. Switching topologies only changes how you deploy the BE; the FE binary is the same.

## Develop locally

```bash
npm install
npm run dev                     # http://localhost:5173
```

The dev server expects a backend running at `VITE_API_BASE_URL` (default `http://127.0.0.1:8100`). Easiest: start just the API container and run the FE on the host:

```bash
docker compose up -d api
npm run dev
```

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server on `:5173` with HMR |
| `npm run build` | Compile and emit `dist/` |
| `npm run preview` | Serve the `dist/` output locally |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint (vue + ts + i18n key parity) |
| `npm run format` | Prettier |
| `npm run test:unit` | Vitest unit tests (stores, composables) |
| `npm run test:contract` | Verify generated types match upstream OpenAPI |
| `npm run test:e2e` | Playwright (boots the FE; assumes BE is running) |
| `npm run gen:api-types` | Regenerate `src/types/api.gen.ts` from main repo's `openapi.json` (set `OPENAPI_PATH=...` for a local file) |

## Project layout

```text
src/
├── main.ts             entry, registers Naive UI, i18n, router, Pinia
├── App.vue             theme provider + capabilities boot gate
├── router/             routes + auth/capabilities guards
├── stores/             Pinia (auth, capabilities, ui, locale, ...)
├── api/                axios client + typed wrappers
├── i18n/               zh-CN / en / ja, lazy-loaded
├── theme/              Naive UI themeOverrides (direction C)
├── components/         layout + cross-cutting components
├── pages/              one folder per route
└── types/api.gen.ts    generated from upstream openapi.json
```

Pages currently shipped (Plan B bootstrap):

- `/login` — sign-in form
- `/` — Dashboard skeleton (4 stat cards, recent runs placeholder)
- `/404`, `/403`, `/error` — error pages

Pages not yet in this repo (land in Plan C / D / E):

- Onboarding wizard, Run (Daily/Ad Hoc), Tasks, Sessions, Browse (Resolve/Lists/Preview), Settings (Config/Auth/Capabilities/Appearance), Data (Movies/Torrents), Operations (qB/PikPak/Rclone/Email/Cleanup), Diagnostics (Health/Parse tester/JavDB session), GitHub Actions (Runs/Workflows/Secrets)

The sidebar shows placeholders for these so users see what's coming.

## License

MIT — see [LICENSE](LICENSE).
