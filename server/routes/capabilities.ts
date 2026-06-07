import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type CapEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const capabilitiesRoutes = new Hono<CapEnv>();

function envBool(val: string | undefined): boolean {
  return val === "true" || val === "1" || val === "yes";
}

/** True when the ADR-033 AcquisitionOutcome table is queryable in OPERATIONS_DB (capability honesty). */
async function closedLoopEnabled(env: Env): Promise<boolean> {
  try {
    await env.OPERATIONS_DB.prepare("SELECT 1 FROM AcquisitionOutcome LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

capabilitiesRoutes.get("/", async (c) => {
  const env = c.env;
  const closed_loop = await closedLoopEnabled(env);

  return c.json({
    version: "2.0.0",
    ingestion_mode: env.INGESTION_MODE ?? "local",
    gh_actions: {
      tier: env.GH_ACTIONS_TIER ?? "none",
      repo: env.GH_ACTIONS_REPO ?? null,
      token_configured: !!env.GH_ACTIONS_TOKEN,
    },
    storage_backend: "d1",
    features: {
      pikpak: envBool(env.FEATURE_PIKPAK),
      rclone: envBool(env.FEATURE_RCLONE),
      smtp: !!(env.SMTP_HOST || env.SMTP_SERVER),
      proxy_pool: true,
      javdb_login: !!env.JAVDB_USERNAME,
      proxy_preview: true,
      closed_loop,
    },
    deployment: "cloudflare",
    build: {
      frontend_version: env.FRONTEND_VERSION ?? null,
      backend_version: env.BACKEND_VERSION ?? "2.0.0",
      git_sha: "cloudflare",
    },
  });
});
