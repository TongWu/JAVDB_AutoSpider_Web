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
                CAST(SUM(CASE WHEN Status='committed' THEN 1 ELSE 0 END) AS REAL)
                      / NULLIF(COUNT(*),0) AS success_rate
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

const VALID_METRICS = new Set([
  // Existing
  "success_rate",
  "duration",
  "runs",
  "movies",
  "torrents",
  "history_growth",
  "pikpak",
  "dedup",
  "proxy_bans",
  // Spider (A1-A4)
  "spider_processed",
  "spider_skipped",
  "spider_nonew",
  "spider_failed",
  "spider_efficiency",
  "spider_skip_rate",
  "spider_failure_rate",
  // Content (B1, B3, B5)
  "avg_rating",
  "subtitle_coverage",
  "hires_ratio",
  "perfectmatch_ratio",
  // Upload (C1-C4)
  "upload_success_rate",
  "duplicate_rate",
  "pikpak_success_rate",
  "pikpak_failed",
  "pikpak_delete_failed",
  // System/Ops (D1-D2)
  "email_sent",
  "email_failed",
  "email_resent",
  "ops_incidents",
]);
const VALID_DISTRIBUTION_METRICS = new Set([
  "rating_distribution",
  "resolution_distribution",
]);
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
  const metric = c.req.query("metric") ?? "success_rate";
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
      case "success_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date,
                      CAST(SUM(CASE WHEN Status='committed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS value
               FROM ReportSessions
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      case "duration":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(created_at) AS date,
                      AVG((julianday(updated_at) - julianday(created_at)) * 86400) AS value
               FROM job_runs
               WHERE status = 'completed'
                 AND created_at >= datetime('now', '-${days} days')
               GROUP BY DATE(created_at)
               ORDER BY date`;
        break;
      case "runs":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date, COUNT(*) AS value
               FROM ReportSessions
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      case "movies":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(rs.DateTimeCreated) AS date, COUNT(rm.Id) AS value
               FROM ReportSessions rs
               LEFT JOIN ReportMovies rm ON rm.SessionId = rs.Id
               WHERE rs.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY date
               ORDER BY date`;
        break;
      case "torrents":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(rs.DateTimeCreated) AS date, COUNT(rt.Id) AS value
               FROM ReportSessions rs
               LEFT JOIN ReportMovies rm ON rm.SessionId = rs.Id
               LEFT JOIN ReportTorrents rt ON rt.ReportMovieId = rm.Id
               WHERE rs.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY date
               ORDER BY date`;
        break;
      case "history_growth":
        db = c.env.HISTORY_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date, COUNT(*) AS value
               FROM MovieHistory
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      case "pikpak":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(DateTimeUploadedToPikpak) AS date, COUNT(*) AS value
               FROM PikpakHistory
               WHERE DateTimeUploadedToPikpak >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeUploadedToPikpak)
               ORDER BY date`;
        break;
      case "dedup":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(DateTimeDetected) AS date, COALESCE(SUM(ExistingFolderSize), 0) AS value
               FROM DedupRecords
               WHERE IsDeleted=1 AND DateTimeDetected >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeDetected)
               ORDER BY date`;
        break;
      case "proxy_bans":
        return c.json({
          metric: "proxy_bans",
          period,
          available: false,
          reason: "proxy_bans requires local log access (unavailable in Cloudflare mode)",
          data_points: [],
        });
      // --- Spider raw counts (A1 stacked bar series) ---
      case "spider_processed":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date, SUM(ss.TotalProcessed) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      case "spider_skipped":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date, SUM(ss.TotalSkipped) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      case "spider_nonew":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date, SUM(ss.TotalNoNew) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      case "spider_failed":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date, SUM(ss.TotalFailed) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Spider ratios (A2-A4 line charts) ---
      case "spider_efficiency":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date,
                      CAST(SUM(ss.TotalProcessed) AS REAL) / NULLIF(SUM(ss.TotalDiscovered), 0) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      case "spider_skip_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date,
                      CAST(SUM(ss.TotalSkipped) AS REAL) / NULLIF(SUM(ss.TotalDiscovered), 0) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      case "spider_failure_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ss.DateTimeCreated) AS date,
                      CAST(SUM(ss.TotalFailed) AS REAL) / NULLIF(SUM(ss.TotalDiscovered), 0) AS value
               FROM SpiderStats ss
               WHERE ss.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ss.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Content: avg rating (B1) ---
      case "avg_rating":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(rs.DateTimeCreated) AS date, AVG(rm.Rate) AS value
               FROM ReportSessions rs
               JOIN ReportMovies rm ON rm.SessionId = rs.Id
               WHERE rm.Rate > 0
                 AND rs.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(rs.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Content: subtitle coverage (B3) ---
      case "subtitle_coverage":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(us.DateTimeCreated) AS date,
                      CAST(SUM(us.SubtitleCount) AS REAL) / NULLIF(SUM(us.SubtitleCount + us.NoSubtitleCount), 0) AS value
               FROM UploaderStats us
               WHERE us.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(us.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Content: HiRes ratio (B5) ---
      case "hires_ratio":
        db = c.env.HISTORY_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date,
                      AVG(CAST(HiResIndicator AS REAL)) AS value
               FROM MovieHistory
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Content: PerfectMatch ratio (B5) ---
      case "perfectmatch_ratio":
        db = c.env.HISTORY_DB;
        sql = `SELECT DATE(DateTimeCreated) AS date,
                      AVG(CAST(PerfectMatchIndicator AS REAL)) AS value
               FROM MovieHistory
               WHERE DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Upload: QB success rate (C1) ---
      case "upload_success_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(us.DateTimeCreated) AS date, AVG(us.SuccessRate) AS value
               FROM UploaderStats us
               WHERE us.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(us.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Upload: duplicate rate (C2) ---
      case "duplicate_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(us.DateTimeCreated) AS date,
                      CAST(SUM(us.DuplicateCount) AS REAL) / NULLIF(SUM(us.TotalTorrents), 0) AS value
               FROM UploaderStats us
               WHERE us.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(us.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Upload: PikPak success rate (C3) ---
      case "pikpak_success_rate":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ps.DateTimeCreated) AS date,
                      CAST(SUM(ps.SuccessfulCount) AS REAL) / NULLIF(SUM(ps.TotalTorrents), 0) AS value
               FROM PikpakStats ps
               WHERE ps.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ps.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Upload: PikPak failed count (C4 series 1) ---
      case "pikpak_failed":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ps.DateTimeCreated) AS date, SUM(ps.FailedCount) AS value
               FROM PikpakStats ps
               WHERE ps.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ps.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- Upload: PikPak delete-failed count (C4 series 2) ---
      case "pikpak_delete_failed":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(ps.DateTimeCreated) AS date, SUM(ps.DeleteFailedCount) AS value
               FROM PikpakStats ps
               WHERE ps.DateTimeCreated >= datetime('now', '-${days} days')
               GROUP BY DATE(ps.DateTimeCreated)
               ORDER BY date`;
        break;
      // --- System: email sent (D1 series 1) ---
      case "email_sent":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(SentAt) AS date, COUNT(*) AS value
               FROM EmailNotificationHistory
               WHERE Status = 'sent'
                 AND SentAt >= datetime('now', '-${days} days')
               GROUP BY DATE(SentAt)
               ORDER BY date`;
        break;
      // --- System: email failed (D1 series 2) ---
      case "email_failed":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(SentAt) AS date, COUNT(*) AS value
               FROM EmailNotificationHistory
               WHERE Status = 'failed'
                 AND SentAt >= datetime('now', '-${days} days')
               GROUP BY DATE(SentAt)
               ORDER BY date`;
        break;
      // --- System: email resent (D1 series 3) ---
      case "email_resent":
        db = c.env.OPERATIONS_DB;
        sql = `SELECT DATE(COALESCE(ResentAt, SentAt)) AS date, COUNT(*) AS value
               FROM EmailNotificationHistory
               WHERE Status = 'resent'
                 AND COALESCE(ResentAt, SentAt) >= datetime('now', '-${days} days')
               GROUP BY DATE(COALESCE(ResentAt, SentAt))
               ORDER BY date`;
        break;
      // --- System: ops incidents (D2) ---
      case "ops_incidents":
        db = c.env.REPORTS_DB;
        sql = `SELECT DATE(created_at) AS date, COUNT(*) AS value
               FROM OpsIncidents
               WHERE created_at >= datetime('now', '-${days} days')
               GROUP BY DATE(created_at)
               ORDER BY date`;
        break;
      default:
        db = c.env.REPORTS_DB;
        sql = "";
    }

    if (sql) {
      const rows = await db.prepare(sql).all<{ date: string; value: number }>();
      dataPoints = rows.results;
    }
  } catch {
    // Table may not exist — return empty array
  }

  return c.json({
    metric,
    period,
    available: true,
    data_points: dataPoints,
  });
});

// --- GET /distribution ---

statsRoutes.get("/distribution", async (c) => {
  const metric = c.req.query("metric") ?? "rating_distribution";
  const period = c.req.query("period") ?? "30d";

  if (!VALID_DISTRIBUTION_METRICS.has(metric)) {
    throw new HTTPException(400, {
      message: JSON.stringify({
        error: {
          code: "stats.invalid_metric",
          message: `Invalid metric '${metric}'. Supported: ${[...VALID_DISTRIBUTION_METRICS].join(", ")}`,
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

  if (metric === "rating_distribution") {
    const buckets = [
      { label: "0-2", value: 0 },
      { label: "2-4", value: 0 },
      { label: "4-6", value: 0 },
      { label: "6-8", value: 0 },
      { label: "8-10", value: 0 },
    ];

    try {
      const rows = await c.env.REPORTS_DB
        .prepare(
          `SELECT
             CASE
               WHEN rm.Rate >= 0 AND rm.Rate < 2 THEN 0
               WHEN rm.Rate >= 2 AND rm.Rate < 4 THEN 1
               WHEN rm.Rate >= 4 AND rm.Rate < 6 THEN 2
               WHEN rm.Rate >= 6 AND rm.Rate < 8 THEN 3
               WHEN rm.Rate >= 8 AND rm.Rate <= 10 THEN 4
               ELSE NULL
             END AS bucket_index,
             COUNT(*) AS value
           FROM ReportMovies rm
           JOIN ReportSessions rs ON rs.Id = rm.SessionId
           WHERE rm.Rate IS NOT NULL
             AND rs.DateTimeCreated >= datetime('now', '-${days} days')
           GROUP BY bucket_index
           ORDER BY bucket_index`,
        )
        .all<{ bucket_index: number | null; value: number }>();

      for (const row of rows.results) {
        if (
          row.bucket_index !== null &&
          row.bucket_index >= 0 &&
          row.bucket_index < buckets.length
        ) {
          buckets[row.bucket_index].value = row.value;
        }
      }
    } catch {
      return c.json({
        metric,
        period,
        buckets: [],
      });
    }

    return c.json({
      metric,
      period,
      buckets,
    });
  }

  try {
    const rows = await c.env.HISTORY_DB
      .prepare(
        `SELECT
           CASE
             WHEN ResolutionType = 0 THEN 0
             WHEN ResolutionType = 1 THEN 1
             WHEN ResolutionType = 2 THEN 2
             WHEN ResolutionType = 3 THEN 3
             WHEN ResolutionType = 4 THEN 4
             ELSE 5
           END AS bucket_index,
           COUNT(*) AS value
         FROM TorrentHistory
         WHERE DateTimeCreated >= datetime('now', '-${days} days')
         GROUP BY 1
         ORDER BY 1`,
      )
      .all<{ bucket_index: number; value: number }>();

    const resolutionLabels = ["Unknown", "SD", "HD", "FHD", "4K", "Other"];
    const buckets = rows.results.map((row) => ({
      label: resolutionLabels[row.bucket_index] ?? "Other",
      value: row.value,
    }));

    return c.json({
      metric,
      period,
      buckets,
    });
  } catch {
    return c.json({
      metric,
      period,
      buckets: [],
    });
  }
});
