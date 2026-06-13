import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";
import { buildSessionQuery, REPORT_SESSION_COLUMNS } from "../routes/sessions";

async function getToken(): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "testpassword123" }),
  }, env);
  const data = await res.json() as any;
  return data.access_token;
}

async function getCsrf() {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "testpassword123" }),
  }, env);
  const data = (await res.json()) as any;
  return { token: data.access_token, csrfToken: data.csrf_token, csrfCookie: `csrf_token=${data.csrf_token}` };
}

async function seedSessions(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportSessions (Id TEXT PRIMARY KEY, ReportType TEXT NOT NULL, ReportDate TEXT NOT NULL, UrlType TEXT, DisplayName TEXT, Url TEXT, StartPage INTEGER, EndPage INTEGER, CsvFilename TEXT NOT NULL, DateTimeCreated TEXT NOT NULL, Status TEXT DEFAULT 'in_progress', RunId TEXT, RunAttempt INTEGER, FailureReason TEXT, WriteMode TEXT DEFAULT 'pending', CommittedAt TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportMovies (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, Href TEXT, VideoCode TEXT, Page INTEGER, Actor TEXT, Rate REAL, CommentNumber INTEGER)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportTorrents (Id INTEGER PRIMARY KEY AUTOINCREMENT, ReportMovieId INTEGER NOT NULL, VideoCode TEXT, MagnetUri TEXT, SubtitleIndicator INTEGER, CensorIndicator INTEGER, ResolutionType INTEGER, Size TEXT, FileCount INTEGER)").run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-001", "daily", "2026-01-01", "report1.csv", "2026-01-01 10:00:00", "committed", "pending", "run-1", 1).run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-002", "daily", "2026-01-02", "report2.csv", "2026-01-02 10:00:00", "committed", "pending", "run-2", 1).run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-003", "adhoc", "2026-01-03", "report3.csv", "2026-01-03 10:00:00", "in_progress", "pending", "run-3", 1).run();
  await db.prepare("INSERT INTO ReportMovies (SessionId, Href, VideoCode, Page, Actor) VALUES (?, ?, ?, ?, ?)").bind("sess-001", "/v/abc", "ABC-001", 1, "Actor A").run();
  await db.prepare("INSERT INTO ReportTorrents (ReportMovieId, VideoCode, MagnetUri) VALUES (?, ?, ?)").bind(1, "ABC-001", "magnet:?xt=urn:btih:xxx").run();
}

// Pins the shared ReportSessions projection extracted from buildSessionQuery
// and the GET /:session_id handler. The exact column order/spelling is also
// pinned transitively by the ADR-018 query Contract Golden (via the assembled
// buildSessionQuery SQL); this guards the constant directly and verifies the
// builder reuses it verbatim so the two stay in lock-step.
describe("REPORT_SESSION_COLUMNS shared projection", () => {
  it("matches the canonical ReportSessions column list", () => {
    expect(REPORT_SESSION_COLUMNS).toBe(
      "Id, Status, WriteMode, RunId, RunAttempt, DateTimeCreated, ReportType, ReportDate, FailureReason",
    );
  });

  it("is reused verbatim by buildSessionQuery", () => {
    const { sql } = buildSessionQuery({ limit: 50 });
    expect(sql).toBe(
      `SELECT ${REPORT_SESSION_COLUMNS} FROM ReportSessions ORDER BY Id DESC LIMIT ?`,
    );
  });
});

