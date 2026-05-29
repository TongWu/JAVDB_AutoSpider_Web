import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function getToken(): Promise<string> {
  const res = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "testpassword123" }),
    },
    env,
  );
  const data = (await res.json()) as any;
  return data.access_token;
}

async function seedTables() {
  // ReportSessions (REPORTS_DB)
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ReportSessions (
      Id TEXT PRIMARY KEY, Status TEXT, WriteMode TEXT, RunId TEXT, RunAttempt INTEGER,
      DateTimeCreated TEXT, ReportType TEXT, ReportDate TEXT, FailureReason TEXT,
      CommittedAt TEXT
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO ReportSessions (Id, Status, DateTimeCreated, ReportType, ReportDate, CommittedAt)
     VALUES ('sess-001', 'committed', datetime('now', '-1 day'), 'daily', '2026-05-23', datetime('now'))`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO ReportSessions (Id, Status, DateTimeCreated, ReportType, ReportDate)
     VALUES ('sess-002', 'failed', datetime('now', '-2 days'), 'adhoc', '2026-05-22')`,
  ).run();

  // MovieHistory (HISTORY_DB) — minimal schema for count
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS MovieHistory (
      Id INTEGER PRIMARY KEY, VideoCode TEXT, Href TEXT, ActorName TEXT,
      DateTimeCreated TEXT, SessionId TEXT
    )`,
  ).run();
  await env.HISTORY_DB.prepare(
    `INSERT INTO MovieHistory (Id, VideoCode, Href, DateTimeCreated)
     VALUES (1, 'TEST-001', '/v/abc', datetime('now', '-1 day'))`,
  ).run();

  // TorrentHistory (HISTORY_DB)
  await env.HISTORY_DB.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentHistory (
      Id INTEGER PRIMARY KEY, MovieHistoryId INTEGER, MagnetUri TEXT,
      DateTimeCreated TEXT, SessionId TEXT
    )`,
  ).run();
  await env.HISTORY_DB.prepare(
    `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated)
     VALUES (1, 1, 'magnet:?xt=test', datetime('now', '-1 day'))`,
  ).run();
  await env.HISTORY_DB.prepare(
    `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated)
     VALUES (2, 1, 'magnet:?xt=test2', datetime('now', '-1 day'))`,
  ).run();

  // SpiderStats (REPORTS_DB)
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS SpiderStats (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT NOT NULL,
      Phase1Discovered INTEGER, Phase1Processed INTEGER, Phase1Skipped INTEGER,
      Phase1NoNew INTEGER, Phase1Failed INTEGER,
      Phase2Discovered INTEGER, Phase2Processed INTEGER, Phase2Skipped INTEGER,
      Phase2NoNew INTEGER, Phase2Failed INTEGER,
      TotalDiscovered INTEGER, TotalProcessed INTEGER, TotalSkipped INTEGER,
      TotalNoNew INTEGER, TotalFailed INTEGER,
      FailedMovies TEXT, DateTimeCreated TEXT
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO SpiderStats (SessionId, TotalDiscovered, TotalProcessed, TotalSkipped, TotalNoNew, TotalFailed, DateTimeCreated)
     VALUES ('sess-001', 100, 60, 20, 15, 5, datetime('now', '-1 day'))`,
  ).run();

  // UploaderStats (REPORTS_DB)
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS UploaderStats (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT NOT NULL,
      TotalTorrents INTEGER, DuplicateCount INTEGER, Attempted INTEGER,
      SuccessfullyAdded INTEGER, FailedCount INTEGER,
      HackedSub INTEGER, HackedNosub INTEGER,
      SubtitleCount INTEGER, NoSubtitleCount INTEGER,
      SuccessRate REAL, DateTimeCreated TEXT
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO UploaderStats (SessionId, TotalTorrents, DuplicateCount, SubtitleCount, NoSubtitleCount, SuccessRate, DateTimeCreated)
     VALUES ('sess-001', 50, 10, 30, 20, 0.85, datetime('now', '-1 day'))`,
  ).run();

  // PikpakStats (REPORTS_DB)
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS PikpakStats (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT NOT NULL,
      ThresholdDays INTEGER, TotalTorrents INTEGER, FilteredOld INTEGER,
      SuccessfulCount INTEGER, FailedCount INTEGER,
      UploadedCount INTEGER, DeleteFailedCount INTEGER,
      DateTimeCreated TEXT
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO PikpakStats (SessionId, TotalTorrents, SuccessfulCount, FailedCount, DeleteFailedCount, DateTimeCreated)
     VALUES ('sess-001', 40, 35, 3, 2, datetime('now', '-1 day'))`,
  ).run();

  // ReportMovies (REPORTS_DB) — for avg_rating metric
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ReportMovies (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT NOT NULL, Href TEXT, VideoCode TEXT,
      Page INTEGER, Actor TEXT, Rate REAL, CommentNumber INTEGER
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO ReportMovies (SessionId, VideoCode, Rate, CommentNumber)
     VALUES ('sess-001', 'TEST-001', 7.5, 42)`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO ReportMovies (SessionId, VideoCode, Rate, CommentNumber)
     VALUES ('sess-001', 'TEST-002', 3.2, 10)`,
  ).run();

  // MovieHistory — add HiRes and PerfectMatch columns
  await env.HISTORY_DB.prepare(
    "ALTER TABLE MovieHistory ADD COLUMN PerfectMatchIndicator INTEGER DEFAULT 0",
  ).run();
  await env.HISTORY_DB.prepare(
    "ALTER TABLE MovieHistory ADD COLUMN HiResIndicator INTEGER DEFAULT 0",
  ).run();
  await env.HISTORY_DB.prepare(
    "UPDATE MovieHistory SET PerfectMatchIndicator = 1, HiResIndicator = 1 WHERE Id = 1",
  ).run();

  // TorrentHistory — add resolution column
  await env.HISTORY_DB.prepare(
    "ALTER TABLE TorrentHistory ADD COLUMN SubtitleIndicator INTEGER DEFAULT 0",
  ).run();
  await env.HISTORY_DB.prepare(
    "ALTER TABLE TorrentHistory ADD COLUMN ResolutionType INTEGER DEFAULT 0",
  ).run();
  await env.HISTORY_DB.prepare(
    "UPDATE TorrentHistory SET ResolutionType = 2 WHERE Id = 1",
  ).run();
  await env.HISTORY_DB.prepare(
    "UPDATE TorrentHistory SET ResolutionType = 1 WHERE Id = 2",
  ).run();

  // EmailNotificationHistory (OPERATIONS_DB)
  await env.OPERATIONS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS EmailNotificationHistory (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT, Recipient TEXT NOT NULL, Subject TEXT NOT NULL,
      Status TEXT NOT NULL DEFAULT 'sent', ErrorMessage TEXT,
      AttachmentNames TEXT, SentAt TEXT NOT NULL, ResentAt TEXT, CreatedBy TEXT
    )`,
  ).run();
  await env.OPERATIONS_DB.prepare(
    `INSERT INTO EmailNotificationHistory (SessionId, Recipient, Subject, Status, SentAt)
     VALUES ('sess-001', 'a@b.com', 'Report', 'sent', datetime('now', '-1 day'))`,
  ).run();
  await env.OPERATIONS_DB.prepare(
    `INSERT INTO EmailNotificationHistory (SessionId, Recipient, Subject, Status, SentAt)
     VALUES ('sess-001', 'a@b.com', 'Report', 'failed', datetime('now', '-1 day'))`,
  ).run();

  // OpsIncidents (REPORTS_DB)
  await env.REPORTS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS OpsIncidents (
      incident_id TEXT PRIMARY KEY, trigger_source TEXT NOT NULL,
      run_id TEXT, run_attempt INTEGER, session_id TEXT,
      incident_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      persistence_status TEXT NOT NULL DEFAULT 'd1_written',
      model_version TEXT NOT NULL, detector_version TEXT NOT NULL,
      bundle_schema_version TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'low',
      confirmed_findings_json TEXT, likely_causes_json TEXT,
      unknowns_json TEXT, recommended_next_actions_json TEXT,
      unsafe_actions_json TEXT, evidence_refs_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT
    )`,
  ).run();
  await env.REPORTS_DB.prepare(
    `INSERT INTO OpsIncidents (incident_id, trigger_source, incident_type, status, model_version, detector_version, bundle_schema_version, created_at, updated_at)
     VALUES ('inc-001', 'ci', 'spider_failure', 'open', 'v1', 'v1', 'v1', datetime('now', '-1 day'), datetime('now', '-1 day'))`,
  ).run();
}

describe("Stats routes", () => {
  beforeAll(async () => {
    await seedTables();
  });

  it("GET /api/stats/summary returns all expected fields with correct types", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/summary",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    // Check all fields exist
    expect(data).toHaveProperty("total_movies");
    expect(data).toHaveProperty("total_torrents");
    expect(data).toHaveProperty("total_runs");
    expect(data).toHaveProperty("success_rate");
    expect(data).toHaveProperty("avg_duration_seconds");
    expect(data).toHaveProperty("total_pikpak");
    expect(data).toHaveProperty("total_dedup_freed_bytes");
    expect(data).toHaveProperty("proxy_bans_last_7d");

    // Check types and values from seeded data
    expect(typeof data.total_movies).toBe("number");
    expect(data.total_movies).toBe(1);

    expect(typeof data.total_torrents).toBe("number");
    expect(data.total_torrents).toBe(2);

    expect(typeof data.total_runs).toBe("number");
    expect(data.total_runs).toBe(2);

    // success_rate: 1 committed out of 2 = 0.5 (0-1 fraction)
    expect(data.success_rate).toBe(0.5);

    // avg_duration_seconds: should be a number (committed session has CommittedAt)
    expect(typeof data.avg_duration_seconds).toBe("number");

    // PikpakHistory table doesn't exist — should be 0
    expect(data.total_pikpak).toBe(0);

    // DedupRecords table doesn't exist — should be 0
    expect(data.total_dedup_freed_bytes).toBe(0);

    // Proxy bans always 0
    expect(data.proxy_bans_last_7d).toBe(0);
  });

  it("GET /api/stats/trend?metric=runs&period=7d returns data_points array", async () => {
    const token = await getToken();
    const oldSessionId = "sess-old-outside-window";

    await env.REPORTS_DB.prepare(
      `INSERT INTO ReportSessions (Id, Status, DateTimeCreated, ReportType, ReportDate)
       VALUES (?, 'committed', datetime('now', '-10 days'), 'daily', '2026-05-13')`,
    )
      .bind(oldSessionId)
      .run();

    try {
      const res = await app.request(
        "/api/stats/trend?metric=runs&period=7d",
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;

      expect(data.metric).toBe("runs");
      expect(data.period).toBe("7d");
      expect(Array.isArray(data.data_points)).toBe(true);
      expect(data.data_points).toHaveLength(2);
      expect(data.data_points.map((dp: any) => dp.value)).toEqual([1, 1]);
      expect(data.data_points.reduce((sum: number, dp: any) => sum + dp.value, 0)).toBe(2);
      for (const dp of data.data_points) {
        expect(typeof dp.date).toBe("string");
        expect(typeof dp.value).toBe("number");
      }
    } finally {
      await env.REPORTS_DB.prepare("DELETE FROM ReportSessions WHERE Id = ?")
        .bind(oldSessionId)
        .run();
    }
  });

  it("GET /api/stats/trend with invalid metric returns 400", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=invalid_metric",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/stats/distribution?metric=rating_distribution&period=90d returns ordered buckets", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/distribution?metric=rating_distribution&period=90d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.metric).toBe("rating_distribution");
    expect(data.period).toBe("90d");
    expect(Array.isArray(data.buckets)).toBe(true);
    expect(data.buckets).toHaveLength(5);
    expect(data.buckets.map((bucket: any) => bucket.label)).toEqual([
      "0-2",
      "2-4",
      "4-6",
      "6-8",
      "8-10",
    ]);
    expect(data.buckets.map((bucket: any) => bucket.value)).toEqual([0, 1, 0, 1, 0]);
  });

  it("GET /api/stats/distribution?metric=resolution_distribution&period=90d returns resolution buckets", async () => {
    const token = await getToken();
    await env.HISTORY_DB.prepare(
      `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated, ResolutionType)
       VALUES (3, 1, 'magnet:?xt=test3', datetime('now', '-1 day'), 0)`,
    ).run();
    await env.HISTORY_DB.prepare(
      `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated, ResolutionType)
       VALUES (4, 1, 'magnet:?xt=test4', datetime('now', '-1 day'), 3)`,
    ).run();
    await env.HISTORY_DB.prepare(
      `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated, ResolutionType)
       VALUES (5, 1, 'magnet:?xt=test5', datetime('now', '-1 day'), 4)`,
    ).run();

    try {
      const res = await app.request(
        "/api/stats/distribution?metric=resolution_distribution&period=90d",
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as any;
      expect(data.metric).toBe("resolution_distribution");
      expect(data.period).toBe("90d");
      expect(data.buckets).toEqual([
        { label: "Unknown", value: 1 },
        { label: "SD", value: 1 },
        { label: "HD", value: 1 },
        { label: "FHD", value: 1 },
        { label: "4K", value: 1 },
      ]);
    } finally {
      await env.HISTORY_DB.prepare("DELETE FROM TorrentHistory WHERE Id IN (3, 4, 5)").run();
    }
  });

  it("GET /api/stats/distribution returns empty buckets when TorrentHistory is unavailable", async () => {
    const token = await getToken();
    await env.HISTORY_DB.prepare("DROP TABLE IF EXISTS TorrentHistory").run();

    try {
      const res = await app.request(
        "/api/stats/distribution?metric=resolution_distribution&period=90d",
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.metric).toBe("resolution_distribution");
      expect(data.buckets).toEqual([]);
    } finally {
      await env.HISTORY_DB.prepare(
        `CREATE TABLE IF NOT EXISTS TorrentHistory (
          Id INTEGER PRIMARY KEY, MovieHistoryId INTEGER, MagnetUri TEXT,
          DateTimeCreated TEXT, SessionId TEXT
        )`,
      ).run();
      await env.HISTORY_DB.prepare(
        `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated)
         VALUES (1, 1, 'magnet:?xt=test', datetime('now', '-1 day'))`,
      ).run();
      await env.HISTORY_DB.prepare(
        `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated)
         VALUES (2, 1, 'magnet:?xt=test2', datetime('now', '-1 day'))`,
      ).run();
      await env.HISTORY_DB.prepare(
        "ALTER TABLE TorrentHistory ADD COLUMN SubtitleIndicator INTEGER DEFAULT 0",
      ).run();
      await env.HISTORY_DB.prepare(
        "ALTER TABLE TorrentHistory ADD COLUMN ResolutionType INTEGER DEFAULT 0",
      ).run();
      await env.HISTORY_DB.prepare(
        "UPDATE TorrentHistory SET ResolutionType = 2 WHERE Id = 1",
      ).run();
      await env.HISTORY_DB.prepare(
        "UPDATE TorrentHistory SET ResolutionType = 1 WHERE Id = 2",
      ).run();
    }
  });

  it("GET /api/stats/distribution?metric=resolution_distribution combines unknown values into Other", async () => {
    const token = await getToken();
    await env.HISTORY_DB.prepare(
      `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated, ResolutionType)
       VALUES (3, 1, 'magnet:?xt=test3', datetime('now', '-1 day'), NULL)`,
    ).run();
    await env.HISTORY_DB.prepare(
      `INSERT INTO TorrentHistory (Id, MovieHistoryId, MagnetUri, DateTimeCreated, ResolutionType)
       VALUES (4, 1, 'magnet:?xt=test4', datetime('now', '-1 day'), 42)`,
    ).run();

    try {
      const res = await app.request(
        "/api/stats/distribution?metric=resolution_distribution&period=90d",
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const other = data.buckets.find((bucket: any) => bucket.label === "Other");
      expect(other.value).toBe(2);
    } finally {
      await env.HISTORY_DB.prepare("DELETE FROM TorrentHistory WHERE Id IN (3, 4)").run();
    }
  });

  it("GET /api/stats/distribution with invalid metric returns 400", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/distribution?metric=invalid_metric",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const summaryRes = await app.request("/api/stats/summary", {}, env);
    expect(summaryRes.status).toBe(401);

    const trendRes = await app.request("/api/stats/trend?metric=runs", {}, env);
    expect(trendRes.status).toBe(401);

    const distributionRes = await app.request(
      "/api/stats/distribution?metric=rating_distribution",
      {},
      env,
    );
    expect(distributionRes.status).toBe(401);
  });

  it("GET /api/stats/trend?metric=spider_processed returns daily totals", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=spider_processed&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.metric).toBe("spider_processed");
    expect(data.data_points.length).toBeGreaterThan(0);
    expect(data.data_points[0].value).toBe(60);
  });

  it("GET /api/stats/trend?metric=spider_efficiency returns ratio as 0-1", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=spider_efficiency&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 60 processed / 100 discovered = 0.6
    expect(data.data_points[0].value).toBeCloseTo(0.6, 1);
  });

  it("GET /api/stats/trend?metric=spider_skip_rate returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=spider_skip_rate&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 20 skipped / 100 discovered = 0.2
    expect(data.data_points[0].value).toBeCloseTo(0.2, 1);
  });

  it("GET /api/stats/trend?metric=spider_failure_rate returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=spider_failure_rate&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 5 failed / 100 discovered = 0.05
    expect(data.data_points[0].value).toBeCloseTo(0.05, 2);
  });

  // --- Content metrics ---
  it("GET /api/stats/trend?metric=avg_rating returns average rating per day", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=avg_rating&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // avg of 7.5 and 3.2 = 5.35
    expect(data.data_points[0].value).toBeCloseTo(5.35, 1);
  });

  it("GET /api/stats/trend?metric=subtitle_coverage returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=subtitle_coverage&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 30 / (30 + 20) = 0.6
    expect(data.data_points[0].value).toBeCloseTo(0.6, 1);
  });

  it("GET /api/stats/trend?metric=hires_ratio returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=hires_ratio&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 1 HiRes out of 1 movie = 1.0
    expect(data.data_points[0].value).toBeCloseTo(1.0, 1);
  });

  // --- Upload metrics ---
  it("GET /api/stats/trend?metric=upload_success_rate returns rate", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=upload_success_rate&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    expect(data.data_points[0].value).toBeCloseTo(0.85, 2);
  });

  it("GET /api/stats/trend?metric=duplicate_rate returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=duplicate_rate&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 10 / 50 = 0.2
    expect(data.data_points[0].value).toBeCloseTo(0.2, 1);
  });

  it("GET /api/stats/trend?metric=pikpak_success_rate returns ratio", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=pikpak_success_rate&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    // 35 / 40 = 0.875
    expect(data.data_points[0].value).toBeCloseTo(0.875, 2);
  });

  it("GET /api/stats/trend?metric=pikpak_failed returns count", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=pikpak_failed&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    expect(data.data_points[0].value).toBe(3);
  });

  // --- System/Ops metrics ---
  it("GET /api/stats/trend?metric=email_sent returns count", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=email_sent&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    expect(data.data_points[0].value).toBe(1);
  });

  it("GET /api/stats/trend?metric=ops_incidents returns count", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/stats/trend?metric=ops_incidents&period=7d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.data_points.length).toBeGreaterThan(0);
    expect(data.data_points[0].value).toBe(1);
  });
});
