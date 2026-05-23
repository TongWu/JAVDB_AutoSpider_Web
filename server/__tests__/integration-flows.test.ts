import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function loginAdmin(): Promise<{ token: string; csrfToken: string; csrfCookie: string }> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "testpassword123" }),
  }, env);
  const data = await res.json() as any;
  return {
    token: data.access_token,
    csrfToken: data.csrf_token,
    csrfCookie: `csrf_token=${data.csrf_token}`,
  };
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function postHeaders(token: string, csrf: string, csrfCookie: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-CSRF-Token": csrf,
    Cookie: csrfCookie,
  };
}

// ---------------------------------------------------------------------------
// Seeding helpers
// ---------------------------------------------------------------------------

async function seedHistoryDb(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS MovieHistory (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      VideoCode TEXT NOT NULL,
      Href TEXT NOT NULL UNIQUE,
      ActorName TEXT,
      ActorGender TEXT,
      SupportingActors TEXT,
      PerfectMatchIndicator INTEGER,
      HiResIndicator INTEGER,
      DateTimeCreated TEXT,
      DateTimeUpdated TEXT,
      SessionId TEXT
    )`
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS TorrentHistory (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      MovieHistoryId INTEGER NOT NULL,
      MagnetUri TEXT,
      SubtitleIndicator INTEGER,
      CensorIndicator INTEGER,
      ResolutionType INTEGER,
      Size TEXT,
      FileCount INTEGER,
      DateTimeCreated TEXT,
      SessionId TEXT
    )`
  ).run();

  // 3 movies: 2 by "Actor A", 1 by "Actor B"
  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, ActorGender, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("INT-001", "/v/int001", "Actor A", "F", 1, 0, "2026-05-20 10:00:00", "int-sess-1").run();

  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, ActorGender, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("INT-002", "/v/int002", "Actor B", "F", 0, 1, "2026-05-21 10:00:00", "int-sess-1").run();

  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, ActorGender, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("INT-003", "/v/int003", "Actor A", "F", 1, 1, "2026-05-22 10:00:00", "int-sess-2").run();

  // 3 torrents: 2 for movie 1, 1 for movie 2
  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(1, "magnet:?xt=urn:btih:int-aaa", 1, 1, 3, "2.5GB", 1, "2026-05-20 10:00:00", "int-sess-1").run();

  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(1, "magnet:?xt=urn:btih:int-bbb", 0, 1, 4, "5.0GB", 1, "2026-05-20 10:00:00", "int-sess-1").run();

  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(2, "magnet:?xt=urn:btih:int-ccc", 1, 0, 3, "3.0GB", 2, "2026-05-21 10:00:00", "int-sess-1").run();
}

async function seedReportsDb(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ReportSessions (
      Id TEXT PRIMARY KEY,
      ReportType TEXT NOT NULL,
      ReportDate TEXT NOT NULL,
      UrlType TEXT,
      DisplayName TEXT,
      Url TEXT,
      StartPage INTEGER,
      EndPage INTEGER,
      CsvFilename TEXT NOT NULL,
      DateTimeCreated TEXT NOT NULL,
      Status TEXT DEFAULT 'in_progress',
      RunId TEXT,
      RunAttempt INTEGER,
      FailureReason TEXT,
      WriteMode TEXT DEFAULT 'pending',
      CommittedAt TEXT
    )`
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ReportMovies (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      SessionId TEXT NOT NULL,
      Href TEXT,
      VideoCode TEXT,
      Page INTEGER,
      Actor TEXT,
      Rate REAL,
      CommentNumber INTEGER
    )`
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ReportTorrents (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      ReportMovieId INTEGER NOT NULL,
      VideoCode TEXT,
      MagnetUri TEXT,
      SubtitleIndicator INTEGER,
      CensorIndicator INTEGER,
      ResolutionType INTEGER,
      Size TEXT,
      FileCount INTEGER
    )`
  ).run();

  // Committed session
  await db.prepare(
    `INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt, CommittedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("int-sess-1", "daily", "2026-05-20", "report-int1.csv", "2026-05-20 09:00:00", "committed", "pending", "run-int-1", 1, "2026-05-20 09:05:00").run();

  // In-progress session (for commit test)
  await db.prepare(
    `INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("int-sess-2", "adhoc", "2026-05-22", "report-int2.csv", "2026-05-22 09:00:00", "in_progress", "pending", "run-int-2", 1).run();
}

async function seedOperationsDb(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS job_runs (
      job_id TEXT PRIMARY KEY,
      workflow TEXT NOT NULL,
      gh_run_id INTEGER,
      status TEXT NOT NULL DEFAULT 'dispatched',
      inputs TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  await db.prepare(
    `INSERT INTO job_runs (job_id, workflow, gh_run_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind("job-int-1", "DailyIngestion.yml", 12345, "completed", "2026-05-20 09:00:00", "2026-05-20 09:30:00").run();

  await db.prepare(
    `INSERT INTO system_state (key, value, updated_at)
     VALUES (?, ?, ?)`
  ).bind("last_known_state", '{"status":"idle"}', "2026-05-22 12:00:00").run();
}

// ---------------------------------------------------------------------------
// Global seed — runs once before all flows
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await seedHistoryDb(env.HISTORY_DB);
  await seedReportsDb(env.REPORTS_DB);
  await seedOperationsDb(env.OPERATIONS_DB);
});

