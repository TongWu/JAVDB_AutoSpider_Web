// server/__tests__/library-routes.test.ts
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

async function seedOutcomes(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS AcquisitionOutcome (
        qb_hash TEXT PRIMARY KEY NOT NULL, href TEXT NOT NULL DEFAULT '',
        video_code TEXT, category TEXT, state TEXT NOT NULL DEFAULT 'queued',
        queued_at TEXT, completed_at TEXT, landed_at TEXT, last_seen_at TEXT, session_id TEXT)`,
    )
    .run();
  await db.batch([
    db.prepare(
      "INSERT INTO AcquisitionOutcome (qb_hash, href, video_code, category, state, queued_at, completed_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind("h1", "/v/a", "AAA-001", "subtitle", "queued", "2026-06-01T00:00:00.000000Z", null, "2026-06-01T00:00:00.000000Z"),
    db.prepare(
      "INSERT INTO AcquisitionOutcome (qb_hash, href, video_code, category, state, queued_at, completed_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind("h3", "/v/c", "CCC-003", "subtitle", "completed", "2026-06-03T00:00:00.000000Z", "2026-06-04T00:00:00.000000Z", "2026-06-04T00:00:00.000000Z"),
  ]);
}

describe("Library acquisition routes", () => {
  beforeAll(async () => {
    await seedOutcomes(env.OPERATIONS_DB);
  });

  it("summary counts by state", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/summary",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, number>;
    expect(body.queued).toBe(1);
    expect(body.completed).toBe(1);
    expect(body.total).toBe(2);
  });

  it("recent filters by state", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/recent?state=completed",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ qb_hash: string }>;
    expect(rows.map((r) => r.qb_hash)).toEqual(["h3"]);
  });

  it("recent rejects an unknown state", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/recent?state=bogus",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("trend rejects a bad period", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/trend?period=5h",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("trend rejects a prototype-key period (no 500)", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/trend?period=__proto__",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const res = await app.request("/api/library/acquisition/summary", {}, env);
    expect(res.status).toBe(401);
  });

  it("trend maps the day field and counts terminal states", async () => {
    const token = await getToken();
    const res = await app.request(
      "/api/library/acquisition/trend?period=90d",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const points = (await res.json()) as Array<{
      date: string; completed: number; stalled: number; failed: number;
    }>;
    const byDate = Object.fromEntries(points.map((p) => [p.date, p]));
    // h3 is completed with last_seen_at 2026-06-04 (within the 90d window)
    expect(byDate["2026-06-04"]?.completed).toBe(1);
    // the handler renames the SQL alias `d` → `date`; assert no raw `d` leaks through
    expect(points.every((p) => "date" in p && !("d" in p))).toBe(true);
  });
});
