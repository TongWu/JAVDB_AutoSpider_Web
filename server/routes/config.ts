import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import { loadConfigStore, saveConfigKeys, maskConfig, mergeWithDefaults } from "../services/config-store";
import { CONFIG_META_FIELDS, SENSITIVE_KEYS } from "../services/config-schema";

type ConfigEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const configRoutes = new Hono<ConfigEnv>();

configRoutes.get("/", async (c) => {
  const includeSecrets = c.req.query("include_secrets") === "true";
  const user = c.get("user");

  if (includeSecrets && user.role !== "admin") {
    throw new HTTPException(403, { message: "include_secrets requires admin role" });
  }

  const storeValues = await loadConfigStore(c.env.OPERATIONS_DB, c.env.SECRETS_ENCRYPTION_KEY);
  const merged = mergeWithDefaults(storeValues);

  if (includeSecrets) {
    return c.json(merged);
  }
  return c.json(maskConfig(merged));
});

configRoutes.get("/meta", async (c) => {
  return c.json({ fields: CONFIG_META_FIELDS });
});

configRoutes.put("/", requireRole("admin"), async (c) => {
  const updates = await c.req.json<Record<string, unknown>>();
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    const field = CONFIG_META_FIELDS.find((f) => f.key === key);
    if (!field) {
      throw new HTTPException(422, { message: `Unknown config key: ${key}` });
    }
    if (field.readonly) {
      throw new HTTPException(422, { message: `${key} is read-only` });
    }
    if (SENSITIVE_KEYS.has(key) && value === "********") {
      continue;
    }
    filtered[key] = value;
  }

  if (Object.keys(filtered).length > 0) {
    await saveConfigKeys(c.env.OPERATIONS_DB, filtered, c.env.SECRETS_ENCRYPTION_KEY);
  }

  return c.json({ status: "ok" });
});