// ===========================================================================
// Flow 1: Auth → Capabilities → System State
// ===========================================================================

describe("Flow 1: Auth → Capabilities → System State", () => {
  it("completes the frontend bootstrap sequence", async () => {
    // Step 1: Login
    const { token } = await loginAdmin();
    expect(token).toBeTruthy();

    // Step 2: GET /api/capabilities
    const capRes = await app.request("/api/capabilities", {
      headers: authHeaders(token),
    }, env);
    expect(capRes.status).toBe(200);
    const caps = await capRes.json() as any;

    expect(caps).toHaveProperty("deployment");
    expect(caps.deployment).toBe("cloudflare");
    expect(caps).toHaveProperty("features");
    expect(typeof caps.features.proxy_pool).toBe("boolean");
    expect(caps).toHaveProperty("gh_actions");
    expect(caps.gh_actions.tier).toBe("admin");
    expect(caps.gh_actions.repo).toBe("test-owner/test-repo");
    expect(caps.gh_actions.token_configured).toBe(false); // GH_ACTIONS_TOKEN not set in test

    // Step 3: GET /api/system/state?key=last_known_state
    const stateRes = await app.request("/api/system/state?key=last_known_state", {
      headers: authHeaders(token),
    }, env);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json() as any;

    expect(state.key).toBe("last_known_state");
    expect(state.value).toBeTruthy();
    // The value was seeded as a JSON string
    const parsed = JSON.parse(state.value);
    expect(parsed.status).toBe("idle");
  });
});

// ===========================================================================
// Flow 2: Auth → Seed History → Query → Export CSV
// ===========================================================================

describe("Flow 2: Auth → History Query → Filter → Export", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await loginAdmin());
  });

  it("GET /api/history/movies returns paginated response with seeded items", async () => {
    const res = await app.request("/api/history/movies?limit=10", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.items.length).toBeGreaterThanOrEqual(3);
    expect(data).toHaveProperty("total_estimate");
    expect(data).toHaveProperty("items");

    // Verify seeded movies are present
    const codes = data.items.map((m: any) => m.video_code);
    expect(codes).toContain("INT-001");
    expect(codes).toContain("INT-002");
    expect(codes).toContain("INT-003");
  });

  it("GET /api/history/movies?actor=Actor%20A returns filtered results", async () => {
    const res = await app.request("/api/history/movies?actor=Actor%20A", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.items.length).toBeGreaterThanOrEqual(2);
    expect(data.items.every((m: any) => m.actor_name === "Actor A")).toBe(true);
  });

  it("GET /api/history/movies/export returns CSV with seeded data", async () => {
    const res = await app.request("/api/history/movies/export", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    const csv = await res.text();
    expect(csv).toContain("video_code");
    expect(csv).toContain("INT-001");
    expect(csv).toContain("INT-002");
    expect(csv).toContain("INT-003");
    expect(csv).toContain("Actor A");
    expect(csv).toContain("Actor B");
  });

  it("GET /api/history/torrents returns joined results", async () => {
    const res = await app.request("/api/history/torrents?limit=10", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.items.length).toBeGreaterThanOrEqual(3);
    // Torrents should have movie_video_code from the JOIN
    const movieCodes = data.items.map((t: any) => t.movie_video_code);
    expect(movieCodes).toContain("INT-001");
    expect(movieCodes).toContain("INT-002");
  });

  it("GET /api/history/torrents/export returns CSV", async () => {
    const res = await app.request("/api/history/torrents/export", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    const csv = await res.text();
    expect(csv).toContain("movie_video_code");
    expect(csv).toContain("INT-001");
    expect(csv).toContain("magnet:?xt=urn:btih:int-aaa");
  });
});

// ===========================================================================
// Flow 3: Auth → Sessions List → Session Commit → Verify State Change
// ===========================================================================

