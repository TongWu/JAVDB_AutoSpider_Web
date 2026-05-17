# Deploy: GitHub Actions ingestion mode

Use this when you want the heavy ingestion runs (Daily / Ad-Hoc spider passes) to execute on GitHub-hosted runners instead of your own infrastructure. The backend is still present (it serves the API, holds auth, exposes capabilities) but it dispatches GitHub Actions workflows instead of running the spider locally.

## When to choose this topology

- You don't want a long-running spider process on your VPS.
- You already use GitHub Actions in the main repo and want the FE to drive it.
- You want to leverage GitHub's free runner minutes.

## Prerequisites

- A GitHub fork or your own copy of the main [JAVDB_AutoSpider_CICD](https://github.com/TongWu/JAVDB_AutoSpider_CICD) repo with the existing workflows: `DailyIngestion.yml`, `AdHocIngestion.yml`, `RollbackD1.yml`, etc.
- A personal access token (PAT) with `repo` + `workflow` scopes. (Or a fine-grained token with `actions:write` on the repo.)
- The backend service running somewhere (Docker container, VPS, Cloudflare Workers — your choice). The backend is the FE's only direct contact; it brokers all GitHub API calls.

## Configuration

In `.env.api`:

```bash
INGESTION_MODE=github
GH_ACTIONS_TIER=monitor                  # or 'edit' / 'admin'
GH_ACTIONS_REPO=TongWu/JAVDB_AutoSpider_CICD
GH_ACTIONS_TOKEN=ghp_your_PAT_here
```

`GH_ACTIONS_TIER` controls what UI surfaces the FE exposes:

| Tier | Surfaces unlocked |
|------|------------------|
| `none` | GH Actions integration disabled (default for `INGESTION_MODE=local`). |
| `monitor` | List runs, dispatch workflows, view streaming logs. |
| `edit` | `monitor` + edit workflow YAML files via the FE. |
| `admin` | `edit` + manage GitHub repository secrets. |

Start with `monitor` and elevate later if you need it.

## What the FE does in this mode

When the user clicks "Run Daily":

1. FE calls `POST /api/tasks/daily` on the backend.
2. Backend sees `INGESTION_MODE=github`, looks up the configured `GH_ACTIONS_REPO` + `GH_ACTIONS_TOKEN`.
3. Backend calls GitHub's REST API: `POST /repos/{owner}/{repo}/actions/workflows/DailyIngestion.yml/dispatches` with the user-supplied inputs (proxy override, dry-run, page range).
4. Backend records the dispatch and returns a `job_id` to the FE.
5. FE polls `GET /api/tasks/{job_id}/stream` for log lines. Backend translates that to GitHub's logs endpoint and streams back.

From the user's perspective, the experience is identical to the colocated mode — they fill in the same form, watch the same log stream, see the same run in the Tasks list.

## Storage backend

In GitHub Actions mode you almost certainly want `STORAGE_BACKEND=d1`. The runner is ephemeral, so SQLite files would die when the workflow finishes. D1 (Cloudflare) is the canonical remote backend.

See the main repo's [D1 setup docs](https://github.com/TongWu/JAVDB_AutoSpider_CICD/tree/main/docs/en/ops) for credentials and migration.

## Rate limits

GitHub's REST API allows ~5000 requests/hour per token. The FE polls only the currently-viewed run (15s default), so a single user is far under the limit. If you run many concurrent jobs and watch them all simultaneously, you might hit the ceiling — but the FE only polls focused runs, not background ones.

## Limitations

- The backend still needs to be reachable from the user's browser. You can't run the entire thing stateless — the BE keeps user auth and dispatched-run metadata.
- Real-time log streaming has a ~10s delay because the GitHub API logs endpoint isn't push-based.
- Secrets tier (`admin`) requires a PAT with `admin:repo_hook` scope. If you want to manage secrets via the FE but not give it admin permissions, use `edit` and manage secrets directly in GitHub.
