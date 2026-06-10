// server/routes/library_ownership.ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type LibEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const libraryOwnershipRoutes = new Hono<LibEnv>();

const OWNERSHIP_SOURCES = ["qb", "nas", "gdrive", "pikpak"];

// ── Pure SQL builders (byte-for-byte mirror of Python; pinned by the golden) ──

export function buildOwnershipSummaryBySourceQuery(): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT source, " +
    "COUNT(DISTINCT video_code) AS unique_titles, " +
    "COALESCE(SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END), 0) AS present_rows, " +
    "COALESCE(SUM(size), 0) AS total_bytes " +
    "FROM OwnershipLedger " +
    "WHERE present = 1 " +
    "GROUP BY source " +
    "ORDER BY source";
  return { sql, bindings: [] };
}

export function buildOwnershipSummaryDistinctQuery(): {
  sql: string;
  bindings: (string | number)[];
} {
  const sql =
    "SELECT COUNT(DISTINCT video_code) AS total_owned_titles " +
    "FROM OwnershipLedger " +
    "WHERE present = 1";
  return { sql, bindings: [] };
}

export function buildOwnershipRecentQuery(p: {
  source?: string | null;
  limit: number;
  offset: number;
}): { sql: string; bindings: (string | number)[] } {
  const bindings: (string | number)[] = [];
  let where = "";
  if (p.source != null) {
    where = "WHERE source = ? ";
    bindings.push(p.source);
  }
  const sql =
    "SELECT video_code, source, category, path, size, present, observed_at " +
    "FROM OwnershipLedger " +
    where +
    "ORDER BY observed_at DESC " +
    "LIMIT ? OFFSET ?";
  bindings.push(p.limit, p.offset);
  return { sql, bindings };
}

function badRequest(code: string, message: string): HTTPException {
  return new HTTPException(400, { message: JSON.stringify({ error: { code, message } }) });
}

// ── Routes (JWT auth inherited from app.use("/api/*", requireAuth())) ─────────

libraryOwnershipRoutes.get("/ownership/summary", async (c) => {
  const { sql: sqlPerSource, bindings: b1 } = buildOwnershipSummaryBySourceQuery();
  const { sql: sqlDistinct, bindings: b2 } = buildOwnershipSummaryDistinctQuery();
  const [perSourceResult, distinctResult] = await Promise.all([
    c.env.OPERATIONS_DB.prepare(sqlPerSource)
      .bind(...b1)
      .all<{ source: string; unique_titles: number; present_rows: number; total_bytes: number }>(),
    c.env.OPERATIONS_DB.prepare(sqlDistinct)
      .bind(...b2)
      .first<{ total_owned_titles: number }>(),
  ]);
  return c.json({
    total_owned_titles: distinctResult?.total_owned_titles ?? 0,
    by_source: perSourceResult.results ?? [],
  });
});

libraryOwnershipRoutes.get("/ownership/recent", async (c) => {
  const source = c.req.query("source") ?? null;
  if (source !== null && !OWNERSHIP_SOURCES.includes(source)) {
    throw badRequest("library.invalid_source", `Invalid source: ${source}`);
  }
  const limit = Math.max(1, Math.min(200, parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const { sql, bindings } = buildOwnershipRecentQuery({ source, limit, offset });
  const { results } = await c.env.OPERATIONS_DB.prepare(sql)
    .bind(...bindings)
    .all<{
      video_code: string; source: string; category: string;
      path: string | null; size: number | null; present: number; observed_at: string | null;
    }>();
  return c.json(results ?? []);
});