describe("Flow 3: Auth → Sessions List → Commit → Verify", () => {
  it("lists sessions, commits an in_progress session, then verifies state change", async () => {
    const { token, csrfToken, csrfCookie } = await loginAdmin();

    // Step 1: GET /api/sessions — verify int-sess-2 appears as in_progress
    const listRes1 = await app.request("/api/sessions?limit=10", {
      headers: authHeaders(token),
    }, env);
    expect(listRes1.status).toBe(200);
    const listData1 = await listRes1.json() as any;

    const inProgressSession = listData1.items.find(
      (s: any) => s.session_id === "int-sess-2"
    );
    expect(inProgressSession).toBeDefined();
    expect(inProgressSession.state).toBe("in_progress");

    // Step 2: POST /api/sessions/int-sess-2/commit
    const commitRes = await app.request("/api/sessions/int-sess-2/commit", {
      method: "POST",
      headers: postHeaders(token, csrfToken, csrfCookie),
      body: JSON.stringify({}),
    }, env);
    expect(commitRes.status).toBe(200);
    const commitData = await commitRes.json() as any;
    expect(commitData.session_id).toBe("int-sess-2");
    expect(commitData.new_state).toBe("committed");
    expect(commitData.pending_dropped).toBe(0);

    // Step 3: GET /api/sessions — verify int-sess-2 is now committed
    const listRes2 = await app.request("/api/sessions?limit=10", {
      headers: authHeaders(token),
    }, env);
    expect(listRes2.status).toBe(200);
    const listData2 = await listRes2.json() as any;

    const committedSession = listData2.items.find(
      (s: any) => s.session_id === "int-sess-2"
    );
    expect(committedSession).toBeDefined();
    expect(committedSession.state).toBe("committed");
  });
});

// ===========================================================================
// Flow 4: Auth → Stats with Seeded Data
// ===========================================================================

describe("Flow 4: Auth → Stats Aggregation", () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await loginAdmin());
  });

  it("GET /api/stats/summary returns counts matching seeded data", async () => {
    const res = await app.request("/api/stats/summary", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    // Movies: at least 3 seeded (other test files may add more in parallel)
    expect(data.total_movies).toBeGreaterThanOrEqual(3);
    // Torrents: at least 3 seeded
    expect(data.total_torrents).toBeGreaterThanOrEqual(3);
    // Sessions: at least 2 seeded
    expect(data.total_runs).toBeGreaterThanOrEqual(2);
    // Success rate: at least one committed session exists
    expect(typeof data.success_rate).toBe("number");
    expect(data.success_rate).toBeGreaterThan(0);
    // avg_duration_seconds comes from committed sessions with CommittedAt
    expect(typeof data.avg_duration_seconds).toBe("number");
    // These tables don't exist in the test env
    expect(data.total_pikpak).toBe(0);
    expect(data.total_dedup_freed_bytes).toBe(0);
    expect(data.proxy_bans_last_7d).toBe(0);
  });

  it("GET /api/stats/trend?metric=runs&period=30d returns data_points array", async () => {
    const res = await app.request("/api/stats/trend?metric=runs&period=30d", {
      headers: authHeaders(token),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.metric).toBe("runs");
    expect(data.period).toBe("30d");
    expect(Array.isArray(data.data_points)).toBe(true);

    // We seeded sessions within the last 30 days
    expect(data.data_points.length).toBeGreaterThan(0);
    for (const dp of data.data_points) {
      expect(typeof dp.date).toBe("string");
      expect(typeof dp.value).toBe("number");
    }
  });
});

// ===========================================================================
// Flow 5: Stub Endpoints Return 501 Consistently
// ===========================================================================

describe("Flow 5: Stub Endpoints Consistency", () => {
  it("all stub endpoints return 501 with consistent error shape", async () => {
    const { token, csrfToken, csrfCookie } = await loginAdmin();

    // POST /api/crawl/index (CSRF required)
    const crawlRes = await app.request("/api/crawl/index", {
      method: "POST",
      headers: postHeaders(token, csrfToken, csrfCookie),
      body: JSON.stringify({}),
    }, env);
    expect(crawlRes.status).toBe(501);
    const crawlData = await crawlRes.json() as any;
    expect(crawlData.error.code).toBe("not_available");
    expect(typeof crawlData.error.message).toBe("string");

    // GET /api/logs/search (no CSRF needed)
    const logsRes = await app.request("/api/logs/search", {
      headers: authHeaders(token),
    }, env);
    expect(logsRes.status).toBe(501);
    const logsData = await logsRes.json() as any;
    expect(logsData.error.code).toBe("not_available");
    expect(typeof logsData.error.message).toBe("string");

    // POST /api/parse/url (CSRF required)
    const parseRes = await app.request("/api/parse/url", {
      method: "POST",
      headers: postHeaders(token, csrfToken, csrfCookie),
      body: JSON.stringify({}),
    }, env);
    expect(parseRes.status).toBe(501);
    const parseData = await parseRes.json() as any;
    expect(parseData.error.code).toBe("not_available");
    expect(typeof parseData.error.message).toBe("string");

    // Verify all share the same error structure
    for (const data of [crawlData, logsData, parseData]) {
      expect(data).toHaveProperty("error");
      expect(data.error).toHaveProperty("code");
      expect(data.error).toHaveProperty("message");
      expect(data.error.code).toBe("not_available");
    }
  });
});
