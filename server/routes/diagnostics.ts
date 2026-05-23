import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore, saveConfigKeys } from "../services/config-store";

type DiagEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const diagnosticsRoutes = new Hono<DiagEnv>();

function cookiePreview(cookie: string): string {
  return cookie.length > 8 ? cookie.slice(0, 8) + "..." : cookie;
}

function isRefreshRecent(lastRefreshTime: string | null, maxAgeHours = 24): boolean {
  if (!lastRefreshTime) return false;
  try {
    const dt = new Date(lastRefreshTime);
    const age = Date.now() - dt.getTime();
    return age >= 0 && age < maxAgeHours * 3600 * 1000;
  } catch {
    return false;
  }
}

diagnosticsRoutes.get("/javdb-session", async (c) => {
  const config = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const cookie = String(config.JAVDB_SESSION_COOKIE ?? "");

  const row = await c.env.OPERATIONS_DB
    .prepare("SELECT value FROM system_state WHERE key = ?")
    .bind("last_javdb_refresh")
    .first<{ value: string }>();
  const lastRefresh = row?.value ?? null;

  return c.json({
    cookie_present: !!cookie,
    cookie_value_preview: cookie ? cookiePreview(cookie) : null,
    last_refresh_time: lastRefresh,
    estimated_expiry: null,
    is_likely_valid: !!cookie && isRefreshRecent(lastRefresh),
  });
});

diagnosticsRoutes.post("/javdb-session/refresh", requireRole("admin"), async (c) => {
  const body = await c.req.json<{ method: string; cookie_value?: string | null }>();

  if (body.method === "cookie_paste") {
    const cookieValue = (body.cookie_value ?? "").trim();
    if (!cookieValue) {
      throw new HTTPException(422, { message: "cookie_value is required when method='cookie_paste'" });
    }

    await saveConfigKeys(c.env.OPERATIONS_DB, { JAVDB_SESSION_COOKIE: cookieValue }, c.env.SECRETS_ENCRYPTION_KEY);

    try {
      await c.env.OPERATIONS_DB
        .prepare(
          `INSERT INTO system_state (key, value, updated_at) VALUES ('last_javdb_refresh', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        )
        .bind(new Date().toISOString())
        .run();
    } catch {
      // best-effort timestamp write
    }

    return c.json({
      success: true,
      method: "cookie_paste",
      new_cookie_preview: cookiePreview(cookieValue),
    });
  }

  if (body.method === "headless") {
    return c.json({
      success: false,
      method: "headless",
      error: "Headless login unavailable in Cloudflare mode. Use cookie_paste or dispatch via GH Actions.",
    });
  }

  throw new HTTPException(422, { message: `Unknown method: '${body.method}'. Must be 'headless' or 'cookie_paste'.` });
});
