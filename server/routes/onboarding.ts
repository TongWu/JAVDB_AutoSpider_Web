import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore } from "../services/config-store";

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

type TestableComponent = "javdb" | "qb" | "proxy" | "smtp";

async function testComponent(
  component: TestableComponent,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; message: string; details: Record<string, unknown> | null }> {
  switch (component) {
    case "javdb": {
      const cookie = config.JAVDB_SESSION_COOKIE;
      if (!cookie) return { ok: false, message: "JAVDB_SESSION_COOKIE not set", details: null };
      return { ok: true, message: "cookie present", details: { length: String(cookie).length } };
    }
    case "qb":
      return { ok: false, message: "qB connectivity test unavailable in Cloudflare mode", details: null };
    case "proxy":
      return { ok: false, message: "Proxy test unavailable in Cloudflare mode", details: null };
    case "smtp":
      return { ok: false, message: "SMTP test unavailable in Cloudflare mode", details: null };
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
  const result = await testComponent(body.component as TestableComponent, config);
  return c.json({ component: body.component, ...result });
});

onboardingRoutes.post("/complete", requireRole("admin"), async (c) => {
  await c.env.OPERATIONS_DB
    .prepare(
      `INSERT INTO system_state (key, value, updated_at) VALUES ('onboarded', 'true', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`,
    )
    .run();
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
    await db
      .prepare(
        `INSERT INTO system_state (key, value, updated_at) VALUES ('dismissed_hints', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .bind(JSON.stringify(hints))
      .run();
  }

  return c.json({ dismissed_hints: hints });
});
