import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../app";

async function getToken(): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "testpassword123" }),
  }, env);
  const data = await res.json() as any;
  return data.access_token;
}

async function seedSessions(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportSessions (Id TEXT PRIMARY KEY, ReportType TEXT NOT NULL, ReportDate TEXT NOT NULL, UrlType TEXT, DisplayName TEXT, Url TEXT, StartPage INTEGER, EndPage INTEGER, CsvFilename TEXT NOT NULL, DateTimeCreated TEXT NOT NULL, Status TEXT DEFAULT 'in_progress', RunId TEXT, RunAttempt INTEGER, FailureReason TEXT, WriteMode TEXT DEFAULT 'pending')").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportMovies (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, Href TEXT, VideoCode TEXT, Page INTEGER, Actor TEXT, Rate REAL, CommentNumber INTEGER)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS ReportTorrents (Id INTEGER PRIMARY KEY AUTOINCREMENT, ReportMovieId INTEGER NOT NULL, VideoCode TEXT, MagnetUri TEXT, SubtitleIndicator INTEGER, CensorIndicator INTEGER, ResolutionType INTEGER, Size TEXT, FileCount INTEGER)").run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-001", "daily", "2026-01-01", "report1.csv", "2026-01-01 10:00:00", "committed", "pending", "run-1", 1).run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-002", "daily", "2026-01-02", "report2.csv", "2026-01-02 10:00:00", "committed", "pending", "run-2", 1).run();
  await db.prepare("INSERT INTO ReportSessions (Id, ReportType, ReportDate, CsvFilename, DateTimeCreated, Status, WriteMode, RunId, RunAttempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("sess-003", "adhoc", "2026-01-03", "report3.csv", "2026-01-03 10:00:00", "in_progress", "pending", "run-3", 1).run();
  await db.prepare("INSERT INTO ReportMovies (SessionId, Href, VideoCode, Page, Actor) VALUES (?, ?, ?, ?, ?)").bind("sess-001", "/v/abc", "ABC-001", 1, "Actor A").run();
  await db.prepare("INSERT INTO ReportTorrents (ReportMovieId, VideoCode, MagnetUri) VALUES (?, ?, ?)").bind(1, "ABC-001", "magnet:?xt=urn:btih:xxx").run();
}

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
});
