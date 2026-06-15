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

/** True when the ADR-034 OwnershipLedger table is queryable in OPERATIONS_DB (capability honesty). */
async function libraryOwnershipEnabled(env: Env): Promise<boolean> {
  try {
    await env.OPERATIONS_DB.prepare("SELECT 1 FROM OwnershipLedger LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

/** True when the ADR-034 ConsumptionSignal table is queryable in OPERATIONS_DB (capability honesty). */
async function libraryConsumptionEnabled(env: Env): Promise<boolean> {
  try {
    await env.OPERATIONS_DB.prepare("SELECT 1 FROM ConsumptionSignal LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

/** True when the ADR-054 WatchIntent table is queryable in HISTORY_DB (capability honesty). */
async function watchIntentEnabled(env: Env): Promise<boolean> {
  try {
    await env.HISTORY_DB.prepare("SELECT 1 FROM WatchIntent LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

/** True when the ADR-040 ContentFilterRule table is queryable in REPORTS_DB (capability honesty).
 *  NOTE: REPORTS_DB (javdb-reports), NOT OPERATIONS_DB or HISTORY_DB. */
async function contentFilterEnabled(env: Env): Promise<boolean> {
  try {
    await env.REPORTS_DB.prepare("SELECT 1 FROM ContentFilterRule LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

/** True when the ADR-054 ActorSubscription table is queryable in HISTORY_DB (capability honesty). */
async function subscriptionsEnabled(env: Env): Promise<boolean> {
  try {
    await env.HISTORY_DB.prepare("SELECT 1 FROM ActorSubscription LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

capabilitiesRoutes.get("/", async (c) => {
  const env = c.env;
  const closed_loop = await closedLoopEnabled(env);
  const library_ownership = await libraryOwnershipEnabled(env);
  const library_consumption = await libraryConsumptionEnabled(env);
  const watch_intent = await watchIntentEnabled(env);
  const content_filter = await contentFilterEnabled(env);
  const subscriptions = await subscriptionsEnabled(env);

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
      library_ownership,
      library_consumption,
      watch_intent,
      content_filter,
      subscriptions,
      // ADR-035 Phase 3: gates the frontend site-drift sentinel panel.
      site_drift_sentinel: true,
    },
    deployment: "cloudflare",
    build: {
      frontend_version: env.FRONTEND_VERSION ?? null,
      backend_version: env.BACKEND_VERSION ?? "2.0.0",
      git_sha: "cloudflare",
    },
  });
});
