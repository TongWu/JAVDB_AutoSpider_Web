import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";
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
  const raw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isNaN(raw) ? 50 : Math.max(1, Math.min(200, raw));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);

  const { items, total } = await listWatchIntents(c.env.HISTORY_DB, status, limit, offset);
  return c.json({ items, total });
});

// PUT /:videoCode — upsert a watch intent.
watchlistRoutes.put("/:videoCode", async (c) => {
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

// DELETE /:videoCode — un-track.
watchlistRoutes.delete("/:videoCode", async (c) => {
  const deleted = await deleteWatchIntent(c.env.HISTORY_DB, c.req.param("videoCode"));
  return c.json({ deleted });
});
