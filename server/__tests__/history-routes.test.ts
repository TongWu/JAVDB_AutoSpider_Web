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

async function seedHistory(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS MovieHistory (Id INTEGER PRIMARY KEY AUTOINCREMENT, VideoCode TEXT NOT NULL, Href TEXT NOT NULL UNIQUE, ActorName TEXT, ActorGender TEXT, SupportingActors TEXT, PerfectMatchIndicator INTEGER, HiResIndicator INTEGER, DateTimeCreated TEXT, DateTimeUpdated TEXT, SessionId TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS TorrentHistory (Id INTEGER PRIMARY KEY AUTOINCREMENT, MovieHistoryId INTEGER NOT NULL, MagnetUri TEXT, SubtitleIndicator INTEGER, CensorIndicator INTEGER, ResolutionType INTEGER, Size TEXT, FileCount INTEGER, DateTimeCreated TEXT, SessionId TEXT)").run();
  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind("ABC-001", "/v/abc001", "Actor A", 1, 0, "2026-01-01 10:00:00", "sess-1").run();
  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind("DEF-002", "/v/def002", "Actor B", 0, 1, "2026-01-02 10:00:00", "sess-1").run();
  await db.prepare(
    `INSERT INTO MovieHistory (VideoCode, Href, ActorName, PerfectMatchIndicator, HiResIndicator, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind("GHI-003", "/v/ghi003", "Actor A", 1, 1, "2026-02-01 10:00:00", "sess-2").run();
  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(1, "magnet:?xt=urn:btih:aaa", 1, 1, 3, "2.5GB", 1, "2026-01-01 10:00:00", "sess-1").run();
  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(1, "magnet:?xt=urn:btih:bbb", 0, 1, 4, "5.0GB", 1, "2026-01-01 10:00:00", "sess-1").run();
  await db.prepare(
    `INSERT INTO TorrentHistory (MovieHistoryId, MagnetUri, SubtitleIndicator, CensorIndicator, ResolutionType, Size, FileCount, DateTimeCreated, SessionId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(2, "magnet:?xt=urn:btih:ccc", 1, 0, 3, "3.0GB", 2, "2026-01-02 10:00:00", "sess-1").run();
}

describe("History routes", () => {
  beforeAll(async () => {
    await seedHistory(env.HISTORY_DB);
  });

  it("GET /api/history/movies returns paginated results", async () => {
    const token = await getToken();
    const res = await app.request("/api/history/movies?limit=10", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(3);
    expect(data.items[0].video_code).toBe("ABC-001");
    expect(data.items[0].torrent_count).toBe(2);
  });

  it("filters movies by actor name", async () => {
    const token = await getToken();
    const res = await app.request("/api/history/movies?actor=Actor%20A", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(2);
    expect(data.items.every((m: any) => m.actor_name === "Actor A")).toBe(true);
  });

  it("filters movies by date range", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/history/movies?date_from=2026-01-02&date_to=2026-01-31",
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );
    const data = await res.json() as any;
    expect(data.items).toHaveLength(1);
    expect(data.items[0].video_code).toBe("DEF-002");
  });

  it("GET /api/history/torrents returns joined results", async () => {
    const token = await getToken();
    const res = await app.request("/api/history/torrents?limit=10", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.items).toHaveLength(3);
    expect(data.items[0].movie_video_code).toBe("ABC-001");
  });

  it("GET /api/history/movies/export returns CSV", async () => {
    const token = await getToken();
    const res = await app.request("/api/history/movies/export", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("video_code");
    expect(text).toContain("ABC-001");
  });
});
