import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createJobRunsRepo, type JobRun } from "../services/job-runs";
import { createGhClient } from "../services/gh-client";

type TasksEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const tasksRoutes = new Hono<TasksEnv>();

function isGhActionsConfigured(env: Env): boolean {
  return (
    !!env.GH_ACTIONS_TIER &&
    env.GH_ACTIONS_TIER !== "none" &&
    !!env.GH_ACTIONS_TOKEN &&
    !!env.GH_ACTIONS_REPO
  );
}

function requireGhActions(env: Env): void {
  if (!isGhActionsConfigured(env)) {
    throw new HTTPException(503, {
      message: "GitHub Actions not configured",
    });
  }
}

const TERMINAL_STATUSES = new Set(["completed", "failure", "cancelled"]);

/**
 * Extract the kind prefix from a job_id (e.g. "daily-20260524-100000-abcd" → "daily").
 * Handles compound kinds like "qb-filter" by checking known multi-segment prefixes first.
 */
function extractKind(jobId: string): string | null {
  const knownCompound = ["qb-filter"];
  for (const prefix of knownCompound) {
    if (jobId.startsWith(prefix + "-")) return prefix;
  }
  const first = jobId.split("-")[0];
  return first || null;
}

/**
 * Transform a JobRun row into the JobSummaryResponse shape expected by the frontend.
 */
export function mapJobToSummary(job: JobRun) {
  const kind = extractKind(job.job_id);

  let url: string | null = null;
  if (job.inputs) {
    try {
      const parsed = JSON.parse(job.inputs);
      url = parsed.url ?? null;
    } catch {
      // malformed JSON — leave url as null
    }
  }

  return {
    job_id: job.job_id,
    status: job.status,
    kind,
    mode: kind === "daily" ? "pipeline" : null,
    url,
    command: null,
    log: null,
    log_size: null,
    source: "gh_actions" as const,
    created_at: job.created_at ?? null,
    completed_at: TERMINAL_STATUSES.has(job.status) ? job.updated_at : null,
  };
}

// POST /daily — dispatch DailyIngestion workflow
tasksRoutes.post("/daily", requireRole("admin"), async (c) => {
  requireGhActions(c.env);

  const body = await c.req.json<{
    dry_run?: boolean;
    disable_all_filters?: boolean;
  }>();

  const inputs: Record<string, string> = {
    dry_run: body.dry_run ? "true" : "false",
    disable_all_filters: body.disable_all_filters ? "true" : "false",
  };

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.create("daily", "DailyIngestion.yml", inputs);

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("DailyIngestion.yml", inputs);

  return c.json(
    { job_id: job.job_id, status: job.status, created_at: job.created_at },
    201,
  );
});

// POST /adhoc — dispatch AdHocIngestion workflow
tasksRoutes.post("/adhoc", requireRole("admin"), async (c) => {
  requireGhActions(c.env);

  const body = await c.req.json<{
    url?: string;
    start_page?: number;
    end_page?: number;
    dry_run?: boolean;
    disable_all_filters?: boolean;
  }>();

  if (!body.url) {
    throw new HTTPException(400, { message: "url is required" });
  }

  const inputs: Record<string, string> = {
    url: body.url,
    dry_run: body.dry_run ? "true" : "false",
    disable_all_filters: body.disable_all_filters ? "true" : "false",
  };
  if (body.start_page !== undefined) {
    inputs.start_page = String(body.start_page);
  }
  if (body.end_page !== undefined) {
    inputs.end_page = String(body.end_page);
  }

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.create("adhoc", "AdHocIngestion.yml", inputs);

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("AdHocIngestion.yml", inputs);

  return c.json(
    { job_id: job.job_id, status: job.status, created_at: job.created_at },
    201,
  );
});

// GET / — list jobs
tasksRoutes.get("/", async (c) => {
  const limitParam = c.req.query("limit");
  let limit = 50;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 200) {
      limit = parsed;
    }
  }

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const items = await repo.list(limit);
  return c.json({
    tasks: items.map(mapJobToSummary),
    next_schedule: {
      cron_pipeline: "N/A",
      cron_spider: "N/A",
      source: "cloudflare",
    },
  });
});

// GET /stats — job statistics for last 7 days
tasksRoutes.get("/stats", async (c) => {
  const row = await c.env.OPERATIONS_DB
    .prepare(
      `SELECT
        SUM(CASE WHEN job_id LIKE 'daily-%' AND status = 'completed' THEN 1 ELSE 0 END) AS daily_success,
        SUM(CASE WHEN job_id LIKE 'daily-%' AND status IN ('failure','cancelled') THEN 1 ELSE 0 END) AS daily_failed,
        SUM(CASE WHEN job_id LIKE 'daily-%' AND status IN ('dispatched','in_progress','queued') THEN 1 ELSE 0 END) AS daily_running,
        SUM(CASE WHEN job_id LIKE 'adhoc-%' AND status IN ('dispatched','in_progress','queued') THEN 1 ELSE 0 END) AS adhoc_running
      FROM job_runs WHERE created_at >= datetime('now', '-7 days')`,
    )
    .first<Record<string, number>>();

  return c.json({
    daily_success: row?.daily_success ?? 0,
    daily_failed: row?.daily_failed ?? 0,
    daily_running: row?.daily_running ?? 0,
    adhoc_running: row?.adhoc_running ?? 0,
  });
});

// GET /:job_id — single job detail
tasksRoutes.get("/:job_id", async (c) => {
  const jobId = c.req.param("job_id");
  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.get(jobId);
  if (!job) {
    return c.json({ error: { code: "job.not_found" } }, 404);
  }
  return c.json(mapJobToSummary(job));
});

// GET /:job_id/logs — get logs URL for a job
tasksRoutes.get("/:job_id/logs", async (c) => {
  const jobId = c.req.param("job_id");
  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.get(jobId);
  if (!job) {
    return c.json({ error: { code: "job.not_found" } }, 404);
  }

  if (!job.gh_run_id) {
    return c.json({ logs_url: null, message: "No GitHub run linked yet" });
  }

  requireGhActions(c.env);

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  const logsUrl = await gh.getRunLogsUrl(job.gh_run_id);
  return c.json({ logs_url: logsUrl });
});
