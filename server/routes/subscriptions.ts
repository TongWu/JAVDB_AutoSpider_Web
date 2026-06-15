import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import {
  upsertSubscription,
  getSubscription,
  listSubscriptions,
  deleteSubscription,
  listNewWorks,
  dismissNewWork,
} from "../services/subscription-service";

type SubEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const subscriptionsRoutes = new Hono<SubEnv>();

const errJson = (code: string, message: string) => ({ error: { code, message } });

function normActorHref(raw: string): string {
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : trimmed;
}

function parseLimit(
  raw: string | undefined,
  def: number,
  max: number,
): { ok: true; value: number } | { ok: false; error: Response } {
  const value = raw === undefined ? def : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return {
      ok: false,
      error: Response.json(errJson("subscriptions.invalid_limit", `limit must be an integer in [1, ${max}]`), { status: 422 }),
    };
  }
  return { ok: true, value };
}

function parseOffset(
  raw: string | undefined,
): { ok: true; value: number } | { ok: false; error: Response } {
  const value = raw === undefined ? 0 : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: Response.json(errJson("subscriptions.invalid_offset", "offset must be a non-negative integer"), { status: 422 }),
    };
  }
  return { ok: true, value };
}

subscriptionsRoutes.get("/subscriptions", async (c) => {
  const limit = parseLimit(c.req.query("limit"), 200, 500);
  if (!limit.ok) return limit.error;
  const offset = parseOffset(c.req.query("offset"));
  if (!offset.ok) return offset.error;

  const activeOnly = c.req.query("active_only") === "true";
  const { items, total } = await listSubscriptions(
    c.env.HISTORY_DB,
    activeOnly,
    limit.value,
    offset.value,
  );
  return c.json({
    items: items.map((row) => ({ ...row, active: Boolean(row.active) })),
    total,
  });
});

subscriptionsRoutes.put("/subscriptions/actors/:id", requireRole("admin"), async (c) => {
  const actorHref = normActorHref(`actors/${c.req.param("id")}`);
  let body: { actor_name?: string | null; active?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("subscriptions.invalid_body", "Request body must be valid JSON"), 422);
  }
  if (body.actor_name !== undefined && body.actor_name !== null && typeof body.actor_name !== "string") {
    return c.json(errJson("subscriptions.invalid_actor_name", "actor_name must be a string or null"), 422);
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return c.json(errJson("subscriptions.invalid_active", "active must be a boolean"), 422);
  }

  const row = await upsertSubscription(
    c.env.HISTORY_DB,
    actorHref,
    body.actor_name ?? null,
    body.active === false ? 0 : 1,
  );
  return c.json({ ...row, active: Boolean(row.active) });
});

subscriptionsRoutes.get("/subscriptions/actors/:id", async (c) => {
  const row = await getSubscription(
    c.env.HISTORY_DB,
    normActorHref(`actors/${c.req.param("id")}`),
  );
  if (row === null) {
    return c.json(errJson("subscriptions.not_found", "Record not found"), 404);
  }
  return c.json({ ...row, active: Boolean(row.active) });
});

subscriptionsRoutes.delete("/subscriptions/actors/:id", requireRole("admin"), async (c) => {
  const deleted = await deleteSubscription(
    c.env.HISTORY_DB,
    normActorHref(`actors/${c.req.param("id")}`),
  );
  return c.json({ deleted });
});

subscriptionsRoutes.get("/new-works", async (c) => {
  const limit = parseLimit(c.req.query("limit"), 50, 200);
  if (!limit.ok) return limit.error;
  const offset = parseOffset(c.req.query("offset"));
  if (!offset.ok) return offset.error;

  const actorHref = c.req.query("actor_href") ?? null;
  const includeDismissed = c.req.query("include_dismissed") === "true";
  const { items, total } = await listNewWorks(
    c.env.HISTORY_DB,
    actorHref,
    includeDismissed,
    limit.value,
    offset.value,
  );
  return c.json({
    items: items.map((row) => ({ ...row, dismissed: Boolean(row.dismissed) })),
    total,
  });
});

subscriptionsRoutes.post("/new-works/:videoCode/dismiss", requireRole("admin"), async (c) => {
  const dismissed = await dismissNewWork(
    c.env.HISTORY_DB,
    c.req.param("videoCode"),
  );
  if (!dismissed) {
    return c.json(errJson("new_works.not_found", "Record not found"), 404);
  }
  return c.json({ dismissed: true });
});
