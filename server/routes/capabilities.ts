import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type CapEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const capabilitiesRoutes = new Hono<CapEnv>();

function envBool(val: string | undefined): boolean {
  return val === "true" || val === "1" || val === "yes";
}

capabilitiesRoutes.get("/", (c) => {
  const env = c.env;

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
    },
    deployment: "cloudflare",
    build: {
      frontend_version: env.FRONTEND_VERSION ?? null,
      backend_version: env.BACKEND_VERSION ?? "2.0.0",
      git_sha: "cloudflare",
    },
  });
});
