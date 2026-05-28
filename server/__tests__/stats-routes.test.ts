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

    // We seeded 2 sessions within 7 days
    expect(data.data_points.length).toBeGreaterThan(0);
    for (const dp of data.data_points) {
      expect(typeof dp.date).toBe("string");
      expect(typeof dp.value).toBe("number");
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

  it("rejects unauthenticated requests", async () => {
    const summaryRes = await app.request("/api/stats/summary", {}, env);
    expect(summaryRes.status).toBe(401);

    const trendRes = await app.request("/api/stats/trend?metric=runs", {}, env);
    expect(trendRes.status).toBe(401);
  });
});
