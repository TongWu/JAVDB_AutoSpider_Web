import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createJobRunsRepo } from "../services/job-runs";
import { createGhClient } from "../services/gh-client";

type OpsEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const operationsRoutes = new Hono<OpsEnv>();

function requireGhActions(env: Env): void {
  if (
    !env.GH_ACTIONS_TIER ||
    env.GH_ACTIONS_TIER === "none" ||
    !env.GH_ACTIONS_TOKEN ||
    !env.GH_ACTIONS_REPO
  ) {
    throw new HTTPException(503, {
      message: "GitHub Actions not configured",
    });
  }
}

// ---------------------------------------------------------------------------
// 501 stubs — features not available in Cloudflare mode
// ---------------------------------------------------------------------------

function stub501(feature: string) {
  return {
    error: {
      code: "not_available",
      message: `${feature} is not available in Cloudflare mode`,
    },
  };
}

operationsRoutes.get("/qb/torrents", (c) =>
  c.json(stub501("qBittorrent torrent list"), 501),
);

operationsRoutes.get("/pikpak/queue", (c) =>
  c.json(stub501("PikPak queue"), 501),
);

operationsRoutes.post("/pikpak/transfer", (c) =>
  c.json(stub501("PikPak transfer"), 501),
);

operationsRoutes.post("/email/test", (c) =>
  c.json(stub501("Email test"), 501),
);

operationsRoutes.get("/email/history", (c) =>
  c.json(stub501("Email history"), 501),
);

operationsRoutes.post("/email/:id/resend", (c) =>
  c.json(stub501("Email resend"), 501),
);

operationsRoutes.post("/cleanup/claim-stages", (c) =>
  c.json(stub501("Claim stages cleanup"), 501),
);

// ---------------------------------------------------------------------------
// GH Actions dispatch routes — admin + CSRF + requireGhActions
// ---------------------------------------------------------------------------

// POST /qb/filter-small — dispatch QBFileFilter workflow
operationsRoutes.post("/qb/filter-small", requireRole("admin"), async (c) => {
  requireGhActions(c.env);

  const body = await c.req.json<{
    min_size_mb?: number;
    days?: number;
    dry_run?: boolean;
  }>();

  const inputs: Record<string, string> = {};
  if (body.min_size_mb !== undefined) {
    inputs.min_size_mb = String(body.min_size_mb);
  }
  if (body.days !== undefined) {
    inputs.days = String(body.days);
  }
  if (body.dry_run !== undefined) {
    inputs.dry_run = String(body.dry_run);
  }

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.create("qb-filter", "QBFileFilter.yml", inputs);

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("QBFileFilter.yml", inputs);

  return c.json(
    { job_id: job.job_id, status: job.status, created_at: job.created_at },
    201,
  );
});

// POST /rclone/run — dispatch RcloneManager workflow
operationsRoutes.post("/rclone/run", requireRole("admin"), async (c) => {
  requireGhActions(c.env);

  const body = await c.req.json<{
    scan?: boolean;
    report?: boolean;
    execute?: boolean;
    root_path?: string;
    dry_run?: boolean;
    incremental?: boolean;
  }>();

  const inputs: Record<string, string> = {};
  if (body.scan) inputs.scan = "true";
  if (body.report) inputs.report = "true";
  if (body.execute) inputs.execute = "true";
  if (body.root_path) inputs.root_path = body.root_path;
  if (body.dry_run) inputs.dry_run = "true";
  if (body.incremental) inputs.incremental = "true";

  const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
  const job = await repo.create("rclone", "RcloneManager.yml", inputs);

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow("RcloneManager.yml", inputs);

  return c.json(
    { job_id: job.job_id, status: job.status, created_at: job.created_at },
    201,
  );
});

// POST /cleanup/stale-sessions — dispatch StaleSessionCleanup workflow
operationsRoutes.post(
  "/cleanup/stale-sessions",
  requireRole("admin"),
  async (c) => {
    requireGhActions(c.env);

    const body = await c.req.json<{
      max_age_hours?: number;
      apply?: boolean;
      scope?: string;
    }>();

    const inputs: Record<string, string> = {};
    if (body.max_age_hours !== undefined) {
      inputs.max_age_hours = String(body.max_age_hours);
    }
    if (body.apply) inputs.apply = "true";
    if (body.scope) inputs.scope = body.scope;

    const repo = createJobRunsRepo(c.env.OPERATIONS_DB);
    const job = await repo.create(
      "cleanup",
      "StaleSessionCleanup.yml",
      inputs,
    );

    const gh = createGhClient({
      token: c.env.GH_ACTIONS_TOKEN!,
      repo: c.env.GH_ACTIONS_REPO!,
    });
    await gh.dispatchWorkflow("StaleSessionCleanup.yml", inputs);

    return c.json(
      { job_id: job.job_id, status: job.status, created_at: job.created_at },
      201,
    );
  },
);

// ---------------------------------------------------------------------------
// D1 query routes
// ---------------------------------------------------------------------------

// GET /rclone/last — latest rclone inventory/dedup summary
operationsRoutes.get("/rclone/last", async (c) => {
  const db = c.env.OPERATIONS_DB;

  let inventoryCount = 0;
  let dedupCount = 0;
  let lastDedupAt: string | null = null;

  try {
    const inv = await db
      .prepare("SELECT COUNT(*) AS cnt FROM RcloneInventory")
      .first<{ cnt: number }>();
    if (inv) inventoryCount = inv.cnt;
  } catch {
    // Table may not exist — return 0
  }

  try {
    const ded = await db
      .prepare(
        "SELECT COUNT(*) AS cnt, MAX(CreatedAt) AS last_at FROM DedupRecords",
      )
      .first<{ cnt: number; last_at: string | null }>();
    if (ded) {
      dedupCount = ded.cnt;
      lastDedupAt = ded.last_at ?? null;
    }
  } catch {
    // Table may not exist — return 0/null
  }

  return c.json({
    inventory_count: inventoryCount,
    dedup_count: dedupCount,
    last_dedup_at: lastDedupAt,
  });
});
