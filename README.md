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

### CSRF and HTTP dev

In development you run the BE on plain HTTP. The BE's `csrf_token` cookie defaults to `secure=True`, which means browsers refuse to store it on HTTP — leading to 403 Forbidden on every mutating request.

Two ways to handle this:

1. **Run BE with `COOKIE_SECURE=False`** (recommended for dev):

   ```bash
   COOKIE_SECURE=False uvicorn apps.api.server:app --port 8100
   ```

   The cookie is then stored on HTTP. Do not set this in production.

2. **Use HTTPS in dev** (more setup but matches prod): set up `mkcert` for local certs and serve uvicorn behind nginx or via uvicorn's `--ssl-keyfile` / `--ssl-certfile` options.

The FE also captures `csrf_token` from the login response body and sends it as the `X-CSRF-Token` header on every mutating request. This covers production (HTTPS) where the cookie is set correctly; `COOKIE_SECURE=False` unblocks the other dimension (BE reading the cookie to verify against the header).

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
