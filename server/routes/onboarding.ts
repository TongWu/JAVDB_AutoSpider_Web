import { dispatchJob } from "../services/workflow-launch";
import { resolveDispatchConfig, isDispatchConfigured } from "../services/dispatch-config";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore } from "../services/config-store";
import { upsertSystemState } from "../services/system-state-store";

type OnbEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const onboardingRoutes = new Hono<OnbEnv>();

const REQUIRED_COMPONENTS = ["javdb_session", "qb"] as const;
const SKIPPABLE_COMPONENTS = ["smtp", "pikpak", "rclone", "proxy"] as const;

function isConfigured(component: string, config: Record<string, unknown>): boolean {
  switch (component) {
    case "javdb_session":
      return !!(config.JAVDB_SESSION_COOKIE || config.JAVDB_USERNAME);
    case "qb":
      return !!config.QB_URL;
    case "smtp":
      return !!(config.SMTP_HOST || config.SMTP_SERVER);
    case "pikpak":
      return !!(config.PIKPAK_EMAIL || config.PIKPAK_USERNAME);
    case "rclone":
      return !!(config.RCLONE_FOLDER_PATH || config.RCLONE_REMOTE);
    case "proxy": {
      const mode = String(config.PROXY_MODE ?? "").toLowerCase();
      if ((mode === "pool" || mode === "single") && (config.PROXY_HTTP || config.PROXY_POOL)) return true;
      return !!(config.PROXY_HTTP || config.PROXY_POOL);
    }
    default:
      return false;
  }
}

async function getOnboardedFlag(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM system_state WHERE key = ?").bind("onboarded").first<{ value: string }>();
  return row?.value === "true";
}

async function buildStatus(env: Env) {
  const config = await loadConfigStore(env.OPERATIONS_DB, env.SECRETS_ENCRYPTION_KEY);
  const completed = await getOnboardedFlag(env.OPERATIONS_DB);
  return {
    completed,
    required_missing: REQUIRED_COMPONENTS.filter((c) => !isConfigured(c, config)),
    skippable_missing: SKIPPABLE_COMPONENTS.filter((c) => !isConfigured(c, config)),
  };
}

function isGhActionsConfigured(env: Env): boolean {
  return isDispatchConfigured(resolveDispatchConfig(env));
}

type TestableComponent = "javdb" | "qb" | "proxy" | "smtp";

const COMPONENT_WORKFLOW_MAP: Record<string, { workflow: string; inputs: Record<string, string> } | null> = {
  qb: { workflow: "TestIngestion.yml", inputs: { runner: "self-hosted" } },
  proxy: { workflow: "TestIngestion.yml", inputs: { runner: "self-hosted", proxy_spider: "true" } },
  smtp: null,
};

async function testComponent(
  component: TestableComponent,
  config: Record<string, unknown>,
  env: Env,
): Promise<{ ok?: boolean; status?: string; message: string; details: Record<string, unknown> | null; job_id?: string; config_snapshot_status?: "captured" | "snapshot_unavailable" }> {
  switch (component) {
    case "javdb": {
      const cookie = config.JAVDB_SESSION_COOKIE;
      if (!cookie) return { ok: false, message: "JAVDB_SESSION_COOKIE not set", details: null };
      return { ok: true, message: "cookie present", details: { length: String(cookie).length } };
    }
    case "qb":
    case "proxy": {
      const mapping = COMPONENT_WORKFLOW_MAP[component];
      if (!mapping) {
        return { status: "unavailable", message: `${component} connectivity test workflow not yet available`, details: null };
      }
      if (!isGhActionsConfigured(env)) {
        return { status: "unavailable", message: "GitHub Actions not configured", details: null };
      }
      let job;
      try {
        job = await dispatchJob(env, `test-${component}`, mapping.workflow, mapping.inputs);
      } catch {
        console.error("onboarding dispatch failed");
        return { status: "unavailable", message: `${component} connectivity test unavailable (dispatch failed)`, details: null };
      }
      return {
        status: "dispatched",
        job_id: job.job_id,
        config_snapshot_status: job.config_snapshot_status,
        message: `Dispatched ${mapping.workflow} for ${component} connectivity test`,
        details: { job_id: job.job_id, poll_url: `/api/tasks/${job.job_id}` },
      };
    }
    case "smtp":
      return { status: "unavailable", message: "SMTP connectivity test workflow not yet available", details: null };
    default:
      return { ok: false, message: `Unknown component: ${component}`, details: null };
  }
}

onboardingRoutes.get("/status", async (c) => {
  return c.json(await buildStatus(c.env));
});

onboardingRoutes.post("/test", async (c) => {
  const body = await c.req.json<{ component: string }>();
  const validComponents = ["javdb", "qb", "proxy", "smtp"];
  if (!validComponents.includes(body.component)) {
    throw new HTTPException(422, { message: `Invalid component: ${body.component}` });
  }
  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const result = await testComponent(body.component as TestableComponent, config, c.env);
  return c.json({ component: body.component, ...result });
});

onboardingRoutes.post("/complete", requireRole("admin"), async (c) => {
  await upsertSystemState(c.env.OPERATIONS_DB, "onboarded", "true");
  return c.json(await buildStatus(c.env));
});

onboardingRoutes.post("/dismiss-hint", requireRole("admin"), async (c) => {
  const body = await c.req.json<{ hint_id: string }>();
  if (!body.hint_id || body.hint_id.length > 64) {
    throw new HTTPException(422, { message: "hint_id required (max 64 chars)" });
  }

  const db = c.env.OPERATIONS_DB;
  const row = await db.prepare("SELECT value FROM system_state WHERE key = ?").bind("dismissed_hints").first<{ value: string }>();
  let hints: string[] = [];
  if (row?.value) {
    try {
      hints = JSON.parse(row.value);
    } catch {
      hints = [];
    }
  }

  if (!hints.includes(body.hint_id)) {
    hints.push(body.hint_id);
    await upsertSystemState(db, "dismissed_hints", JSON.stringify(hints));
  }

  return c.json({ dismissed_hints: hints });
});
