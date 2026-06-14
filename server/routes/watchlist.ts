import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
import { requireRole } from "../middleware/auth";
import {
  upsertWatchIntent,
  getWatchIntent,
  listWatchIntents,
  deleteWatchIntent,
} from "../services/watchlist-service";

type WatchEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const watchlistRoutes = new Hono<WatchEnv>();

const VALID_STATUS = new Set(["want", "viewed"]);
const errJson = (code: string, message: string) => ({ error: { code, message } });

// GET / — list, optionally filtered by status.
watchlistRoutes.get("/", async (c) => {
  const status = c.req.query("status") ?? null;
  if (status && !VALID_STATUS.has(status)) {
    return c.json(errJson("watchlist.invalid_status", "status must be one of: want, viewed"), 422);
  }
  // Reject malformed pagination with 422 (mirrors the Python Query(ge=1, le=200)
  // / Query(ge=0) validation) rather than silently coercing.
  const limitQ = c.req.query("limit");
  const offsetQ = c.req.query("offset");
  const limit = limitQ === undefined ? 50 : Number(limitQ);
  const offset = offsetQ === undefined ? 0 : Number(offsetQ);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return c.json(errJson("watchlist.invalid_limit", "limit must be an integer in [1, 200]"), 422);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return c.json(errJson("watchlist.invalid_offset", "offset must be a non-negative integer"), 422);
  }

  const { items, total } = await listWatchIntents(c.env.HISTORY_DB, status, limit, offset);
  return c.json({ items, total });
});

// PUT /:videoCode — upsert a watch intent. Mutations are admin-only (a
// readonly account must not modify shared watch-intent data).
watchlistRoutes.put("/:videoCode", requireRole("admin"), async (c) => {
  const videoCode = c.req.param("videoCode");
  let body: { href?: string; status?: string; notes?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errJson("watchlist.invalid_body", "Request body must be valid JSON"), 422);
  }
  if (typeof body.href !== "string" || body.href.length === 0) {
    return c.json(errJson("watchlist.invalid_href", "href is required"), 422);
  }
  if (!body.status || !VALID_STATUS.has(body.status)) {
    return c.json(errJson("watchlist.invalid_status", "status must be one of: want, viewed"), 422);
  }
  const row = await upsertWatchIntent(c.env.HISTORY_DB, videoCode, body.href, body.status, body.notes ?? null);
  return c.json(row);
});

// GET /:videoCode — one watch intent.
watchlistRoutes.get("/:videoCode", async (c) => {
  const row = await getWatchIntent(c.env.HISTORY_DB, c.req.param("videoCode"));
  if (row === null) {
    return c.json(errJson("watchlist.not_found", "Record not found"), 404);
  }
  return c.json(row);
});

// DELETE /:videoCode — un-track. Admin-only (see PUT).
watchlistRoutes.delete("/:videoCode", requireRole("admin"), async (c) => {
  const deleted = await deleteWatchIntent(c.env.HISTORY_DB, c.req.param("videoCode"));
  return c.json({ deleted });
});
