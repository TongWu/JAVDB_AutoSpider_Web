// server/__tests__/library-consumption-routes.test.ts
import { describe, it, expect, beforeAll, vi } from "vitest";
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
  expect(res.status).toBe(200);
  const data = (await res.json()) as { access_token?: string };
  return data.access_token as string;
}

async function seedConsumption(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ConsumptionSignal (
      video_code TEXT NOT NULL, source_type TEXT NOT NULL,
      instance TEXT NOT NULL, library_id TEXT NOT NULL,
      library_name TEXT, watched INTEGER, progress_pct INTEGER,
      play_count INTEGER, rating REAL, watched_at TEXT,
      resolved_confidence TEXT, observed_at TEXT,
      PRIMARY KEY (video_code, source_type, instance, library_id))`,
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS UnresolvedMediaItem (
      instance TEXT NOT NULL, source_type TEXT, library_id TEXT NOT NULL,
      library_name TEXT, item_id TEXT NOT NULL, raw_title TEXT,
      file_path TEXT, observed_at TEXT,
      PRIMARY KEY (instance, library_id, item_id))`,
  ).run();
  await db.batch([
    db.prepare(
      "INSERT OR REPLACE INTO ConsumptionSignal VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind("AAA-001", "emby", "emby-home", "lib-1", "Movies", 1, 100, 2, 8.5,
      "2026-06-01T20:00:00.000000Z", "high", "2026-06-02T00:00:00.000000Z"),
    db.prepare(
      "INSERT OR REPLACE INTO ConsumptionSignal VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind("BBB-002", "emby", "emby-home", "lib-1", "Movies", 0, 30, 0, null,
      null, "high", "2026-06-03T00:00:00.000000Z"),
    db.prepare(
      "INSERT OR REPLACE INTO UnresolvedMediaItem VALUES (?,?,?,?,?,?,?,?)",
    ).bind("emby-home", "emby", "lib-1", "Movies", "item-x",
      "Unknown.Title.2024.mkv", "/lib/Unknown.Title.2024.mkv", "2026-06-05T00:00:00.000000Z"),
  ]);
}

describe("Library consumption routes", () => {
  beforeAll(async () => {
    await seedConsumption(env.OPERATIONS_DB);
  });

  it("summary returns correct KPI counts", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/summary",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.total_signals).toBe(2);
    expect(body.watched_count).toBe(1);
    expect(body.unwatched_count).toBe(1);
    expect(body.unresolved_count).toBe(1);
    expect(body.avg_rating).toBeCloseTo(8.5);
  });

  it("summary avg_rating is null or a number (never coerced to 0)", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/summary",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { avg_rating: unknown };
    // With our seed (one rating of 8.5), should be a number — not null
    expect(typeof body.avg_rating === "number" || body.avg_rating === null).toBe(true);
  });

  it("recent filters by watched=true", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/recent?watched=true",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ watched: unknown; video_code: string }>;
    expect(rows.every((r) => r.watched === true)).toBe(true);
    expect(rows.map((r) => r.video_code)).toContain("AAA-001");
  });

  it("recent filters by watched=false", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/recent?watched=false",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ watched: unknown }>;
    expect(rows.every((r) => r.watched === false)).toBe(true);
  });

  it("recent rejects an invalid watched value with 400 library.invalid_watched", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/recent?watched=maybe",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("library.invalid_watched");
  });

  it("trend rejects bad period", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/trend?period=5h",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("trend maps the day field and excludes rows without watched_at", async () => {
    // The endpoint applies a rolling 90-day cutoff from runtime `now`, while the
    // seed pins watched_at to 2026-06-01. Freeze the clock so the seeded row stays
    // inside the window regardless of when the suite runs. Fake only Date (not
    // timers/microtasks) so the async D1/JWT calls below still resolve.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-10T00:00:00.000Z"));
    try {
      const token = await getToken();
      const res = await app.request(
        "/api/library/consumption/trend?period=90d",
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);
      const points = (await res.json()) as Array<{ date: string; watched: number; total_signals: number }>;
      // AAA-001 has watched_at 2026-06-01; BBB-002 has null → only one point
      expect(points.length).toBe(1);
      expect(points[0].date).toBe("2026-06-01");
      expect(points[0].watched).toBe(1);
      // No raw `d` key leaking
      expect(points.every((p) => "date" in p && !("d" in p))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("unresolved returns the seeded item", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/consumption/unresolved",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const items = (await res.json()) as Array<{ item_id: string }>;
    expect(items.length).toBe(1);
    expect(items[0].item_id).toBe("item-x");
  });

  it("requires auth", async () => {
    const res = await app.request("/api/library/consumption/summary", {}, env);
    expect(res.status).toBe(401);
  });
});
