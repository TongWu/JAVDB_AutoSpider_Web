import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { createGhClient } from "../services/gh-client";

type GhActionsEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const ghActionsRoutes = new Hono<GhActionsEnv>();

type Tier = "none" | "monitor" | "edit" | "admin";
const TIER_LEVELS: Record<Tier, number> = { none: 0, monitor: 1, edit: 2, admin: 3 };

function checkTier(env: Env, required: Tier): void {
  const current = (env.GH_ACTIONS_TIER ?? "none") as Tier;
  if (TIER_LEVELS[current] < TIER_LEVELS[required] || !env.GH_ACTIONS_TOKEN || !env.GH_ACTIONS_REPO) {
    throw new HTTPException(503, {
      message: JSON.stringify({
        error: {
          code: "gh_actions.unavailable",
          message: `Requires GH Actions tier '${required}' or higher`,
        },
      }),
    });
  }
}

// GET /workflows — list all workflows
ghActionsRoutes.get("/workflows", async (c) => {
  checkTier(c.env, "monitor");

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  const data = await gh.listWorkflows();
  return c.json(data);
});

// GET /runs — list workflow runs
ghActionsRoutes.get("/runs", async (c) => {
  checkTier(c.env, "monitor");

  const workflowId = c.req.query("workflow_id");
  const perPageParam = c.req.query("per_page");
  const pageParam = c.req.query("page");

  let perPage = 30;
  if (perPageParam) {
    const parsed = parseInt(perPageParam, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      perPage = Math.min(parsed, 100);
    }
  }

  let page = 1;
  if (pageParam) {
    const parsed = parseInt(pageParam, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      page = parsed;
    }
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  const data = await gh.listRuns({
    workflow_id: workflowId ? parseInt(workflowId, 10) : undefined,
    per_page: perPage,
    page,
  });
  return c.json(data);
});

// POST /runs — dispatch a workflow
ghActionsRoutes.post("/runs", requireRole("admin"), async (c) => {
  checkTier(c.env, "admin");

  const body = await c.req.json<{
    workflow?: string;
    inputs?: Record<string, string>;
    ref?: string;
  }>();

  if (!body.workflow) {
    throw new HTTPException(400, { message: "workflow is required" });
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.dispatchWorkflow(body.workflow, body.inputs ?? {}, body.ref ?? "main");

  return c.json({ dispatched: true, workflow: body.workflow }, 201);
});

// GET /runs/:run_id/logs — get logs URL for a run
ghActionsRoutes.get("/runs/:run_id/logs", async (c) => {
  checkTier(c.env, "monitor");

  const runIdParam = c.req.param("run_id");
  const runId = parseInt(runIdParam, 10);
  if (isNaN(runId)) {
    throw new HTTPException(400, { message: "run_id must be a number" });
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  const logsUrl = await gh.getRunLogsUrl(runId);
  return c.json({ logs_url: logsUrl });
});

// GET /workflows/:name — get workflow YAML content
ghActionsRoutes.get("/workflows/:name", async (c) => {
  checkTier(c.env, "edit");

  const name = c.req.param("name");

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  const data = await gh.getWorkflowContent(name);
  return c.json(data);
});

// PUT /workflows/:name — update workflow YAML content
ghActionsRoutes.put("/workflows/:name", requireRole("admin"), async (c) => {
  checkTier(c.env, "admin");

  const name = c.req.param("name");
  const body = await c.req.json<{
    content?: string;
    sha?: string;
    message?: string;
  }>();

  if (!body.content || !body.sha) {
    throw new HTTPException(400, { message: "content and sha are required" });
  }

  const gh = createGhClient({
    token: c.env.GH_ACTIONS_TOKEN!,
    repo: c.env.GH_ACTIONS_REPO!,
  });
  await gh.updateWorkflowContent(
    name,
    body.content,
    body.sha,
    body.message ?? `Update workflow ${name}`,
  );

  return c.json({ updated: true });
});
