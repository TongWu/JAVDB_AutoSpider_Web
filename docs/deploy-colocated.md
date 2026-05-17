# Deploy: Colocated (Docker Compose)

The simplest setup. Both the frontend and backend run as Docker containers on the same host. Best for: home labs, single-user self-hosting, evaluation.

## Prerequisites

- Docker 24+ with Compose v2 (`docker compose ...`, not `docker-compose`).
- ~2 GB free disk space (1.2 GB API image, 50 MB web image, the rest for SQLite + logs).
- A GitHub account with read access to the GHCR API image (`ghcr.io/tongwu/javdb-autospider-api`). If the image is private, you'll need `docker login ghcr.io`.

## Quick path

All BE settings live in the main repo's `config.py`. There is no separate `.env.api` to maintain.

```bash
# Clone both repos
git clone https://github.com/TongWu/JAVDB_AutoSpider_CICD.git
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web

# Create config.py from example (one-time)
cp ../JAVDB_AutoSpider_CICD/config.py.example ../JAVDB_AutoSpider_CICD/config.py
# Edit it — at minimum set API_SECRET_KEY (>= 32 chars) and ADMIN_PASSWORD.

# Boot
docker compose up -d
```

Wait ~10 seconds for the API health check to pass, then open `http://localhost:5173`.

### Clone layout and CONFIG_PY_PATH

The compose file mounts `config.py` via `${CONFIG_PY_PATH:-../config.py}`.

**Default (nested layout):** if you cloned the FE repo inside the main repo (`JAVDB_AutoSpider_CICD/JAVDB_AutoSpider_Web/`), then `../config.py` resolves to `JAVDB_AutoSpider_CICD/config.py` — correct, works out of the box.

**Sibling layout:** if you cloned both repos as siblings (`~/code/JAVDB_AutoSpider_CICD` + `~/code/JAVDB_AutoSpider_Web`), `../config.py` resolves to `~/code/config.py` — wrong. Override by creating a `.env` in the FE repo:

```bash
echo "CONFIG_PY_PATH=../JAVDB_AutoSpider_CICD/config.py" > .env
```

## Configuration knobs

### In `config.py` (main repo)

These fields are read by the BE via the `cfg()` helper (env > `config.py` > default):

| Variable | Default in example | What it does |
| -------- | ----------------- | ------------ |
| `API_SECRET_KEY` | (must set) | HS256 signing key for JWT. >= 32 chars. Use `openssl rand -hex 32`. |
| `ADMIN_USERNAME` | `admin` | Admin login username. |
| `ADMIN_PASSWORD` | `changeme` | Admin password. Leave blank in non-production to get an ephemeral random password. |
| `READONLY_USERNAME` | `readonly` | (optional) Readonly login username. |
| `READONLY_PASSWORD` | empty | (optional) Set to enable a readonly user. |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` (local files) or `dual` (mirror to D1). |
| `INGESTION_MODE` | `local` | `local` runs the spider in-process. `github` dispatches GitHub Actions workflows. |
| `JAVDB_SESSION_COOKIE` | empty | Paste the `_jdb_session` cookie value. |
| `JAVDB_USERNAME` / `JAVDB_PASSWORD` | empty | Used for headless login if cookie is unset. |
| `QB_URL` / `QB_USERNAME` / `QB_PASSWORD` | empty | qBittorrent Web UI. Required for magnet downloads. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | empty | Email notifications (optional). |
| `GH_ACTIONS_TOKEN` | empty | GitHub personal access token — required when `INGESTION_MODE=github`. |

### In compose env / `.env` (FE repo)

Knobs that affect Docker Compose itself, not the BE application logic:

| Variable | Default | What it does |
|----------|---------|--------------|
| `CONFIG_PY_PATH` | `../config.py` | Path to the main repo's `config.py`, relative to `docker-compose.yml`. See "Clone layout" above. |
| `GHCR_OWNER` | `tongwu` | GHCR namespace to pull the API image from. Must be lowercase. |
| `API_TAG` | `latest` | API image tag. Pin to `sha-<sha>` for reproducible deployments. |
| `WEB_PORT` | `5173` | Host port for the web UI. |
| `API_PORT` | `8100` | Host port for the API. |
| `VITE_API_BASE_URL` | `http://api:8100` | Container-internal URL the FE uses to reach the BE. |

See `.env.example` for a copy-paste template of these compose knobs.

## Data persistence

The compose file declares two named volumes:

- `api-reports` — SQLite databases (`history.db`, `reports.db`, `operations.db`) and CSV/log artifacts.
- `api-logs` — task log output.

Back up by snapshotting the volume host paths. `docker compose down -v` drops everything; `docker compose down` keeps volumes.

## Updating

```bash
docker compose pull           # pulls the latest API + web images
docker compose up -d
```

Or pin to a specific API release: set `API_TAG=sha-abc1234` in `.env`.

## Troubleshooting

- **`docker compose up` hangs on `Waiting for API healthcheck`** — check `docker compose logs api`; usually a missing or mislocated `config.py`.
- **`config.py not found` in API logs** — `CONFIG_PY_PATH` is wrong. Verify: `docker compose exec api ls /app/config.py`.
- **FE shows `Cannot reach backend`** — the API container isn't listening on `:8100` or `VITE_API_BASE_URL` is wrong. From inside the web container: `curl http://api:8100/api/health` should return JSON.
- **CSRF errors on login** — your reverse proxy is stripping the `csrf_token` cookie. Make sure cookies pass through.
