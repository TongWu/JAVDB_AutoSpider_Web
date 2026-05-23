import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type StatsEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const statsRoutes = new Hono<StatsEnv>();

// --- GET /summary ---

statsRoutes.get("/summary", async (c) => {
  const historyDb = c.env.HISTORY_DB;
  const reportsDb = c.env.REPORTS_DB;
  const opsDb = c.env.OPERATIONS_DB;

  let totalMovies = 0;
  let totalTorrents = 0;
  let totalRuns = 0;
  let successRate: number | null = null;
  let avgDurationSeconds: number | null = null;
  let totalPikpak = 0;
  let totalDedupFreedBytes = 0;

  // MovieHistory count (HISTORY_DB)
  try {
    const r = await historyDb
      .prepare("SELECT COUNT(*) AS cnt FROM MovieHistory")
      .first<{ cnt: number }>();
    if (r) totalMovies = r.cnt;
  } catch {
    // Table may not exist
  }

  // TorrentHistory count (HISTORY_DB)
  try {
    const r = await historyDb
      .prepare("SELECT COUNT(*) AS cnt FROM TorrentHistory")
      .first<{ cnt: number }>();
    if (r) totalTorrents = r.cnt;
  } catch {
    // Table may not exist
  }

  // ReportSessions counts (REPORTS_DB)
  try {
    const r = await reportsDb
      .prepare(
        `SELECT COUNT(*) AS total,
                ROUND(CAST(SUM(CASE WHEN Status='committed' THEN 1 ELSE 0 END) AS REAL)
                      / NULLIF(COUNT(*),0) * 100, 1) AS success_rate
         FROM ReportSessions`,
      )
      .first<{ total: number; success_rate: number | null }>();
    if (r) {
      totalRuns = r.total;
      successRate = r.success_rate;
    }
  } catch {
    // Table may not exist
  }

  // Average duration of committed sessions (REPORTS_DB)
  try {
    const r = await reportsDb
      .prepare(
        `SELECT AVG(CAST((julianday(CommittedAt) - julianday(DateTimeCreated)) * 86400 AS INTEGER)) AS avg_dur
         FROM ReportSessions
         WHERE Status='committed' AND CommittedAt IS NOT NULL`,
      )
      .first<{ avg_dur: number | null }>();
    if (r && r.avg_dur !== null) {
      avgDurationSeconds = Math.round(r.avg_dur);
    }
  } catch {
    // Table may not exist
  }

  // PikpakHistory count (OPERATIONS_DB)
  try {
    const r = await opsDb
      .prepare("SELECT COUNT(*) AS cnt FROM PikpakHistory")
      .first<{ cnt: number }>();
    if (r) totalPikpak = r.cnt;
  } catch {
    // Table may not exist
  }

  // DedupRecords freed bytes (OPERATIONS_DB)
  try {
    const r = await opsDb
      .prepare(
        "SELECT SUM(ExistingFolderSize) AS total_freed FROM DedupRecords WHERE Status='completed'",
      )
      .first<{ total_freed: number | null }>();
    if (r && r.total_freed !== null) {
      totalDedupFreedBytes = r.total_freed;
    }
  } catch {
    // Table may not exist
  }

  return c.json({
    total_movies: totalMovies,
    total_torrents: totalTorrents,
    total_runs: totalRuns,
    success_rate: successRate,
    avg_duration_seconds: avgDurationSeconds,
    total_pikpak: totalPikpak,
    total_dedup_freed_bytes: totalDedupFreedBytes,
    proxy_bans_last_7d: 0,
  });
});

// --- GET /trend ---

const VALID_METRICS = new Set(["runs", "movies", "torrents"]);
const VALID_PERIODS = new Set(["7d", "30d", "90d"]);

function periodToDays(period: string): number {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return 30;
  }
}

statsRoutes.get("/trend", async (c) => {
  const metric = c.req.query("metric") ?? "runs";
  const period = c.req.query("period") ?? "30d";

  if (!VALID_METRICS.has(metric)) {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          code: "stats.invalid_metric",
          message: `Invalid metric '${metric}'. Supported: ${[...VALID_METRICS].join(", ")}`,
        },
      }),
    });
  }

  if (!VALID_PERIODS.has(period)) {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          code: "stats.invalid_period",
          message: `Invalid period '${period}'. Supported: ${[...VALID_PERIODS].join(", ")}`,
        },
      }),
    });
  }

  const days = periodToDays(period);
  let dataPoints: Array<{ date: string; value: number }> = [];

  try {
    let db: D1Database;
    let sql: string;

    switch (metric) {
      case "runs":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date, COUNT(*) AS value
               FROM ReportSessions
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      case "movies":
        db = c.env.HISTORY_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date, COUNT(*) AS value
               FROM MovieHistory
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      case "torrents":
        db = c.env.HISTORY_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date, COUNT(*) AS value
               FROM TorrentHistory
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      default:
        // Already validated above
        db = c.env.REPORTS_DB;
        sql = "";
    }

    const rows = await db.prepare(sql).all<{ date: string; value: number }>();
    dataPoints = rows.results;
  } catch {
    // Table may not exist — return empty array
  }

  return c.json({
    metric,
    period,
    data_points: dataPoints,
  });
});
