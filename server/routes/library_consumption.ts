// server/routes/library_consumption.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type LibEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const libraryConsumptionRoutes = new Hono<LibEnv>();

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// ── Pure SQL builders (byte-for-byte mirror of Python; pinned by the golden) ──

export function buildConsumptionSummaryQuery(): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT " +
    "COUNT(*) AS total_signals, " +
    "COALESCE(SUM(CASE WHEN watched = 1 THEN 1 ELSE 0 END), 0) AS watched_count, " +
    "COALESCE(SUM(CASE WHEN watched = 0 THEN 1 ELSE 0 END), 0) AS unwatched_count, " +
    "AVG(rating) AS avg_rating, " +
    "COUNT(DISTINCT video_code) AS unique_titles, " +
    "COUNT(DISTINCT instance) AS instance_count " +
    "FROM ConsumptionSignal";
  return { sql, bindings: [] };
}

export function buildConsumptionSummaryUnresolvedCountQuery(): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT COUNT(*) AS unresolved_count " +
    "FROM UnresolvedMediaItem";
  return { sql, bindings: [] };
}

export function buildConsumptionRecentQuery(p: {
  instance?: string | null;
  watched?: boolean | null;
  limit: number;
  offset: number;
}): { sql: string; bindings: (string | number)[] } {
  const bindings: (string | number)[] = [];
  const clauses: string[] = [];
  if (p.instance != null) {
    clauses.push("instance = ?");
    bindings.push(p.instance);
  }
  if (p.watched === true) {
    clauses.push("watched = 1");
  } else if (p.watched === false) {
    clauses.push("watched = 0");
  }
  const where = clauses.length > 0 ? "WHERE " + clauses.join(" AND ") + " " : "";
  const sql =
    "SELECT video_code, source_type, instance, library_id, library_name, " +
    "watched, progress_pct, play_count, rating, watched_at, resolved_confidence, observed_at " +
    "FROM ConsumptionSignal " +
    where +
    "ORDER BY observed_at DESC " +
    "LIMIT ? OFFSET ?";
  bindings.push(p.limit, p.offset);
  return { sql, bindings };
}

export function buildConsumptionTrendQuery(p: { cutoff: string }): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT substr(watched_at, 1, 10) AS d, " +
    "COALESCE(SUM(CASE WHEN watched = 1 THEN 1 ELSE 0 END), 0) AS watched, " +
    "COUNT(*) AS total_signals " +
    "FROM ConsumptionSignal " +
    "WHERE watched_at IS NOT NULL AND watched_at >= ? " +
    "GROUP BY d ORDER BY d";
  return { sql, bindings: [p.cutoff] };
}

export function buildConsumptionUnresolvedQuery(p: {
  instance?: string | null;
  limit: number;
  offset: number;
}): { sql: string; bindings: (string | number)[] } {
  const bindings: (string | number)[] = [];
  let where = "";
  if (p.instance != null) {
    where = "WHERE instance = ? ";
    bindings.push(p.instance);
  }
  const sql =
    "SELECT instance, source_type, library_id, library_name, item_id, raw_title, file_path, observed_at " +
    "FROM UnresolvedMediaItem " +
    where +
    "ORDER BY observed_at DESC " +
    "LIMIT ? OFFSET ?";
  bindings.push(p.limit, p.offset);
  return { sql, bindings };
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function badRequest(code: string, message: string): HTTPException {
  return new HTTPException(400, { message: JSON.stringify({ error: { code, message } }) });
}

// ── Routes (JWT auth inherited from app.use("/api/*", requireAuth())) ─────────

libraryConsumptionRoutes.get("/consumption/summary", async (c) => {
  const { sql: sqlSig, bindings: b1 } = buildConsumptionSummaryQuery();
  const { sql: sqlUnres, bindings: b2 } = buildConsumptionSummaryUnresolvedCountQuery();
  const [sigResult, unresResult] = await Promise.all([
    c.env.OPERATIONS_DB.prepare(sqlSig).bind(...b1).first<{
      total_signals: number; watched_count: number; unwatched_count: number;
      avg_rating: number | null; unique_titles: number; instance_count: number;
    }>(),
    c.env.OPERATIONS_DB.prepare(sqlUnres).bind(...b2).first<{ unresolved_count: number }>(),
  ]);
  return c.json({
    total_signals: sigResult?.total_signals ?? 0,
    watched_count: sigResult?.watched_count ?? 0,
    unwatched_count: sigResult?.unwatched_count ?? 0,
    avg_rating: sigResult?.avg_rating ?? null,
    unique_titles: sigResult?.unique_titles ?? 0,
    instance_count: sigResult?.instance_count ?? 0,
    unresolved_count: unresResult?.unresolved_count ?? 0,
  });
});

libraryConsumptionRoutes.get("/consumption/recent", async (c) => {
  const instance = c.req.query("instance") ?? null;
  const watchedParam = c.req.query("watched") ?? null;
  // Parse boolean string: "true" → true, "false" → false, absent → null
  const watched: boolean | null =
    watchedParam === "true" ? true : watchedParam === "false" ? false : null;
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const { sql, bindings } = buildConsumptionRecentQuery({ instance, watched, limit, offset });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{
      video_code: string; source_type: string; instance: string; library_id: string;
      library_name: string | null; watched: number | null; progress_pct: number | null;
      play_count: number | null; rating: number | null; watched_at: string | null;
      resolved_confidence: string | null; observed_at: string | null;
    }>();
  // Convert watched INTEGER (0/1/null) to boolean/null for the response
  return c.json(
    (results ?? []).map((r) => ({
      ...r,
      watched: r.watched === null ? null : Boolean(r.watched),
    })),
  );
});

libraryConsumptionRoutes.get("/consumption/trend", async (c) => {
  const period = c.req.query("period") ?? "30d";
  if (!Object.prototype.hasOwnProperty.call(PERIOD_DAYS, period)) {
    throw badRequest("library.invalid_period", `Invalid period: ${period}`);
  }
  const cutoff = isoDateDaysAgo(PERIOD_DAYS[period]);
  const { sql, bindings } = buildConsumptionTrendQuery({ cutoff });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{ d: string; watched: number; total_signals: number }>();
  return c.json(
    (results ?? []).map((r) => ({
      date: r.d, watched: r.watched, total_signals: r.total_signals,
    })),
  );
});

libraryConsumptionRoutes.get("/consumption/unresolved", async (c) => {
  const instance = c.req.query("instance") ?? null;
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const { sql, bindings } = buildConsumptionUnresolvedQuery({ instance, limit, offset });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{
      instance: string; source_type: string | null; library_id: string;
      library_name: string | null; item_id: string;
      raw_title: string | null; file_path: string | null; observed_at: string | null;
    }>();
  return c.json(results ?? []);
});
