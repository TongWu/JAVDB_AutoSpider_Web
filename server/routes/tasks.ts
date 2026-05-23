import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createJobRunsRepo } from "../services/job-runs";
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
  await repo.ensureTable();
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
  await repo.ensureTable();
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
  await repo.ensureTable();
  const items = await repo.list(limit);
  return c.json({ items });
});

// GET /stats — job statistics for last 7 days
tasksRoutes.get("/stats", async (c) => {
  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  await repo.ensureTable();
  const stats = await repo.stats();
  return c.json(stats);
});

// GET /:job_id — single job detail
tasksRoutes.get("/:job_id", async (c) => {
  const jobId = c.req.param("job_id");
  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  await repo.ensureTable();
  const job = await repo.get(jobId);
  if (!job) {
    return c.json({ error: { code: "job.not_found" } }, 404);
  }
  return c.json(job);
});

// GET /:job_id/logs — get logs URL for a job
tasksRoutes.get("/:job_id/logs", async (c) => {
  const jobId = c.req.param("job_id");
  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  await repo.ensureTable();
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
