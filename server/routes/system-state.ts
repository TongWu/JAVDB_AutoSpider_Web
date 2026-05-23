import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";

type StateEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const systemStateRoutes = new Hono<StateEnv>();

systemStateRoutes.get("/state", async (c) => {
  const key = c.req.query("key");
  if (!key) {
    throw new HTTPException(400, { message: "key query parameter required" });
  }

  const row = await c.env.OPERATIONS_DB
    .prepare("SELECT value FROM system_state WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();

  return c.json({ key, value: row?.value ?? null });
});

systemStateRoutes.put("/state", requireRole("admin"), async (c) => {
  const body = await c.req.json<{ key: string; value: string }>();
  if (!body.key || body.value === undefined) {
    throw new HTTPException(400, { message: "key and value required" });
  }

  await c.env.OPERATIONS_DB
    .prepare(
      `INSERT INTO system_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                       updated_at = datetime('now')`
    )
    .bind(body.key, body.value)
    .run();

  return c.json({ key: body.key, value: body.value });
});
