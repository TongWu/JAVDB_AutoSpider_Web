// server/routes/library.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type LibEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const libraryRoutes = new Hono<LibEnv>();

// in_library is Phase-2-gated but a valid enum value — accept it.
const ACQUISITION_STATES = [
  "queued", "downloading", "completed", "in_library", "stalled", "failed",
];
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// ── Pure SQL builders (byte-for-byte mirror of Python; pinned by the golden) ──

export function buildAcquisitionSummaryQuery(): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT " +
    "COALESCE(SUM(CASE WHEN state='queued' THEN 1 ELSE 0 END), 0) AS queued, " +
    "COALESCE(SUM(CASE WHEN state='downloading' THEN 1 ELSE 0 END), 0) AS downloading, " +
    "COALESCE(SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END), 0) AS completed, " +
    "COALESCE(SUM(CASE WHEN state='stalled' THEN 1 ELSE 0 END), 0) AS stalled, " +
    "COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), 0) AS failed, " +
    "COUNT(*) AS total " +
    "FROM AcquisitionOutcome";
  return { sql, bindings: [] };
}

export function buildAcquisitionRecentQuery(p: {
  state?: string | null;
  limit: number;
  offset: number;
}): { sql: string; bindings: (string | number)[] } {
  const bindings: (string | number)[] = [];
  let where = "";
  if (p.state != null) {
    where = "WHERE state = ? ";
    bindings.push(p.state);
  }
  const sql =
    "SELECT qb_hash, video_code, href, category, state, queued_at, completed_at, last_seen_at " +
    "FROM AcquisitionOutcome " +
    where +
    "ORDER BY queued_at DESC " +
    "LIMIT ? OFFSET ?";
  bindings.push(p.limit, p.offset);
  return { sql, bindings };
}

export function buildAcquisitionTrendQuery(p: { cutoff: string }): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT substr(last_seen_at, 1, 10) AS d, " +
    "COALESCE(SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END), 0) AS completed, " +
    "COALESCE(SUM(CASE WHEN state='stalled' THEN 1 ELSE 0 END), 0) AS stalled, " +
    "COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END), 0) AS failed " +
    "FROM AcquisitionOutcome " +
    "WHERE state IN ('completed','stalled','failed') AND last_seen_at >= ? " +
    "GROUP BY d ORDER BY d";
  return { sql, bindings: [p.cutoff] };
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function badRequest(code: string, message: string): HTTPException {
  return new HTTPException(400, { message: JSON.stringify({ error: { code, message } }) });
}

// ── Routes (JWT auth inherited from app.use("/api/*", requireAuth())) ─────────

libraryRoutes.get("/acquisition/summary", async (c) => {
  const { sql, bindings } = buildAcquisitionSummaryQuery();
  const row = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .first<{
      queued: number; downloading: number; completed: number;
      stalled: number; failed: number; total: number;
    }>();
  // in_library is Phase-2-gated: rows count toward total (COUNT(*)) but have no named bucket.
  return c.json(
    row ?? { queued: 0, downloading: 0, completed: 0, stalled: 0, failed: 0, total: 0 },
  );
});

libraryRoutes.get("/acquisition/recent", async (c) => {
  const state = c.req.query("state") ?? null;
  if (state !== null && !ACQUISITION_STATES.includes(state)) {
    throw badRequest("library.invalid_state", `Invalid state: ${state}`);
  }
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const { sql, bindings } = buildAcquisitionRecentQuery({ state, limit, offset });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{
      qb_hash: string; video_code: string | null; href: string;
      category: string | null; state: string;
      queued_at: string | null; completed_at: string | null; last_seen_at: string | null;
    }>();
  return c.json(results ?? []);
});

libraryRoutes.get("/acquisition/trend", async (c) => {
  const period = c.req.query("period") ?? "30d";
  if (!(period in PERIOD_DAYS)) {
    throw badRequest("library.invalid_period", `Invalid period: ${period}`);
  }
  const cutoff = isoDateDaysAgo(PERIOD_DAYS[period]);
  const { sql, bindings } = buildAcquisitionTrendQuery({ cutoff });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{ d: string; completed: number; stalled: number; failed: number }>();
  return c.json(
    (results ?? []).map((r) => ({
      date: r.d, completed: r.completed, stalled: r.stalled, failed: r.failed,
    })),
  );
});