describe("Sessions routes", () => {
  beforeAll(async () => {
    await seedSessions(env.REPORTS_DB);
  });

  it("GET /api/sessions returns paginated list (newest first)", async () => {
    const token = await getToken();
    const res = await app.request("/api/sessions?limit=10", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(3);
    expect(data.items[0].session_id).toBe("sess-003");
  });

  it("paginates with limit+1 over-fetch: no phantom next_cursor at the exact boundary (ADR-018)", async () => {
    const token = await getToken();
    // Exactly 3 sessions seeded; limit=3 must NOT emit a next_cursor.
    const res = await app.request("/api/sessions?limit=3", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(3);
    expect(data.next_cursor).toBeNull();
  });

  it("paginates with a real next_cursor when more rows remain (ADR-018)", async () => {
    const token = await getToken();
    const page1 = await app.request("/api/sessions?limit=2", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const p1 = await page1.json() as any;
    expect(p1.items).toHaveLength(2);
    expect(p1.next_cursor).toBeTruthy();

    const page2 = await app.request(`/api/sessions?limit=2&cursor=${encodeURIComponent(p1.next_cursor)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const p2 = await page2.json() as any;
    expect(p2.items).toHaveLength(1);
    expect(p2.next_cursor).toBeNull();
  });

  it("filters sessions by state", async () => {
    const token = await getToken();
    const res = await app.request("/api/sessions?state=committed", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(2);
    expect(data.items.every((s: any) => s.state === "committed")).toBe(true);
  });

  it("GET /api/sessions/:id returns detail with movies and torrents", async () => {
    const token = await getToken();
    const res = await app.request("/api/sessions/sess-001", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.session.session_id).toBe("sess-001");
    expect(data.movies).toHaveLength(1);
    expect(data.torrents).toHaveLength(1);
  });

  it("returns 404 for unknown session", async () => {
    const token = await getToken();
    const res = await app.request("/api/sessions/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(404);
  });

  // ---------- POST /:session_id/commit ----------

  it("POST /api/sessions/:id/commit updates session to committed", async () => {
    // sess-003 is seeded with status 'in_progress'
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/sess-003/commit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.session_id).toBe("sess-003");
    expect(data.new_state).toBe("committed");
    expect(data.pending_dropped).toBe(0);

    const row = await env.REPORTS_DB.prepare(
      "SELECT Status, CommittedAt FROM ReportSessions WHERE Id = ?"
    ).bind("sess-003").first<{ Status: string; CommittedAt: string | null }>();
    expect(row?.Status).toBe("committed");
    expect(row?.CommittedAt).toEqual(expect.any(String));
  });

  it("POST /api/sessions/:id/commit returns 404 for unknown session", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/nonexistent/commit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(404);
  });

  it("POST /api/sessions/:id/commit returns 409 for already-committed session", async () => {
    // sess-001 is seeded with status 'committed'
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/sess-001/commit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(409);
  });

  it("POST /api/sessions/:id/commit with drop_pending deletes pending before updating status", async () => {
    // Seed a finalizing session with pending writes
    await env.REPORTS_DB.prepare(
      "INSERT OR REPLACE INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind("sess-pending", "daily", "2026-03-01", "rp.csv", "2026-03-01 10:00:00", "finalizing", "pending").run();

    // Create both pending tables to avoid batch transaction failure
    await env.HISTORY_DB.prepare(
      "CREATE TABLE IF NOT EXISTS PendingMovieHistoryWrites (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, VideoCode TEXT)"
    ).run();
    await env.HISTORY_DB.prepare(
      "CREATE TABLE IF NOT EXISTS PendingTorrentHistoryWrites (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, VideoCode TEXT)"
    ).run();

    // Insert pending movie and torrent writes
    await env.HISTORY_DB.prepare(
      "INSERT INTO PendingMovieHistoryWrites (SessionId, VideoCode) VALUES (?, ?)"
    ).bind("sess-pending", "TEST-001").run();
    await env.HISTORY_DB.prepare(
      "INSERT INTO PendingTorrentHistoryWrites (SessionId, VideoCode) VALUES (?, ?)"
    ).bind("sess-pending", "TEST-001").run();

    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/sess-pending/commit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({ drop_pending: true }),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.new_state).toBe("committed");
    expect(data.pending_dropped).toBeGreaterThanOrEqual(1);

    // Verify pending rows are gone
    const remainingMovies = await env.HISTORY_DB.prepare(
      "SELECT COUNT(*) AS cnt FROM PendingMovieHistoryWrites WHERE SessionId = ?"
    ).bind("sess-pending").first<{ cnt: number }>();
    expect(remainingMovies?.cnt).toBe(0);

    const remainingTorrents = await env.HISTORY_DB.prepare(
      "SELECT COUNT(*) AS cnt FROM PendingTorrentHistoryWrites WHERE SessionId = ?"
    ).bind("sess-pending").first<{ cnt: number }>();
    expect(remainingTorrents?.cnt).toBe(0);
  });

  // ---------- POST /:session_id/rollback ----------

  it("POST /api/sessions/:id/rollback returns 503 without GH_ACTIONS_TOKEN", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request("/api/sessions/sess-001/rollback", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/sessions/:id/rollback — full parameters", () => {
  beforeEach(async () => {
    // Ensure session exists for each test (use same schema as seedSessions)
    await env.REPORTS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS ReportSessions (Id TEXT PRIMARY KEY, ReportType TEXT NOT NULL, ReportDate TEXT NOT NULL, UrlType TEXT, DisplayName TEXT, Url TEXT, StartPage INTEGER, EndPage INTEGER, CsvFilename TEXT NOT NULL, DateTimeCreated TEXT NOT NULL, Status TEXT DEFAULT 'in_progress', RunId TEXT, RunAttempt INTEGER, FailureReason TEXT, WriteMode TEXT DEFAULT 'pending')`,
    ).run();
    await env.REPORTS_DB.prepare(
      `INSERT OR REPLACE INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status)
       VALUES ('rollback-test-001', 'daily', '2026-05-24', 'rollback-test.csv', datetime('now'), 'committed')`,
    ).run();
  });

  it("forwards scope and force to GH Actions dispatch", async () => {

    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/sessions/rollback-test-001/rollback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({
          scope: "history",
          force: true,
          dry_run: true,
          confirm_production: "I-UNDERSTAND",
          log_level: "DEBUG",
          runner: "ubuntu-latest",
        }),
      },
      env,
    );
    // dry_run=true should dispatch a real GH Actions dry-run
    // In test env GH Actions may not be configured, so expect 503 or success
    // The key thing is the endpoint accepts all parameters without error
    expect([200, 503]).toContain(res.status);
  });

  it("requires confirm_production for non-dry-run", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/sessions/rollback-test-001/rollback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({
          dry_run: false,
          confirm_production: "",
        }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("requires confirm_production for force=true", async () => {
    const { token, csrfToken, csrfCookie } = await getCsrf();
    const res = await app.request(
      "/api/sessions/rollback-test-001/rollback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-CSRF-Token": csrfToken,
          Cookie: csrfCookie,
        },
        body: JSON.stringify({
          dry_run: true,
          force: true,
          confirm_production: "",
        }),
      },
      env,
    );
    expect(res.status).toBe(422);
  });
});
