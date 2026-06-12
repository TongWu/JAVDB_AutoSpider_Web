// server/__tests__/library-ownership-routes.test.ts
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
  expect(res.status).toBe(200);
  const data = (await res.json()) as { access_token?: string };
  expect(typeof data.access_token).toBe("string");
  return data.access_token as string;
}

async function seedOwnership(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS OwnershipLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_code TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
        path TEXT, size INTEGER, present INTEGER NOT NULL DEFAULT 1,
        observed_at TEXT,
        UNIQUE(video_code, source, category))`,
    )
    .run();
  await db.batch([
    db.prepare(
      "INSERT OR REPLACE INTO OwnershipLedger (video_code, source, category, path, size, present, observed_at) VALUES (?,?,?,?,?,?,?)",
    ).bind("AAA-001", "qb", "subtitle", "/dl/AAA-001.mkv", 2147483648, 1, "2026-06-01T00:00:00.000000Z"),
    db.prepare(
      "INSERT OR REPLACE INTO OwnershipLedger (video_code, source, category, path, size, present, observed_at) VALUES (?,?,?,?,?,?,?)",
    ).bind("CCC-003", "gdrive", "subtitle", "/gd/CCC-003.mkv", 4294967296, 1, "2026-06-03T00:00:00.000000Z"),
    db.prepare(
      "INSERT OR REPLACE INTO OwnershipLedger (video_code, source, category, path, size, present, observed_at) VALUES (?,?,?,?,?,?,?)",
    ).bind("DDD-004", "nas", "subtitle", "/nas/DDD-004.mkv", 2000000000, 0, "2026-05-30T00:00:00.000000Z"),
  ]);
}

describe("Library ownership routes", () => {
  beforeAll(async () => {
    await seedOwnership(env.OPERATIONS_DB);
  });

  it("summary returns total_owned_titles and by_source breakdown", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/ownership/summary",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total_owned_titles: number;
      by_source: Array<{ source: string; unique_titles: number; present_rows: number; total_bytes: number }>;
    };
    // DDD-004 present=0 excluded → 2 distinct titles (AAA-001 + CCC-003)
    expect(body.total_owned_titles).toBe(2);
    const bySource = Object.fromEntries(body.by_source.map((s) => [s.source, s]));
    expect(bySource["qb"].unique_titles).toBe(1);
    expect(bySource["gdrive"].unique_titles).toBe(1);
    // nas row is present=0 → not in by_source
    expect(bySource["nas"]).toBeUndefined();
  });

  it("recent returns rows newest-first with all expected keys", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/ownership/recent",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const keys = Object.keys(rows[0]);
    for (const k of ["video_code", "source", "category", "path", "size", "present", "observed_at"]) {
      expect(keys).toContain(k);
    }
    // Newest-first: observed_at must be non-increasing across adjacent rows.
    const observedAt = rows.map((r) => r.observed_at as string);
    for (let i = 1; i < observedAt.length; i++) {
      expect(observedAt[i - 1] >= observedAt[i]).toBe(true);
    }
  });

  it("recent filters by source", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/ownership/recent?source=qb",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ source: string }>;
    expect(rows.every((r) => r.source === "qb")).toBe(true);
  });

  it("recent rejects an unknown source", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/ownership/recent?source=unknown_src",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const res = await app.request("/api/library/ownership/summary", {}, env);
    expect(res.status).toBe(401);
  });
});
