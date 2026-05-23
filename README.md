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

## Quick start

This repo contains only the frontend. The backend lives in the [main repo](https://github.com/TongWu/JAVDB_AutoSpider_CICD); its Docker image is pulled from GHCR. All shared settings (admin credentials, JavDB cookie, qB URL, storage backend, etc.) come from the main repo's `config.py` — there's no separate `.env.api` to maintain.

```bash
# 1. Clone both repos as siblings, or nested as you prefer
git clone https://github.com/TongWu/JAVDB_AutoSpider_CICD.git
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web

# 2. Create the main repo's config.py (one-time)
cp ../JAVDB_AutoSpider_CICD/config.py.example ../JAVDB_AutoSpider_CICD/config.py
# edit ../JAVDB_AutoSpider_CICD/config.py:
#   - ADMIN_PASSWORD: change from 'changeme' if exposing to internet
#   - API_SECRET_KEY: paste a >=32-char random string (e.g. `openssl rand -hex 32`)
#   - JAVDB_SESSION_COOKIE: paste your javdb _jdb_session value
#   - QB_URL / QB_USERNAME / QB_PASSWORD: your qBittorrent
#   - other integrations as needed (SMTP / PikPak / Rclone)

# 3. If you cloned the repos in non-default layout, point at the main repo's config.py:
#   echo "CONFIG_PY_PATH=../JAVDB_AutoSpider_CICD/config.py" > .env
# (default ../config.py works when the FE repo lives inside the main repo's directory)

# 4. Boot
docker compose up -d
open http://localhost:5173                # login: admin / changeme (default in config.py.example)
```

The default `admin / changeme` credentials ship in `config.py.example`. **Change `ADMIN_PASSWORD` before exposing the service publicly.**

You can also leave `ADMIN_PASSWORD` blank in `config.py` (non-production mode); the BE will generate a random ephemeral password at startup and print it to:

```bash
docker compose logs api | grep -i "ephemeral admin password"
```

The admin username defaults to `admin` (override via `ADMIN_USERNAME` in `config.py`).

Stop with `docker compose down`. Reset state with `docker compose down -v` (drops `api-reports` and `api-logs` volumes).

### Updating `config.py` after first start

Docker Compose mounts `config.py` read-only at runtime. Just edit the file; the BE picks up the new values on next read (most are read at startup, so restart the API container for changes to take effect):

```bash
docker compose restart api
```

To verify the BE container sees your config:

```bash
docker compose exec api python -c "import config; print(config.ADMIN_USERNAME)"
```

## Deployment topologies

This frontend supports three topologies. Pick the one that matches your setup:

| Topology | FE host | BE host | Guide |
| --- | --- | --- | --- |
| **Cloudflare Pages** | Cloudflare CDN | Hono + D1 (Pages Functions) | [Deploy to Cloudflare](#deploy-to-cloudflare) |
| Colocated | Local (Docker) | Local (Docker, GHCR image) | [docs/deploy-colocated.md](docs/deploy-colocated.md) |
| Split | Static host (Cloudflare Pages / Vercel / GH Pages) | Separate VPS or Cloudflare Workers | [docs/deploy-split.md](docs/deploy-split.md) |
| GitHub-managed ingestion | Local or static | BE in either, `INGESTION_MODE=github` | [docs/deploy-github-mode.md](docs/deploy-github-mode.md) |

The FE is mode-agnostic — it talks to a single abstract backend via `VITE_API_BASE_URL` and discovers its capabilities at runtime via `GET /api/capabilities`. Switching topologies only changes how you deploy the BE; the FE binary is the same.

## Deploy to Cloudflare

<!-- Cloudflare Deploy Buttons do not support Pages projects yet (Workers only).
     See: https://developers.cloudflare.com/workers/platform/deploy-buttons/
     When support is added, replace the link below with:
     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/TongWu/JAVDB_AutoSpider_Web) -->

> **Note:** One-click [Deploy Buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) are not yet supported for Cloudflare Pages projects. Follow the manual steps below.

This project includes a Hono-based TypeScript API that runs as Cloudflare Pages Functions, with native D1 database bindings. The Free plan is sufficient for personal use.

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (Free plan works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler && wrangler login`)
- Three D1 databases: `javdb-history`, `javdb-reports`, `javdb-operations`

### Step 1 — Clone & install

```bash
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web
npm install
```

### Step 2 — Look up your D1 database IDs

```bash
wrangler d1 list
```

Find the UUIDs for `javdb-history`, `javdb-reports`, `javdb-operations`. If you don't have them yet:

```bash
wrangler d1 create javdb-history
wrangler d1 create javdb-reports
wrangler d1 create javdb-operations
```

### Step 3 — Configure `wrangler.toml`

Replace the three `placeholder-fill-in-before-deploy` values with the real UUIDs from step 2:

```toml
[[d1_databases]]
binding = "HISTORY_DB"
database_name = "javdb-history"
database_id = "<paste your javdb-history UUID>"

[[d1_databases]]
binding = "REPORTS_DB"
database_name = "javdb-reports"
database_id = "<paste your javdb-reports UUID>"

[[d1_databases]]
binding = "OPERATIONS_DB"
database_name = "javdb-operations"
database_id = "<paste your javdb-operations UUID>"
```

### Step 4 — Set production secrets

Each command prompts for the value interactively:

```bash
wrangler pages secret put API_SECRET_KEY          # JWT signing key, min 32 chars
wrangler pages secret put ADMIN_USERNAME           # e.g. "admin"
wrangler pages secret put ADMIN_PASSWORD_HASH      # bcrypt hash (see below)
```

Generate a bcrypt hash for your password:

```bash
# Option A: Python (if passlib is installed)
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"

# Option B: Node one-liner
node -e "import('bcryptjs').then(b=>b.hash('yourpassword',12).then(console.log))"
```

See [`.dev.vars.example`](.dev.vars.example) for all available environment variables and their descriptions.

### Step 5 — Build & deploy

```bash
npm run build                    # compiles Vue SPA → dist/
wrangler pages deploy dist       # deploys to Cloudflare Pages
```

The deployment URL is printed on success (e.g. `https://javdb-autospider-web.pages.dev`).

### Step 6 — Verify

```bash
PROD_URL=https://javdb-autospider-web.pages.dev

# Login
curl -s -X POST $PROD_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' | jq .

# Capabilities (paste the access_token from login)
curl -s $PROD_URL/api/capabilities \
  -H "Authorization: Bearer <access_token>" | jq .
```

Open the URL in a browser → login → verify history and sessions pages load.

### Local development (Cloudflare mode)

```bash
cp .dev.vars.example .dev.vars   # edit with your local secrets
npm run build
npm run dev:api                  # http://localhost:8788 (SPA + API)
```

## Develop locally

```bash
npm install
npm run dev                     # http://127.0.0.1:5173
```

The dev server binds to `127.0.0.1` (NOT `localhost`) on purpose — see the "CSRF and HTTP dev" note below. The FE expects a backend running at `VITE_API_BASE_URL` (default `http://127.0.0.1:8100`). Easiest: start just the API container and run the FE on the host:

```bash
docker compose up -d api
npm run dev
```

Or run BE directly with uvicorn (see the CSRF note for env vars).

### CSRF and HTTP dev

The BE sets a `csrf_token` cookie that the FE has to echo back as an `X-CSRF-Token` header on every mutating request. Two things must be true for this to work in dev:

1. **FE and BE must share the same hostname.** The BE defaults to `http://127.0.0.1:8100`. Therefore the FE must also be accessed at `http://127.0.0.1:5173` — NOT `http://localhost:5173`. Browsers treat `localhost` and `127.0.0.1` as different sites, and SameSite=Lax cookies set on one don't flow to the other on PUT/POST. The Vite config binds to `127.0.0.1` by default to enforce this.

2. **Run BE with `COOKIE_SECURE=False`** for HTTP dev. The cookie defaults to `secure=True`, which means browsers won't store it on plain HTTP at all.

   ```bash
   COOKIE_SECURE=False uvicorn apps.api.server:app --port 8100
   ```

   The cookie is then stored on HTTP. Do not set this in production.

3. **Or use HTTPS in dev** (more setup, matches prod): set up `mkcert` for local certs and serve uvicorn behind nginx or via uvicorn's `--ssl-keyfile` / `--ssl-certfile` options.

The FE also captures `csrf_token` from the login response body and sends it as the `X-CSRF-Token` header on every mutating request. This covers production (HTTPS) where the cookie is set correctly; in dev, conditions (1) + (2) together unblock the cookie flow.

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
| `npm run dev:api` | Start Wrangler Pages dev server on `:8788` (SPA + API, requires `npm run build` first) |
| `npm run test:server` | Vitest server-side tests (Hono routes, JWT, middleware) |
| `npm run typecheck:server` | TypeScript check for `server/` code |
| `npm run cf:deploy` | Build + deploy to Cloudflare Pages (`wrangler pages deploy`) |

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
