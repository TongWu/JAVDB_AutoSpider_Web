# Deploy: Colocated (Docker Compose)

The simplest setup. Both the frontend and backend run as Docker containers on the same host. Best for: home labs, single-user self-hosting, evaluation.

## Prerequisites

- Docker 24+ with Compose v2 (`docker compose ...`, not `docker-compose`).
- ~2 GB free disk space (1.2 GB API image, 50 MB web image, the rest for SQLite + logs).
- A GitHub account with read access to the GHCR API image (`ghcr.io/TongWu/javdb-autospider-api`). If the image is private, you'll need `docker login ghcr.io`.

## Quick path

```bash
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web
cp .env.api.example .env.api
# Edit .env.api — at minimum set API_SECRET_KEY (must be >= 32 chars).
docker compose up -d
```

Wait ~10 seconds for the API health check to pass, then open `http://localhost:5173`. Default login is whatever you provisioned in the backend (see main repo's auth setup; admin user is created on first run).

## Configuration knobs

All in `.env.api`:

| Variable | Default | What it does |
|----------|---------|--------------|
| `STORAGE_BACKEND` | `sqlite` | `sqlite` (local files) or `dual` (mirror to D1). For `d1` you need Cloudflare D1 credentials — see main repo's docs. |
| `API_SECRET_KEY` | (must set) | HS256 signing key for JWT. >= 32 chars. |
| `INGESTION_MODE` | `local` | `local` runs the spider in-process. Use `github` to dispatch GitHub Actions workflows instead (see [deploy-github-mode.md](deploy-github-mode.md)). |
| `JAVDB_SESSION_COOKIE` | empty | Paste the `_jdb_session` cookie. If unset, use `JAVDB_USERNAME` + `JAVDB_PASSWORD` for headless login. |
| `QB_URL` | empty | qBittorrent Web UI URL. Required for magnet downloads. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | empty | Email notifications (optional). |

Compose-level knobs in shell env (or `.env`):

| Variable | Default | What it does |
|----------|---------|--------------|
| `GHCR_OWNER` | `TongWu` | The GHCR namespace to pull the API image from. |
| `API_TAG` | `latest` | API image tag. Pin to `sha-<sha>` for reproducible deployments. |
| `WEB_PORT` | `5173` | Host port for the web UI. |
| `API_PORT` | `8100` | Host port for the API. |
| `VITE_API_BASE_URL` | `http://api:8100` | Container-internal URL. Don't change unless you know why. |

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

- **`docker compose up` hangs on `Waiting for API healthcheck`** — check `docker compose logs api`; usually a missing required env var.
- **FE shows `Cannot reach backend`** — the API container isn't listening on `:8100` or `VITE_API_BASE_URL` is wrong. From inside the web container: `curl http://api:8100/api/health` should return JSON.
- **CSRF errors on login** — your reverse proxy is stripping the `csrf_token` cookie. Make sure cookies pass through.
